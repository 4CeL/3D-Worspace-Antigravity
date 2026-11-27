import type { AgentStatus, FileAction, PendingRequestKind } from './types.js';

export interface ClassifiedToolCall {
  status: AgentStatus;
  summary: string;
  fileAction?: FileAction;
  filePath?: string;
  fileName?: string;
  subagentRole?: string;
  subagentType?: string;
  recipientId?: string;
  focusText?: string;
}

export interface PendingApprovalCandidate {
  kind: PendingRequestKind;
  title: string;
  detail: string;
  delayMs: number;
}

const READ_TOOLS: Record<string, string[]> = {
  read_file: ['Path', 'path'],
  view_file: ['AbsolutePath', 'Path', 'path'],
  view_file_outline: ['AbsolutePath', 'Path', 'path'],
  view_code_item: ['File', 'AbsolutePath', 'Path'],
};

const EDIT_TOOLS: Record<string, string[]> = {
  edit_file: ['Path', 'path'],
  replace_file_content: ['TargetFile', 'Path', 'path'],
  multi_replace_file_content: ['TargetFile', 'Path', 'path'],
};

const WRITE_TOOLS: Record<string, string[]> = {
  write_file: ['Path', 'path'],
  write_to_file: ['TargetFile', 'Path', 'path'],
};

const SEARCH_TOOLS = new Set([
  'grep_search',
  'find_by_name',
  'list_dir',
  'search_web',
  'read_resource',
  'read_url_content',
  'list_resources',
]);

function isRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function unwrapJsonString(value: unknown): string {
  if (typeof value !== 'string') {
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.length <= 65_536 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Fall through and return raw string if not valid JSON string
    }
  }
  return value;
}

export function redactSecrets(text: string): string {
  if (!text) return '';
  return text
    .replace(/(https?:\/\/[^/\s:@]+):[^/\s@]+@/gi, '$1:[REDACTED]@')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi, '$1 [REDACTED]')
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTH_KEY))\s*=\s*(?:"[^"]*"|'[^']*'|[^\s;&|]+)/gi,
      '$1=[REDACTED]',
    )
    .replace(
      /(^|\s)(--(?:token|password|passwd|secret|api-key|apikey|auth-token|access-token))(?:\s+|=)(?:"[^"]*"|'[^']*'|[^\s;&|]+)/gi,
      '$1$2 [REDACTED]',
    )
    .replace(
      /\b(?:ghp_[A-Za-z0-9]{10,}|gho_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|sk-[A-Za-z0-9_-]{12,}|sk_live_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,})\b/g,
      '[REDACTED]',
    );
}

export function normalizeFilePath(rawPath: string): { fullPath: string; fileName: string } {
  const cleaned = unwrapJsonString(rawPath).trim();
  const normalizedSeparators = cleaned.replace(/[/\\]+$/, '');
  const parts = normalizedSeparators.split(/[/\\]/).filter(Boolean);
  const fileName = parts.length > 0 ? parts[parts.length - 1] : cleaned;
  return {
    fullPath: cleaned,
    fileName,
  };
}

