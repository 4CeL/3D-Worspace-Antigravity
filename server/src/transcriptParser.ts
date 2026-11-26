import {
  classifyToolCall,
  type ActivityEvent,
  type AgentStatus,
  type FileAction,
} from '@office/shared';

export interface ParsedFileTouch {
  path: string;
  fileName: string;
  action: FileAction;
  timestamp: number;
}

export interface ParsedSubagentLink {
  childConversationId: string;
  role?: string;
  typeName?: string;
  workspacePaths: string[];
  timestamp: number;
}

export interface ParsedMessagePulse {
  toAgentId: string;
  timestamp: number;
}

export interface ParsedTranscriptDelta {
  activities: ActivityEvent[];
  fileTouches: ParsedFileTouch[];
  subagentLinks: ParsedSubagentLink[];
  messagePulses: ParsedMessagePulse[];
  workspacePaths: string[];
  modelName?: string;
  firstUserPrompt?: string;
  focusText?: string;
  lastStatus?: AgentStatus;
  lastToolName?: string;
  lastError?: string;
  lastTimestamp?: number;
  createdAt?: number;
}

interface PendingToolCall {
  name: string;
  role?: string;
  typeName?: string;
  timestamp: number;
}

export interface TranscriptParseState {
  remainder: string;
  pendingToolCalls: PendingToolCall[];
  hasFirstUserPrompt: boolean;
}

export function createTranscriptParseState(): TranscriptParseState {
  return {
    remainder: '',
    pendingToolCalls: [],
    hasFirstUserPrompt: false,
  };
}

export function decodeFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith('file://')) {
    return trimmed;
  }
  let stripped = trimmed.replace(/^file:\/\//i, '');
  try {
    stripped = decodeURIComponent(stripped);
  } catch {
    // keep raw if malformed percent encoding
  }
  if (/^\/[a-zA-Z]:/.test(stripped)) {
    return stripped.slice(1).replace(/\//g, '\\');
  }
  return stripped;
}

function extractUserRequest(content: string): string {
  const match = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
  const raw = match ? match[1] : content;
  const singleLine = raw.replace(/\s+/g, ' ').trim();
  return singleLine.length > 90 ? `${singleLine.slice(0, 89)}…` : singleLine;
}

function extractSubagentCreatedBlock(
  content: string,
): { conversationId: string; workspacePaths: string[] } | null {
  const markerIdx = content.indexOf('Created the following subagent:');
  if (markerIdx === -1) return null;

  const afterMarker = content.slice(markerIdx);
  const startBrace = afterMarker.indexOf('{');
  if (startBrace === -1) return null;

  let depth = 0;
  let endBrace = -1;
  for (let i = startBrace; i < afterMarker.length; i++) {
    if (afterMarker[i] === '{') depth++;
    else if (afterMarker[i] === '}') {
      depth--;
      if (depth === 0) {
        endBrace = i;
        break;
      }
    }
  }
  if (endBrace === -1) return null;

  try {
    const parsed = JSON.parse(afterMarker.slice(startBrace, endBrace + 1)) as {
      conversationId?: string;
      workspaceUris?: string[];
    };
    if (!parsed.conversationId || typeof parsed.conversationId !== 'string') return null;
    const workspacePaths = Array.isArray(parsed.workspaceUris)
      ? parsed.workspaceUris.filter((u): u is string => typeof u === 'string').map(decodeFileUri)
      : [];
    return { conversationId: parsed.conversationId, workspacePaths };
  } catch {
    return null;
  }
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

export function parseTranscriptChunk(
  state: TranscriptParseState,
  chunk: string,
): ParsedTranscriptDelta {
  const delta: ParsedTranscriptDelta = {
    activities: [],
    fileTouches: [],
    subagentLinks: [],
    messagePulses: [],
    workspacePaths: [],
  };

  if (!chunk) return delta;

  const combined = state.remainder + chunk;
  const lines = combined.split(/\r?\n/);
  state.remainder = lines.pop() ?? '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let step: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object') continue;
      step = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const ts = parseTimestamp(step.created_at);
    if (delta.createdAt === undefined) delta.createdAt = ts;
    delta.lastTimestamp = ts;

    const stepIndex = typeof step.step_index === 'number' ? step.step_index : 0;
    const type = typeof step.type === 'string' ? step.type : '';
    const status = typeof step.status === 'string' ? step.status : '';

    if (typeof step.model === 'string' && step.model.trim()) {
      delta.modelName = step.model.trim();
    }

    if (type === 'USER_INPUT') {
      state.pendingToolCalls = [];
      if (!state.hasFirstUserPrompt && typeof step.content === 'string') {
        const prompt = extractUserRequest(step.content);
        if (prompt) {
          delta.firstUserPrompt = prompt;
          state.hasFirstUserPrompt = true;
        }
      }
      delta.lastStatus = 'thinking';
      continue;
    }

    if (type === 'PLANNER_RESPONSE') {
      state.pendingToolCalls = [];
      const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : [];

      if (toolCalls.length === 0) {
        if (typeof step.content === 'string' && step.content.trim()) {
          delta.lastStatus = 'idle';
        } else {
          delta.lastStatus = 'thinking';
        }
        continue;
      }

      toolCalls.forEach((rawCall, idx) => {
        if (!rawCall || typeof rawCall !== 'object') return;
        const call = rawCall as { name?: string; args?: Record<string, unknown> };
        const toolName = typeof call.name === 'string' ? call.name : '';
        if (!toolName) return;

        const classified = classifyToolCall(toolName, call.args);
        state.pendingToolCalls.push({
          name: toolName,
          role: classified.subagentRole,
          typeName: classified.subagentType,
          timestamp: ts,
        });

        if (classified.focusText) {
          delta.focusText = classified.focusText;
        }
        if (classified.recipientId) {
          delta.messagePulses.push({
            toAgentId: classified.recipientId,
            timestamp: ts,
          });
        }
        if (classified.filePath && classified.fileName && classified.fileAction) {
          delta.fileTouches.push({
            path: classified.filePath,
            fileName: classified.fileName,
            action: classified.fileAction,
            timestamp: ts,
          });
        }

        delta.activities.push({
          id: `tr-${stepIndex}-${idx}-${toolName}`,
          timestamp: ts,
          toolName,
          status: classified.status,
          summary: classified.summary,
          targetPath: classified.filePath,
          fileAction: classified.fileAction,
        });
        delta.lastStatus = classified.status;
        delta.lastToolName = toolName;
      });
      continue;
    }

    if (type === 'GENERIC') {
      const pending = state.pendingToolCalls.shift();
      const content = typeof step.content === 'string' ? step.content : '';

      if (pending?.name === 'invoke_subagent' || content.includes('Created the following subagent:')) {
        const created = extractSubagentCreatedBlock(content);
        if (created) {
          delta.subagentLinks.push({
            childConversationId: created.conversationId,
            role: pending?.role,
            typeName: pending?.typeName,
            workspacePaths: created.workspacePaths,
            timestamp: ts,
          });
          for (const wp of created.workspacePaths) {
            if (!delta.workspacePaths.includes(wp)) {
              delta.workspacePaths.push(wp);
            }
          }
        }
      }

      const isError =
        (status && status !== 'DONE' && status !== 'RUNNING') ||
        /Command exited with code [1-9]\d*/.test(content);
      if (isError) {
        delta.lastStatus = 'error';
        delta.lastError = pending ? `${pending.name} gagal` : 'Tool execution error';
      }
    }
  }

  return delta;
}
