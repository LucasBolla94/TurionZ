// ============================================================
// TurionZ — SelfImprover (Weekly Auto-Analysis Engine)
// Created by BollaNetwork
//
// Full 5-step self-improvement cycle:
// 1. COLLECT — conversations, activity logs, errors from past 7 days
// 2. FRAGMENT — split large datasets into ~20k token chunks
// 3. ANALYZE — cheap model via OpenRouter extracts lessons
// 4. VERIFY — compare this week vs last week for previous changes
// 5. APPLY — save lessons, update MEMORY.md, log everything
//
// Runs automatically every Sunday at 3AM (configurable).
// Scheduling survives restarts via recovery_state table.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { Database } from '../infra/database';
import { SchemaManager } from '../infra/SchemaManager';
import { ActivityLogger } from '../infra/ActivityLogger';
import { ILlmProvider } from '../providers/ILlmProvider';
import { ProviderFactory } from '../providers/ProviderFactory';
import {
  Lesson,
  LessonCategory,
  WeeklyReport,
  ChangeVerification,
  ChangeVerdict,
} from '../types';

const MEMORY_FILE = path.join(process.cwd(), '.agents', 'MEMORY.md');
const MAX_MEMORY_LESSONS = 20;
const MAX_FRAGMENT_TOKENS = 20000;
const CHARS_PER_TOKEN = 4;
const MAX_FRAGMENT_CHARS = MAX_FRAGMENT_TOKENS * CHARS_PER_TOKEN;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_ANALYSIS_MODEL = 'meta-llama/llama-3.1-8b-instruct';
const RECOVERY_COMPONENT = 'self_improver:weekly';

export class SelfImprover {
  private static instance: SelfImprover;
  private db: Database;
  private activityLogger: ActivityLogger;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private analysisModel: string;
  private running: boolean = false;

  private constructor() {
    this.db = Database.getInstance();
    this.activityLogger = ActivityLogger.getInstance();
    this.analysisModel = process.env.ANALYSIS_MODEL || DEFAULT_ANALYSIS_MODEL;
  }

  static getInstance(): SelfImprover {
    if (!SelfImprover.instance) {
      SelfImprover.instance = new SelfImprover();
    }
    return SelfImprover.instance;
  }

  // --- Scheduling ---

