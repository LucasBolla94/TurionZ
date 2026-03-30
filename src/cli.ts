#!/usr/bin/env node
// ============================================================
// TurionZ — CLI (turionz start | stop | restart | status | logs | update)
// Created by BollaNetwork
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config();

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(PROJECT_DIR, 'tmp', 'turionz.pid');
const LOG_FILE = path.join(PROJECT_DIR, 'tmp', 'turionz.log');

function ensureDirs(): void {
  const tmpDir = path.join(PROJECT_DIR, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
}

function getPid(): number | null {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (isNaN(pid)) return null;

    // Check if process is alive
    try {
      process.kill(pid, 0); // signal 0 = check if alive
      return pid;
    } catch {
      // Process is dead, clean up stale PID file
      fs.unlinkSync(PID_FILE);
      return null;
    }
  } catch {
    return null;
  }
}

function start(): void {
  ensureDirs();

  const existingPid = getPid();
  if (existingPid) {
    console.log(`[TurionZ] Already running (PID: ${existingPid})`);
    console.log(`  Use: turionz restart — to restart`);
    console.log(`  Use: turionz logs    — to see logs`);
    return;
  }

  console.log('[TurionZ] Starting Thor in background...');

  const logStream = fs.openSync(LOG_FILE, 'a');

  const child = spawn('node', [path.join(PROJECT_DIR, 'dist', 'index.js')], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: ['ignore', logStream, logStream],
    env: { ...process.env },
  });

  if (child.pid) {
    fs.writeFileSync(PID_FILE, String(child.pid), 'utf-8');
    child.unref();

    console.log(`[TurionZ] Thor is running! (PID: ${child.pid})`);
    console.log('');
    console.log('  turionz status  — ver se tá rodando');
    console.log('  turionz logs    — ver logs em tempo real');
    console.log('  turionz stop    — parar');
    console.log('  turionz restart — reiniciar');
  } else {
    console.error('[TurionZ] Failed to start. Check logs: turionz logs');
  }
}

function stop(): void {
  const pid = getPid();
  if (!pid) {
    console.log('[TurionZ] Thor is not running.');
    return;
  }

  console.log(`[TurionZ] Stopping Thor (PID: ${pid})...`);

  try {
    process.kill(pid, 'SIGTERM');

    // Wait up to 5 seconds for graceful shutdown
    let waited = 0;
    while (waited < 5000) {
      try {
        process.kill(pid, 0);
        // Still alive, wait
        execSync('sleep 0.5', { stdio: 'ignore' });
        waited += 500;
      } catch {
        // Dead
        break;
      }
    }

    // Force kill if still alive
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
      console.log('[TurionZ] Force killed.');
    } catch {
      // Already dead
    }
  } catch {
    // Process already dead
  }

  // Clean PID file
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }

  console.log('[TurionZ] Thor stopped.');
}

function restart(): void {
  stop();
  // Small delay to ensure port/resources are released
  execSync('sleep 1', { stdio: 'ignore' });
  start();
}

function status(): void {
  const pid = getPid();
  if (pid) {
    console.log(`[TurionZ] Thor is RUNNING (PID: ${pid})`);

    // Show uptime info
    try {
      const stat = fs.statSync(PID_FILE);
      const uptime = Date.now() - stat.mtimeMs;
      const hours = Math.floor(uptime / 3600000);
      const minutes = Math.floor((uptime % 3600000) / 60000);
      console.log(`  Uptime: ${hours}h ${minutes}m`);
    } catch { /* ignore */ }

    // Show last 3 log lines
    try {
      if (fs.existsSync(LOG_FILE)) {
        const lines = fs.readFileSync(LOG_FILE, 'utf-8').trim().split('\n');
        const last3 = lines.slice(-3);
        console.log('  Last log:');
        for (const line of last3) {
          console.log(`    ${line}`);
        }
      }
    } catch { /* ignore */ }
  } else {
    console.log('[TurionZ] Thor is STOPPED.');
    console.log('  Use: turionz start');
  }
}

function logs(): void {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('[TurionZ] No logs yet. Start Thor first: turionz start');
    return;
  }

  console.log(`[TurionZ] Showing logs (Ctrl+C to exit)...`);
  console.log('');

  try {
    // Show last 50 lines then follow
    execSync(`tail -50f ${LOG_FILE}`, { stdio: 'inherit' });
  } catch {
    // Ctrl+C exits here, that's fine
  }
}

function update(): void {
  const pid = getPid();
  const wasRunning = !!pid;

  if (wasRunning) {
    console.log('[TurionZ] Stopping Thor for update...');
    stop();
  }

  console.log('[TurionZ] Pulling latest from GitHub...');
  try {
    execSync('git pull origin master', { cwd: PROJECT_DIR, stdio: 'inherit' });
  } catch {
    console.error('[TurionZ] git pull failed. Check your network or repo.');
    if (wasRunning) start();
    return;
  }

  console.log('[TurionZ] Installing dependencies...');
  try {
    execSync('npm install', { cwd: PROJECT_DIR, stdio: 'inherit' });
  } catch {
    console.error('[TurionZ] npm install failed.');
    if (wasRunning) start();
    return;
  }

  console.log('[TurionZ] Building...');
  try {
    execSync('npm run build', { cwd: PROJECT_DIR, stdio: 'inherit' });
  } catch {
    console.error('[TurionZ] Build failed.');
    if (wasRunning) start();
    return;
  }

  console.log('[TurionZ] Update complete!');

  if (wasRunning) {
    console.log('[TurionZ] Restarting Thor...');
    start();
  } else {
    console.log('[TurionZ] Use: turionz start — to start');
  }
}

// ─── Parse command ─────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case 'start':
    start();
    break;
  case 'stop':
    stop();
    break;
  case 'restart':
    restart();
    break;
  case 'status':
    status();
    break;
  case 'logs':
    logs();
    break;
  case 'update':
    update();
    break;
  case 'setup':
    execSync('npx tsx src/setup.ts', { cwd: PROJECT_DIR, stdio: 'inherit' });
    break;
  default:
    console.log('');
    console.log('  ⚡ TurionZ (Thor) — CLI');
    console.log('  Created by BollaNetwork');
    console.log('');
    console.log('  Commands:');
    console.log('    turionz start    — Start Thor in background');
    console.log('    turionz stop     — Stop Thor');
    console.log('    turionz restart  — Restart Thor');
    console.log('    turionz status   — Check if Thor is running');
    console.log('    turionz logs     — View logs in real-time');
    console.log('    turionz update   — Pull latest + rebuild + restart');
    console.log('    turionz setup    — Run interactive setup wizard');
    console.log('');
    break;
}
