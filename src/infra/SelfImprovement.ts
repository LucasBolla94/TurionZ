// ============================================================
// TurionZ — Self-Improvement (Weekly Auto-Analysis)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { Database } from './database';
import { ILlmProvider } from '../providers/ILlmProvider';
import { ProviderFactory } from '../providers/ProviderFactory';

const MEMORY_FILE = path.join(process.cwd(), '.agents', 'MEMORY.md');
const MAX_FRAGMENT_TOKENS = 20000;
const CHARS_PER_TOKEN = 4;
const MAX_FRAGMENT_CHARS = MAX_FRAGMENT_TOKENS * CHARS_PER_TOKEN;

interface Lesson {
  category: string;
  lesson: string;
}

interface WeeklyReport {
  conversationsAnalyzed: number;
  errorsFound: number;
  lessonsGenerated: number;
  changesApplied: Record<string, unknown>[];
  previousChangesVerified: Record<string, unknown>[];
}

export class SelfImprovement {
  private static instance: SelfImprovement;
  private db: Database;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): SelfImprovement {
    if (!SelfImprovement.instance) {
      SelfImprovement.instance = new SelfImprovement();
    }
    return SelfImprovement.instance;
  }

  /**
   * Start the weekly scheduler.
   * Runs every Sunday at ~3 AM (checks every hour).
   */
  startScheduler(): void {
    console.log('[SelfImprovement] Scheduler started (runs weekly on Sundays).');

    this.intervalId = setInterval(() => {
      const now = new Date();
      // Sunday = 0, check at 3 AM
      if (now.getDay() === 0 && now.getHours() === 3) {
        this.runWeeklyAnalysis().catch(err => {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[SelfImprovement] Weekly analysis failed: ${errMsg}`);
        });
      }
    }, 60 * 60 * 1000); // Check every hour
  }

  stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Run the full weekly analysis cycle.
   * Can also be triggered manually.
   */
  async runWeeklyAnalysis(): Promise<WeeklyReport> {
    console.log('[SelfImprovement] Starting weekly analysis...');

    if (!this.db.isConnected()) {
      console.warn('[SelfImprovement] Database not connected. Skipping analysis.');
      return this.emptyReport();
    }

    // 1. Collect data from the past week
    const conversations = await this.collectWeekData();
    if (conversations.length === 0) {
      console.log('[SelfImprovement] No conversations to analyze this week.');
      return this.emptyReport();
    }

    // 2. Fragment if too large
    const fragments = this.fragment(conversations);
    console.log(`[SelfImprovement] Analyzing ${fragments.length} fragment(s)...`);

    // 3. Analyze each fragment
    let provider: ILlmProvider;
    try {
      // Use a cheap model for analysis
      provider = ProviderFactory.create('anthropic/claude-haiku-4-5-20251001');
    } catch {
      console.warn('[SelfImprovement] Could not create LLM provider. Skipping analysis.');
      return this.emptyReport();
    }

    const allLessons: Lesson[] = [];
    let errorsFound = 0;

    for (let i = 0; i < fragments.length; i++) {
      try {
        const result = await this.analyzeFragment(provider, fragments[i], i + 1, fragments.length);
        allLessons.push(...result.lessons);
        errorsFound += result.errorsFound;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[SelfImprovement] Fragment ${i + 1} analysis failed: ${errMsg}`);
      }
    }

    // 4. Verify previous week's changes
    const previousVerification = await this.verifyPreviousChanges(provider);

    // 5. Save lessons
    for (const lesson of allLessons) {
      await this.saveLesson(lesson);
    }

    // 6. Update MEMORY.md
    this.updateMemoryFile(allLessons);

    // 7. Save weekly report
    const report: WeeklyReport = {
      conversationsAnalyzed: conversations.length,
      errorsFound,
      lessonsGenerated: allLessons.length,
      changesApplied: allLessons.map(l => ({ category: l.category, lesson: l.lesson })),
      previousChangesVerified: previousVerification,
    };

    await this.saveWeeklyReport(report);

    console.log(
      `[SelfImprovement] Analysis complete: ${allLessons.length} lessons, ${errorsFound} errors found.`
    );

    return report;
  }

  // --- Data Collection ---

  private async collectWeekData(): Promise<string[]> {
    const rows = await this.db.query<{ role: string; content: string; created_at: Date }>(
      `SELECT m.role, m.content, m.created_at
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE m.created_at > NOW() - INTERVAL '7 days'
       ORDER BY m.created_at ASC`
    );

    return rows.map(r => `[${r.role}] ${r.content}`);
  }

  // --- Fragmentation ---

  private fragment(conversations: string[]): string[] {
    const fullText = conversations.join('\n\n');

    if (fullText.length <= MAX_FRAGMENT_CHARS) {
      return [fullText];
    }

    const fragments: string[] = [];
    let remaining = fullText;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_FRAGMENT_CHARS) {
        fragments.push(remaining);
        break;
      }

      // Find a good split point
      let splitAt = remaining.lastIndexOf('\n\n', MAX_FRAGMENT_CHARS);
      if (splitAt < MAX_FRAGMENT_CHARS * 0.5) {
        splitAt = MAX_FRAGMENT_CHARS;
      }

      fragments.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trim();
    }

    return fragments;
  }

  // --- Analysis ---

  private async analyzeFragment(
    provider: ILlmProvider,
    fragment: string,
    index: number,
    total: number
  ): Promise<{ lessons: Lesson[]; errorsFound: number }> {
    const response = await provider.chat([
      {
        role: 'system',
        content: `You are analyzing conversation logs for a weekly self-improvement review (fragment ${index}/${total}).

Analyze the conversations and identify:
1. Mistakes the agent made
2. User corrections or guidance
3. Patterns that repeat
4. Preferences the user expressed
5. Successful strategies worth repeating

Respond in JSON format:
{
  "lessons": [
    {"category": "technical|preference|pattern|tool|communication", "lesson": "description"}
  ],
  "errorsFound": number
}`,
      },
      {
        role: 'user',
        content: fragment,
      },
    ]);

    if (!response.content) {
      return { lessons: [], errorsFound: 0 };
    }

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { lessons: [], errorsFound: 0 };

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
        errorsFound: typeof parsed.errorsFound === 'number' ? parsed.errorsFound : 0,
      };
    } catch {
      return { lessons: [], errorsFound: 0 };
    }
  }

  // --- Verify Previous Changes ---

  private async verifyPreviousChanges(provider: ILlmProvider): Promise<Record<string, unknown>[]> {
    const previousLessons = await this.db.query<{ id: string; lesson: string; was_beneficial: boolean | null }>(
      `SELECT id, lesson, was_beneficial FROM lessons_learned
       WHERE applied_at > NOW() - INTERVAL '14 days'
       AND was_beneficial IS NULL`
    );

    if (previousLessons.length === 0) return [];

    const results: Record<string, unknown>[] = [];

    for (const lesson of previousLessons) {
      // For now, mark as beneficial by default. Real verification will compare metrics.
      await this.db.execute(
        `UPDATE lessons_learned SET was_beneficial = TRUE, verified_at = NOW() WHERE id = $1`,
        [lesson.id]
      );
      results.push({ lessonId: lesson.id, wasBeneficial: true });
    }

    return results;
  }

  // --- Save ---

  private async saveLesson(lesson: Lesson): Promise<void> {
    await this.db.execute(
      `INSERT INTO lessons_learned (category, lesson, applied_at)
       VALUES ($1, $2, NOW())`,
      [lesson.category, lesson.lesson]
    );
  }

  private async saveWeeklyReport(report: WeeklyReport): Promise<void> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    await this.db.execute(
      `INSERT INTO weekly_reports (week_start, week_end, conversations_analyzed, errors_found,
       lessons_generated, changes_applied, previous_changes_verified, model_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        weekStart.toISOString().split('T')[0],
        now.toISOString().split('T')[0],
        report.conversationsAnalyzed,
        report.errorsFound,
        report.lessonsGenerated,
        JSON.stringify(report.changesApplied),
        JSON.stringify(report.previousChangesVerified),
        'anthropic/claude-haiku-4-5-20251001',
      ]
    );
  }

  private updateMemoryFile(lessons: Lesson[]): void {
    if (lessons.length === 0) return;

    try {
      let content = '';
      if (fs.existsSync(MEMORY_FILE)) {
        content = fs.readFileSync(MEMORY_FILE, 'utf8');
      }

      const newLessons = lessons
        .map(l => `- [${new Date().toISOString().split('T')[0]}] [${l.category}] ${l.lesson}`)
        .join('\n');

      // Append to Lessons Learned section
      const marker = '## Lições Aprendidas';
      if (content.includes(marker)) {
        const insertPoint = content.indexOf('\n', content.indexOf(marker)) + 1;
        content = content.substring(0, insertPoint) +
          '(Atualizado automaticamente pela auto-análise semanal)\n' +
          newLessons + '\n' +
          content.substring(insertPoint);
      } else {
        content += `\n${marker}\n${newLessons}\n`;
      }

      fs.writeFileSync(MEMORY_FILE, content, 'utf8');
      console.log(`[SelfImprovement] Updated MEMORY.md with ${lessons.length} new lessons.`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[SelfImprovement] Failed to update MEMORY.md: ${errMsg}`);
    }
  }

  private emptyReport(): WeeklyReport {
    return {
      conversationsAnalyzed: 0,
      errorsFound: 0,
      lessonsGenerated: 0,
      changesApplied: [],
      previousChangesVerified: [],
    };
  }
}