  /**
   * Start the weekly scheduler.
   * Checks every hour: is it Sunday, 3AM, and hasn't run this week?
   * Tracks last run date in recovery_state to survive restarts.
   */
  scheduleWeeklyAnalysis(): void {
    console.log('[SelfImprover] Weekly analysis scheduler started.');

    this.intervalId = setInterval(async () => {
      try {
        await this.checkAndRun();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[SelfImprover] Scheduler check failed: ${errMsg}`);
      }
    }, CHECK_INTERVAL_MS);

    // Don't prevent process exit
    if (this.intervalId && typeof this.intervalId === 'object' && 'unref' in this.intervalId) {
      (this.intervalId as NodeJS.Timeout).unref();
    }
  }

  /**
   * Stop the scheduler and cancel pending timer.
   */
  stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[SelfImprover] Scheduler stopped.');
    }
  }

  private async checkAndRun(): Promise<void> {
    const now = new Date();
    const targetHour = parseInt(process.env.ANALYSIS_HOUR || '3', 10);

    // Sunday = 0, check at target hour (default 3 AM)
    if (now.getDay() !== 0 || now.getHours() !== targetHour) return;

    // Check if already ran this week
    const lastRunDate = await this.getLastRunDate();
    if (lastRunDate) {
      const daysSinceLastRun = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastRun < 6) {
        return; // Already ran this week
      }
    }

    // Run analysis
    await this.runAnalysis();
  }

  // --- Main Analysis Cycle ---

  /**
   * Full 5-step self-improvement cycle.
   * Can be called manually or by scheduler.
   */
  async runAnalysis(): Promise<WeeklyReport> {
    if (this.running) {
      console.log('[SelfImprover] Analysis already in progress. Skipping.');
      return this.emptyReport();
    }

    this.running = true;
    const startTime = Date.now();

    console.log('[SelfImprover] Starting weekly analysis...');

    try {
      if (!this.db.isConnected()) {
        console.warn('[SelfImprover] Database not connected. Skipping analysis.');
        return this.emptyReport();
      }

      // Ensure required tables exist
      await SchemaManager.getInstance().ensureTables(
        'lessons_learned', 'weekly_reports', 'recovery_state'
      );

      // STEP 1: COLLECT
      await this.activityLogger.logSystemEvent('self_improver', 'step_collect_start');
      const collected = await this.collectData();

      if (collected.conversations.length === 0 && collected.activityLogs.length === 0) {
        console.log('[SelfImprover] No data to analyze this week.');
        await this.saveLastRunDate();
        return this.emptyReport();
      }

      console.log(
        `[SelfImprover] Collected: ${collected.conversations.length} messages, ` +
        `${collected.activityLogs.length} activity logs, ${collected.errors.length} errors.`
      );

      // STEP 2: FRAGMENT
      const fullText = this.buildAnalysisText(collected);
      const fragments = this.fragment(fullText);
      console.log(`[SelfImprover] Fragmented into ${fragments.length} chunk(s).`);

      // STEP 3: ANALYZE
      let provider: ILlmProvider;
      try {
        provider = ProviderFactory.createForSubAgent(this.analysisModel);
      } catch {
        console.warn('[SelfImprover] Could not create analysis provider. Skipping.');
        await this.saveLastRunDate();
        return this.emptyReport();
      }

      await this.activityLogger.logSystemEvent('self_improver', 'step_analyze_start', {
        fragments: fragments.length,
        model: this.analysisModel,
      });

      const allLessons: Lesson[] = [];
      let errorsFound = 0;
      let totalTokensUsed = 0;

      for (let i = 0; i < fragments.length; i++) {
        try {
          const result = await this.analyzeFragment(provider, fragments[i], i + 1, fragments.length);
          allLessons.push(...result.lessons);
          errorsFound += result.errorsFound;
          totalTokensUsed += result.tokensUsed;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[SelfImprover] Fragment ${i + 1} analysis failed: ${errMsg}`);
        }
      }

      // STEP 4: VERIFY PREVIOUS CHANGES
      await this.activityLogger.logSystemEvent('self_improver', 'step_verify_start');
      const verifications = await this.verifyPreviousChanges(provider);

      // Apply verdicts (revert harmful)
      for (const v of verifications) {
        await this.applyVerdict(v);
      }

      // STEP 5: APPLY
      await this.activityLogger.logSystemEvent('self_improver', 'step_apply_start', {
        lessonsCount: allLessons.length,
      });

      // Save lessons to DB
      for (const lesson of allLessons) {
        await this.saveLesson(lesson);
      }

      // Update MEMORY.md
      this.updateMemoryFile(allLessons);

      // Build and save weekly report
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);

      const report: WeeklyReport = {
        weekStart,
        weekEnd: now,
        conversationsAnalyzed: collected.conversations.length,
        errorsFound,
        lessonsGenerated: allLessons.length,
        changesApplied: allLessons.map(l => ({ category: l.category, lesson: l.lesson })),
        previousChangesVerified: verifications,
        modelUsed: this.analysisModel,
        tokensUsed: totalTokensUsed,
      };

      await this.saveWeeklyReport(report);
      await this.saveLastRunDate();

      const duration = Date.now() - startTime;

      await this.activityLogger.logSystemEvent('self_improver', 'analysis_complete', {
        lessons: allLessons.length,
        errors: errorsFound,
        verifications: verifications.length,
        durationMs: duration,
        tokensUsed: totalTokensUsed,
      });

      console.log(
        `[SelfImprover] Analysis complete in ${duration}ms: ` +
        `${allLessons.length} lessons, ${errorsFound} errors, ${verifications.length} verifications.`
      );

