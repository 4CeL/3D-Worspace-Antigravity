import fs from 'node:fs';
import path from 'node:path';
import {
  createTranscriptParseState,
  parseTranscriptChunk,
  type ParsedTranscriptDelta,
  type TranscriptParseState,
} from './transcriptParser.js';

export interface TranscriptWatcherOptions {
  brainDir: string;
  scanIntervalMs?: number;
  maxInitialAgeMs?: number;
}

export interface TranscriptDeltaEvent {
  conversationId: string;
  transcriptPath: string;
  delta: ParsedTranscriptDelta;
}

interface TrackedFile {
  conversationId: string;
  transcriptPath: string;
  offset: number;
  parseState: TranscriptParseState;
  watcher?: fs.FSWatcher;
}

const DEFAULT_SCAN_INTERVAL_MS = 1500;
const DEFAULT_MAX_INITIAL_AGE_MS = 24 * 60 * 60 * 1000;

export class TranscriptWatcher {
  private readonly brainDir: string;
  private readonly scanIntervalMs: number;
  private readonly maxInitialAgeMs: number;
  private readonly tracked = new Map<string, TrackedFile>();
  private readonly listeners = new Set<(event: TranscriptDeltaEvent) => void>();
  private scanTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(options: TranscriptWatcherOptions) {
    this.brainDir = options.brainDir;
    this.scanIntervalMs = options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
    this.maxInitialAgeMs = options.maxInitialAgeMs ?? DEFAULT_MAX_INITIAL_AGE_MS;
  }

  onDelta(listener: (event: TranscriptDeltaEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scan();
    this.scanTimer = setInterval(() => this.scan(), this.scanIntervalMs);
    this.scanTimer.unref();
  }

  stop(): void {
    this.running = false;
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    for (const entry of this.tracked.values()) {
      try {
        entry.watcher?.close();
      } catch {
        // ignore close errors
      }
    }
    this.tracked.clear();
  }

  ensureTracked(conversationId: string, transcriptPath?: string): void {
    if (this.tracked.has(conversationId)) {
      this.readAppended(this.tracked.get(conversationId)!);
      return;
    }
    const targetPath =
      transcriptPath ||
      path.join(this.brainDir, conversationId, '.system_generated', 'logs', 'transcript.jsonl');
    if (!fs.existsSync(targetPath)) return;
    this.attachFile(conversationId, targetPath);
  }

  private scan(): void {
    if (!this.running || !fs.existsSync(this.brainDir)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.brainDir, { withFileTypes: true });
    } catch {
      return;
    }

    const now = Date.now();
    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const conversationId = dirent.name;
      const transcriptPath = path.join(
        this.brainDir,
        conversationId,
        '.system_generated',
        'logs',
        'transcript.jsonl',
      );

      const existing = this.tracked.get(conversationId);
      if (existing) {
        this.readAppended(existing);
        continue;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(transcriptPath);
      } catch {
        continue;
      }

      if (now - stat.mtimeMs > this.maxInitialAgeMs) {
        continue;
      }

      this.attachFile(conversationId, transcriptPath);
    }
  }

  private attachFile(conversationId: string, transcriptPath: string): void {
    const tracked: TrackedFile = {
      conversationId,
      transcriptPath,
      offset: 0,
      parseState: createTranscriptParseState(),
    };
    this.tracked.set(conversationId, tracked);

    try {
      tracked.watcher = fs.watch(transcriptPath, () => {
        if (this.running) {
          this.readAppended(tracked);
        }
      });
      tracked.watcher.on('error', () => {
        // periodic scan still tails safely
      });
    } catch {
      // fallback to periodic scan
    }

    this.readAppended(tracked);
  }

  private readAppended(tracked: TrackedFile): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(tracked.transcriptPath);
    } catch {
      return;
    }

    if (stat.size < tracked.offset) {
      tracked.offset = 0;
      tracked.parseState = createTranscriptParseState();
    }

    const bytesToRead = stat.size - tracked.offset;
    if (bytesToRead <= 0) return;

    let fd: number | null = null;
    try {
      fd = fs.openSync(tracked.transcriptPath, 'r');
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, tracked.offset);
      if (bytesRead <= 0) return;
      tracked.offset += bytesRead;

      const chunk = buffer.toString('utf8', 0, bytesRead);
      const delta = parseTranscriptChunk(tracked.parseState, chunk);

      const hasUsefulData =
        delta.activities.length > 0 ||
        delta.fileTouches.length > 0 ||
        delta.subagentLinks.length > 0 ||
        delta.messagePulses.length > 0 ||
        delta.failedSubagentIds.length > 0 ||
        delta.modelName !== undefined ||
        delta.firstUserPrompt !== undefined ||
        delta.focusText !== undefined ||
        delta.lastStatus !== undefined;

      if (hasUsefulData) {
        const event: TranscriptDeltaEvent = {
          conversationId: tracked.conversationId,
          transcriptPath: tracked.transcriptPath,
          delta,
        };
        for (const listener of this.listeners) {
          listener(event);
        }
      }
    } catch {
      // ignore transient Windows file lock / read errors; next poll retries
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
      }
    }
  }
}