function pickArg(args: Record<string, unknown> | undefined, keys: string[]): string {
  if (!isRecord(args)) return '';
  for (const key of keys) {
    if (hasOwn(args, key) && args[key] !== undefined && args[key] !== null) {
      const val = unwrapJsonString(args[key]).trim();
      if (val) return val;
    }
  }
  return '';
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

export function classifyToolCall(
  toolName: string,
  rawArgs?: Record<string, unknown>,
): ClassifiedToolCall {
  const name = typeof toolName === 'string' ? toolName.trim() : '';

  if (hasOwn(READ_TOOLS, name)) {
    const rawPath = pickArg(rawArgs, READ_TOOLS[name]);
    const { fullPath, fileName } = normalizeFilePath(rawPath);
    return {
      status: 'reading',
      fileAction: 'read',
      filePath: fullPath || undefined,
      fileName: fileName || undefined,
      summary: fileName ? `Membaca ${fileName}` : `Membaca file (${name})`,
    };
  }

  if (hasOwn(EDIT_TOOLS, name)) {
    const rawPath = pickArg(rawArgs, EDIT_TOOLS[name]);
    const { fullPath, fileName } = normalizeFilePath(rawPath);
    return {
      status: 'editing',
      fileAction: 'edit',
      filePath: fullPath || undefined,
      fileName: fileName || undefined,
      summary: fileName ? `Mengedit ${fileName}` : `Mengedit file (${name})`,
    };
  }

  if (hasOwn(WRITE_TOOLS, name)) {
    const rawPath = pickArg(rawArgs, WRITE_TOOLS[name]);
    const { fullPath, fileName } = normalizeFilePath(rawPath);
    return {
      status: 'editing',
      fileAction: 'write',
      filePath: fullPath || undefined,
      fileName: fileName || undefined,
      summary: fileName ? `Menulis ${fileName}` : `Menulis file (${name})`,
    };
  }

  if (name === 'run_command') {
    const toolSummary = pickArg(rawArgs, ['toolSummary', 'summary']);
    const commandLine = redactSecrets(pickArg(rawArgs, ['CommandLine', 'command']));
    const label = toolSummary || (commandLine ? truncate(commandLine, 48) : 'Menjalankan command');
    return {
      status: 'running',
      summary: label,
    };
  }

  if (name === 'invoke_subagent') {
    const role = pickArg(rawArgs, ['Role', 'role']);
    const typeName = pickArg(rawArgs, ['TypeName', 'typeName']);
    return {
      status: 'delegating',
      subagentRole: role || undefined,
      subagentType: typeName || undefined,
      summary: role ? `Mendelegasikan ke ${role}` : 'Memanggil subagent',
    };
  }

  if (name === 'send_message') {
    const recipient = pickArg(rawArgs, ['Recipient', 'recipient']);
    return {
      status: 'delegating',
      recipientId: recipient || undefined,
      summary: recipient ? `Mengirim pesan ke rekan` : 'Mengirim pesan antar-agent',
    };
  }

  if (name === 'ask_question') {
    return {
      status: 'thinking',
      summary: 'Menunggu jawaban user',
    };
  }

  if (name === 'update_focus') {
    const focus = pickArg(rawArgs, ['focus', 'Focus']);
    return {
      status: 'thinking',
      focusText: focus || undefined,
      summary: focus || 'Memperbarui fokus tugas',
    };
  }

  if (name === 'update_steps') {
    return {
      status: 'thinking',
      summary: 'Memperbarui daftar langkah',
    };
  }

  if (SEARCH_TOOLS.has(name)) {
    const query = pickArg(rawArgs, ['query', 'Query', 'Pattern', 'DirectoryPath', 'SearchPath']);
    return {
      status: 'reading',
      summary: query ? `${name}: ${truncate(query, 40)}` : `Menjelajah (${name})`,
    };
  }

  return {
    status: 'running',
    summary: name ? `Menjalankan ${name}` : 'Menjalankan tool',
  };
}

const MAX_APPROVAL_DETAIL_LEN = 160;

const ARTIFACT_FEEDBACK_TOOLS = new Set([
  'write_file',
  'edit_file',
  'write_to_file',
  'replace_file_content',
]);

const FILE_APPROVAL_TOOLS: Record<string, string[]> = {
  write_file: ['Path', 'path'],
  edit_file: ['Path', 'path'],
  read_file: ['Path', 'path'],
  view_file: ['AbsolutePath', 'Path', 'path'],
  replace_file_content: ['TargetFile', 'Path', 'path'],
  multi_replace_file_content: ['TargetFile', 'Path', 'path'],
  write_to_file: ['TargetFile', 'Path', 'path'],
};

const MAX_JSON_PARSE_CHARS = 65_536;

function sanitizeApprovalDetail(text: string): string {
  const redacted = redactSecrets(text);
  const cleaned = redacted.replace(/[\x00-\x1f\x7f\s]+/g, ' ').trim();
  return truncate(cleaned, MAX_APPROVAL_DETAIL_LEN);
}

function isTruthyFlag(val: unknown): boolean {
  if (val === true) return true;
  if (typeof val === 'string') {
    return unwrapJsonString(val).trim().toLowerCase() === 'true';
  }
  return false;
}

function parseMaybeJsonValue(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > MAX_JSON_PARSE_CHARS) return val;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }
  return val;
}

function normalizePathForCompare(p: string): { normalized: string; isAbsolute: boolean; escapesUpward: boolean } {
  const unified = p.replace(/\\/g, '/').trim().toLowerCase();
  const driveMatch = unified.match(/^([a-z]:)(\/.*)?$/);
  const isPosixAbs = !driveMatch && unified.startsWith('/');
  const isAbsolute = Boolean(driveMatch) || isPosixAbs;
  const prefix = driveMatch ? driveMatch[1] : isPosixAbs ? '' : '';
  const remainder = driveMatch ? (driveMatch[2] || '') : unified;

  const resolved: string[] = [];
  let escapesUpward = false;

  for (const seg of remainder.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
        resolved.pop();
      } else if (!isAbsolute) {
        escapesUpward = true;
        resolved.push('..');
      }
      continue;
    }
    resolved.push(seg);
  }

  const normalized = driveMatch
    ? `${prefix}/${resolved.join('/')}`.replace(/\/+$/, '') || `${prefix}/`
    : isPosixAbs
      ? `/${resolved.join('/')}`
      : resolved.join('/');

  return { normalized, isAbsolute, escapesUpward };
}