      return report;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SelfImprover] Analysis failed: ${errMsg}`);
      await this.activityLogger.logSystemEvent('self_improver', 'analysis_error', {
        error: errMsg,
      });
      return this.emptyReport();
    } finally {
      this.running = false;
    }
  }

  // --- Query Methods ---

  /**
   * Returns the most recent weekly report.
   */
  async getLastReport(): Promise<WeeklyReport | null> {
    if (!this.db.isConnected()) return null;

    await SchemaManager.getInstance().ensureTable('weekly_reports');

    const row = await this.db.queryOne<{
      id: string;
      week_start: Date;
      week_end: Date;
      conversations_analyzed: number;
      errors_found: number;
      lessons_generated: number;
      changes_applied: string;
      previous_changes_verified: string;
      model_used: string;
      tokens_used: number;
      created_at: Date;
    }>(
      `SELECT * FROM weekly_reports ORDER BY created_at DESC LIMIT 1`
    );

    if (!row) return null;

    return {
      id: row.id,
      weekStart: new Date(row.week_start),
      weekEnd: new Date(row.week_end),
      conversationsAnalyzed: row.conversations_analyzed,
      errorsFound: row.errors_found,
      lessonsGenerated: row.lessons_generated,
      changesApplied: typeof row.changes_applied === 'string'
        ? JSON.parse(row.changes_applied)
        : row.changes_applied || [],
      previousChangesVerified: typeof row.previous_changes_verified === 'string'
        ? JSON.parse(row.previous_changes_verified)
        : row.previous_changes_verified || [],
      modelUsed: row.model_used,
      tokensUsed: row.tokens_used || 0,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Query lessons by category (optional filter).
   */
  async getLessons(category?: LessonCategory): Promise<Lesson[]> {
    if (!this.db.isConnected()) return [];

    await SchemaManager.getInstance().ensureTable('lessons_learned');

    let sql = `SELECT id, category, lesson, source_conversations as "sourceConversations",
               applied_changes as "appliedChanges", applied_at as "appliedAt",
               was_beneficial as "wasBeneficial", verified_at as "verifiedAt",
               reverted, created_at as "createdAt"
               FROM lessons_learned WHERE reverted = FALSE`;
    const params: unknown[] = [];

    if (category) {
      sql += ` AND category = $1`;
      params.push(category);
    }

    sql += ` ORDER BY created_at DESC LIMIT 50`;

    return this.db.query<Lesson>(sql, params);
  }

  /**
   * Get recent lessons formatted for injection into system prompt context.
   * Returns the most relevant non-reverted lessons.
   */
  async getLessonsForContext(limit: number = 10): Promise<string> {
    if (!this.db.isConnected()) return '';

    await SchemaManager.getInstance().ensureTable('lessons_learned');

    const lessons = await this.db.query<{ category: string; lesson: string }>(
      `SELECT category, lesson FROM lessons_learned
       WHERE reverted = FALSE AND was_beneficial IS NOT FALSE
       ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );

    if (lessons.length === 0) return '';

    const lines = lessons.map(l => `- [${l.category}] ${l.lesson}`);
    return `\n## Lessons Learned (from weekly self-analysis)\n${lines.join('\n')}`;
  }

  // --- STEP 1: COLLECT ---

  private async collectData(): Promise<{
    conversations: { role: string; content: string; createdAt: Date }[];
    activityLogs: { component: string; action: string; details: string; createdAt: Date }[];
    errors: { action: string; details: string; createdAt: Date }[];
    previousChanges: { id: string; lesson: string; appliedAt: Date }[];
  }> {
    // Conversations from last 7 days
    const conversations = await this.db.query<{
      role: string; content: string; created_at: Date;
    }>(
      `SELECT m.role, m.content, m.created_at
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE m.created_at > NOW() - INTERVAL '7 days'
       ORDER BY m.created_at ASC`
    ).then(rows => rows.map(r => ({
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    })));

    // Activity logs from last 7 days
    let activityLogs: { component: string; action: string; details: string; createdAt: Date }[] = [];
    try {
      await SchemaManager.getInstance().ensureTable('activity_logs');
      const logRows = await this.db.query<{
        component: string; action: string; details: unknown; created_at: Date;
      }>(
        `SELECT component, action, details, created_at
         FROM activity_logs
         WHERE created_at > NOW() - INTERVAL '7 days'
         ORDER BY created_at ASC
         LIMIT 1000`
      );
      activityLogs = logRows.map(r => ({
        component: r.component,
        action: r.action,
        details: typeof r.details === 'string' ? r.details : JSON.stringify(r.details),
        createdAt: r.created_at,
      }));
    } catch {
      // Table may not exist yet
    }

    // Errors from activity logs
    let errors: { action: string; details: string; createdAt: Date }[] = [];
    try {
      const errorRows = await this.db.query<{
        action: string; details: unknown; created_at: Date;
      }>(
        `SELECT action, details, created_at
         FROM activity_logs
         WHERE created_at > NOW() - INTERVAL '7 days'
         AND (action LIKE '%error%' OR action LIKE '%fail%')
         ORDER BY created_at ASC
         LIMIT 200`
      );
      errors = errorRows.map(r => ({
        action: r.action,
        details: typeof r.details === 'string' ? r.details : JSON.stringify(r.details),
        createdAt: r.created_at,
      }));
    } catch {
      // Non-fatal
    }

    // Previous week's applied changes
    let previousChanges: { id: string; lesson: string; appliedAt: Date }[] = [];
    try {
      const changeRows = await this.db.query<{
        id: string; lesson: string; applied_at: Date;
      }>(
        `SELECT id, lesson, applied_at
         FROM lessons_learned
         WHERE applied_at > NOW() - INTERVAL '14 days'
         AND was_beneficial IS NULL
         AND reverted = FALSE`
      );
      previousChanges = changeRows.map(r => ({
        id: r.id,
        lesson: r.lesson,
        appliedAt: r.applied_at,
      }));
    } catch {
      // Non-fatal
    }

    return { conversations, activityLogs, errors, previousChanges };
  }

  // --- STEP 2: FRAGMENT ---

  private buildAnalysisText(collected: {
    conversations: { role: string; content: string }[];
    activityLogs: { component: string; action: string; details: string }[];
    errors: { action: string; details: string }[];
  }): string {
    const parts: string[] = [];

    if (collected.conversations.length > 0) {
      parts.push('=== CONVERSATIONS ===');
      for (const c of collected.conversations) {
        parts.push(`[${c.role}] ${c.content}`);
      }
    }

    if (collected.errors.length > 0) {
      parts.push('\n=== ERRORS ===');
      for (const e of collected.errors) {
        parts.push(`[${e.action}] ${e.details}`);
      }
    }

    if (collected.activityLogs.length > 0) {
      parts.push('\n=== ACTIVITY SUMMARY ===');
      // Summarize activity logs (don't include all details to save tokens)
      const actionCounts: Record<string, number> = {};
      for (const log of collected.activityLogs) {
        const key = `${log.component}:${log.action}`;
        actionCounts[key] = (actionCounts[key] || 0) + 1;
      }
      for (const [key, count] of Object.entries(actionCounts)) {
        parts.push(`${key}: ${count} times`);
      }
    }

    return parts.join('\n');
  }

  private fragment(text: string): string[] {
    if (text.length <= MAX_FRAGMENT_CHARS) {
      return [text];
    }

    const fragments: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_FRAGMENT_CHARS) {
        fragments.push(remaining);
        break;
      }

      // Find a good split point (double newline boundary)
      let splitAt = remaining.lastIndexOf('\n\n', MAX_FRAGMENT_CHARS);
      if (splitAt < MAX_FRAGMENT_CHARS * 0.5) {
        splitAt = MAX_FRAGMENT_CHARS;
      }

      fragments.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trim();
    }

    return fragments;
  }

  // --- STEP 3: ANALYZE ---

  private async analyzeFragment(
    provider: ILlmProvider,
    fragment: string,
    index: number,
    total: number
  ): Promise<{ lessons: Lesson[]; errorsFound: number; tokensUsed: number }> {
    const response = await provider.chat([
      {
        role: 'system',
        content: `You are analyzing conversation logs and activity data for TurionZ weekly self-improvement review (fragment ${index}/${total}).

Analyze the data and identify:
1. Mistakes the agent made
2. User corrections or manual fixes
3. Repeating patterns (good or bad)
4. User preferences expressed
5. Successful strategies worth repeating
6. Technical issues or errors

Categorize each finding as: technical, preference, pattern, tool, or communication.

Respond ONLY in valid JSON format:
{
  "lessons": [
    {"category": "technical|preference|pattern|tool|communication", "lesson": "concise actionable description"}
  ],
  "errorsFound": number
}`,
      },
      {
        role: 'user',
        content: fragment,
      },
    ]);

    const tokensUsed = (response.tokensIn || 0) + (response.tokensOut || 0);

    if (!response.content) {
      return { lessons: [], errorsFound: 0, tokensUsed };
    }

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { lessons: [], errorsFound: 0, tokensUsed };

      const parsed = JSON.parse(jsonMatch[0]);
      const lessons: Lesson[] = (Array.isArray(parsed.lessons) ? parsed.lessons : [])
        .filter((l: any) => l.category && l.lesson)
        .map((l: any) => ({
          category: l.category as LessonCategory,
          lesson: String(l.lesson),
        }));

      return {
        lessons,
        errorsFound: typeof parsed.errorsFound === 'number' ? parsed.errorsFound : 0,
        tokensUsed,
      };
    } catch {
      return { lessons: [], errorsFound: 0, tokensUsed };
    }
  }

  // --- STEP 4: VERIFY PREVIOUS CHANGES ---

  private async verifyPreviousChanges(provider: ILlmProvider): Promise<ChangeVerification[]> {
    const previousLessons = await this.db.query<{
      id: string; lesson: string; category: string; applied_at: Date;
    }>(
      `SELECT id, lesson, category, applied_at FROM lessons_learned
       WHERE applied_at > NOW() - INTERVAL '14 days'
       AND was_beneficial IS NULL
       AND reverted = FALSE`
    );

    if (previousLessons.length === 0) return [];

    // Get this week's error count vs last week
    let thisWeekErrors = 0;
    let lastWeekErrors = 0;
    try {
      const thisWeek = await this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM activity_logs
         WHERE created_at > NOW() - INTERVAL '7 days'
         AND (action LIKE '%error%' OR action LIKE '%fail%')`
      );
      const lastWeek = await this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM activity_logs
         WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
         AND (action LIKE '%error%' OR action LIKE '%fail%')`
      );
      thisWeekErrors = parseInt(thisWeek?.count || '0', 10);
      lastWeekErrors = parseInt(lastWeek?.count || '0', 10);
    } catch {
      // Non-fatal — activity_logs may not exist
    }

    // Ask cheap model to evaluate each change
    const lessonsText = previousLessons.map(l =>
      `- [${l.category}] ${l.lesson} (applied ${new Date(l.applied_at).toISOString().split('T')[0]})`
    ).join('\n');

    const verifications: ChangeVerification[] = [];

    try {
      const response = await provider.chat([
        {
          role: 'system',
          content: `You are verifying whether previous self-improvement changes were beneficial.

Context:
- Errors this week: ${thisWeekErrors}
- Errors last week: ${lastWeekErrors}
- Error trend: ${thisWeekErrors < lastWeekErrors ? 'improving' : thisWeekErrors > lastWeekErrors ? 'worsening' : 'stable'}

For each change below, determine if it was: beneficial (keep), harmful (revert), or neutral (keep one more week).

Respond ONLY in valid JSON:
{
  "verifications": [
    {"lessonId": "id", "verdict": "beneficial|harmful|neutral", "reason": "brief explanation"}
  ]
}`,
        },
        {
          role: 'user',
          content: `Changes applied last week:\n${lessonsText}`,
        },
      ]);

      if (response.content) {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.verifications)) {
            for (const v of parsed.verifications) {
              // Match by index since model may not return exact UUIDs
              const lessonIdx = previousLessons.findIndex(l => l.id === v.lessonId);
              const lesson = lessonIdx >= 0 ? previousLessons[lessonIdx] : null;
              if (lesson) {
                verifications.push({
                  lessonId: lesson.id,
                  lesson: lesson.lesson,
                  verdict: (['beneficial', 'harmful', 'neutral'].includes(v.verdict)
                    ? v.verdict
                    : 'neutral') as ChangeVerdict,
                  reason: String(v.reason || ''),
                });
              }
            }
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[SelfImprover] Verification analysis failed: ${errMsg}`);
    }

    // For any lessons not verified by the model, mark as neutral
    for (const lesson of previousLessons) {
      if (!verifications.find(v => v.lessonId === lesson.id)) {
        verifications.push({
          lessonId: lesson.id,
          lesson: lesson.lesson,
          verdict: 'neutral',
          reason: 'Could not determine impact — keeping one more week.',
        });
      }
    }

    return verifications;
  }

  private async applyVerdict(verification: ChangeVerification): Promise<void> {
    switch (verification.verdict) {
      case 'beneficial':
        await this.db.execute(
          `UPDATE lessons_learned SET was_beneficial = TRUE, verified_at = NOW() WHERE id = $1`,
          [verification.lessonId]
        );
        break;

      case 'harmful':
        await this.db.execute(
          `UPDATE lessons_learned SET was_beneficial = FALSE, verified_at = NOW(), reverted = TRUE WHERE id = $1`,
          [verification.lessonId]
        );
        // Remove from MEMORY.md if present
        this.removeLessonFromMemory(verification.lesson);
        console.log(`[SelfImprover] Reverted harmful change: ${verification.lesson}`);
        break;

      case 'neutral':
        // Keep one more week — don't update was_beneficial yet
        await this.db.execute(
          `UPDATE lessons_learned SET verified_at = NOW() WHERE id = $1`,
          [verification.lessonId]
        );
        break;
    }
  }

  // --- STEP 5: APPLY ---

  private async saveLesson(lesson: Lesson): Promise<void> {
    await this.db.execute(
      `INSERT INTO lessons_learned (category, lesson, applied_at)
       VALUES ($1, $2, NOW())`,
      [lesson.category, lesson.lesson]
    );
  }

  private async saveWeeklyReport(report: WeeklyReport): Promise<void> {
    await this.db.execute(
      `INSERT INTO weekly_reports (week_start, week_end, conversations_analyzed, errors_found,
       lessons_generated, changes_applied, previous_changes_verified, model_used, tokens_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        report.weekStart.toISOString().split('T')[0],
        report.weekEnd.toISOString().split('T')[0],
        report.conversationsAnalyzed,
        report.errorsFound,
        report.lessonsGenerated,
        JSON.stringify(report.changesApplied),
        JSON.stringify(report.previousChangesVerified),
        report.modelUsed,
        report.tokensUsed,
      ]
    );
  }

  private updateMemoryFile(lessons: Lesson[]): void {
    if (lessons.length === 0) return;

    try {
      // Ensure .agents directory exists
      const dir = path.dirname(MEMORY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let content = '';
      if (fs.existsSync(MEMORY_FILE)) {
        content = fs.readFileSync(MEMORY_FILE, 'utf8');
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const newLessons = lessons
        .map(l => `- [${dateStr}] [${l.category}] ${l.lesson}`)
        .join('\n');

      const marker = '## Lessons Learned';
      if (content.includes(marker)) {
        // Extract existing lessons
        const markerIdx = content.indexOf(marker);
        const nextSectionIdx = content.indexOf('\n## ', markerIdx + marker.length);
        const sectionEnd = nextSectionIdx >= 0 ? nextSectionIdx : content.length;
        const existingSection = content.substring(markerIdx, sectionEnd);

        // Count existing lesson lines
        const existingLines = existingSection.split('\n').filter(l => l.startsWith('- ['));

        // Trim to max entries (keep newest)
        const allLines = [...newLessons.split('\n'), ...existingLines];
        const trimmedLines = allLines.slice(0, MAX_MEMORY_LESSONS);

        const newSection = `${marker}\n(Updated automatically by weekly self-analysis)\n${trimmedLines.join('\n')}\n`;
        content = content.substring(0, markerIdx) + newSection + content.substring(sectionEnd);
      } else {
        content += `\n${marker}\n(Updated automatically by weekly self-analysis)\n${newLessons}\n`;
      }

      fs.writeFileSync(MEMORY_FILE, content, 'utf8');
      console.log(`[SelfImprover] Updated MEMORY.md with ${lessons.length} new lessons (max ${MAX_MEMORY_LESSONS}).`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[SelfImprover] Failed to update MEMORY.md: ${errMsg}`);
    }
  }

  private removeLessonFromMemory(lessonText: string): void {
    try {
      if (!fs.existsSync(MEMORY_FILE)) return;

      let content = fs.readFileSync(MEMORY_FILE, 'utf8');
      // Remove lines containing the reverted lesson
      const lines = content.split('\n');
      const filtered = lines.filter(line => !line.includes(lessonText));
      if (filtered.length < lines.length) {
        fs.writeFileSync(MEMORY_FILE, filtered.join('\n'), 'utf8');
        console.log(`[SelfImprover] Removed reverted lesson from MEMORY.md.`);
      }
    } catch {
      // Non-fatal
    }
  }

  // --- Recovery State (survive restarts) ---

  private async getLastRunDate(): Promise<Date | null> {
    if (!this.db.isConnected()) return null;

    try {
      await SchemaManager.getInstance().ensureTable('recovery_state');
      const row = await this.db.queryOne<{ state: { lastRunDate: string } }>(
        `SELECT state FROM recovery_state WHERE component = $1`,
        [RECOVERY_COMPONENT]
      );

      if (!row || !row.state?.lastRunDate) return null;
      return new Date(row.state.lastRunDate);
    } catch {
      return null;
    }
  }

  private async saveLastRunDate(): Promise<void> {
    if (!this.db.isConnected()) return;

    try {
      await SchemaManager.getInstance().ensureTable('recovery_state');
      const existing = await this.db.queryOne<{ id: string }>(
        `SELECT id FROM recovery_state WHERE component = $1`,
        [RECOVERY_COMPONENT]
      );

      const state = JSON.stringify({ lastRunDate: new Date().toISOString() });

      if (existing) {
        await this.db.execute(
          `UPDATE recovery_state SET state = $1, updated_at = NOW() WHERE component = $2`,
          [state, RECOVERY_COMPONENT]
        );
      } else {
        await this.db.execute(
          `INSERT INTO recovery_state (component, state) VALUES ($1, $2)`,
          [RECOVERY_COMPONENT, state]
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[SelfImprover] Failed to save last run date: ${errMsg}`);
    }
  }

  // --- Utilities ---

  private emptyReport(): WeeklyReport {
    return {
      weekStart: new Date(),
      weekEnd: new Date(),
      conversationsAnalyzed: 0,
      errorsFound: 0,
      lessonsGenerated: 0,
      changesApplied: [],
      previousChangesVerified: [],
      modelUsed: this.analysisModel,
      tokensUsed: 0,
    };
  }
}