export function detectPendingApprovalCandidate(
  toolName: string,
  rawArgs?: Record<string, unknown>,
  workspacePath?: string,
): PendingApprovalCandidate | null {
  const name = typeof toolName === 'string' ? toolName.trim() : '';
  if (!name) return null;
  const args = isRecord(rawArgs) ? rawArgs : undefined;

  if (name === 'ask_question') {
    let questionText = '';
    const parsedQuestions = parseMaybeJsonValue(args?.questions);
    if (Array.isArray(parsedQuestions) && parsedQuestions.length > 0) {
      const first = parsedQuestions[0];
      if (isRecord(first) && hasOwn(first, 'question')) {
        const qVal = first.question;
        if (typeof qVal === 'string') {
          questionText = sanitizeApprovalDetail(unwrapJsonString(qVal));
        }
      }
    }
    return {
      kind: 'question',
      title: 'Menunggu Jawaban Kamu',
      detail: questionText || 'Agent mengajukan pertanyaan di Antigravity',
      delayMs: 0,
    };
  }

  if (ARTIFACT_FEEDBACK_TOOLS.has(name) && args && hasOwn(args, 'ArtifactMetadata')) {
    const meta = parseMaybeJsonValue(args.ArtifactMetadata);
    if (isRecord(meta)) {
      if (isTruthyFlag(meta.RequestFeedback)) {
        const argKeys = hasOwn(FILE_APPROVAL_TOOLS, name)
          ? FILE_APPROVAL_TOOLS[name]
          : ['Path', 'TargetFile', 'path'];
        const rawPath = pickArg(args, argKeys);
        const { fileName } = normalizeFilePath(rawPath);
        const summary =
          typeof meta.Summary === 'string'
            ? sanitizeApprovalDetail(unwrapJsonString(meta.Summary))
            : '';
        const cleanFileName = fileName ? sanitizeApprovalDetail(fileName) : '';
        const detail = sanitizeApprovalDetail(
          cleanFileName && summary
            ? `${cleanFileName} — ${summary}`
            : cleanFileName || summary || 'Menunggu konfirmasi artefak',
        );
        return {
          kind: 'permission',
          title: 'Menunggu Konfirmasi Rencana',
          detail,
          delayMs: 0,
        };
      }
    }
  }

  if (name === 'run_command') {
    if (!isTruthyFlag(args?.BypassSandbox)) {
      return null;
    }
    const commandLine = pickArg(args, ['CommandLine', 'command']);
    const toolSummary = pickArg(args, ['toolSummary', 'summary']);
    const detail = sanitizeApprovalDetail(commandLine || toolSummary || 'Perintah di luar sandbox');
    return {
      kind: 'permission',
      title: 'Butuh Izin di Luar Sandbox',
      detail,
      delayMs: 1500,
    };
  }

  if (hasOwn(FILE_APPROVAL_TOOLS, name)) {
    const rawPath = pickArg(args, FILE_APPROVAL_TOOLS[name]);
    const { fullPath, fileName } = normalizeFilePath(rawPath);
    const wsInfo = workspacePath ? normalizePathForCompare(workspacePath) : null;
    const targetInfo = fullPath ? normalizePathForCompare(fullPath) : null;
    const normWs = wsInfo?.normalized ?? '';
    const normTarget = targetInfo?.normalized ?? '';

    const insideWorkspace =
      Boolean(normWs && normTarget && targetInfo?.isAbsolute) &&
      (normTarget === normWs || normTarget.startsWith(`${normWs}/`));
    const insideAntigravityInternal =
      Boolean(normTarget && targetInfo?.isAbsolute) &&
      (normTarget.includes('/.gemini/antigravity/') ||
        normTarget.endsWith('/.gemini/antigravity'));
    const isOutsideWorkspace = Boolean(
      targetInfo &&
        (targetInfo.escapesUpward ||
          (normWs && targetInfo.isAbsolute && !insideWorkspace && !insideAntigravityInternal)),
    );

    if (isOutsideWorkspace) {
      return {
        kind: 'permission',
        title: 'Butuh Izin Akses File',
        detail: sanitizeApprovalDetail(fullPath),
        delayMs: 1500,
      };
    }

    return {
      kind: 'permission',
      title: 'Butuh Izin File',
      detail: sanitizeApprovalDetail(fileName || fullPath || name),
      delayMs: 2500,
    };
  }

  if (name === 'call_mcp_tool') {
    const serverName = pickArg(args, ['ServerName', 'serverName', 'server']);
    const mcpToolName = pickArg(args, ['ToolName', 'toolName', 'tool']);
    const rawDetail =
      serverName && mcpToolName
        ? `${serverName}/${mcpToolName}`
        : serverName || mcpToolName || 'MCP tool';
    return {
      kind: 'tool_wait',
      title: 'Menunggu Izin Tool MCP',
      detail: sanitizeApprovalDetail(rawDetail),
      delayMs: 2500,
    };
  }

  return null;
}
