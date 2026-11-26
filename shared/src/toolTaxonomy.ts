import type { AgentStatus, FileAction } from './types.js';

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

export function unwrapJsonString(value: unknown): string {
  if (typeof value !== 'string') {
    if (value == null) return '';
    return String(value);
  }
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Fall through and return raw string if not valid JSON string
    }
  }
  return value;
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
  if (!args) return '';
  for (const key of keys) {
    if (key in args && args[key] !== undefined && args[key] !== null) {
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
  const name = (toolName || '').trim();

  if (name in READ_TOOLS) {
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

  if (name in EDIT_TOOLS) {
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

  if (name in WRITE_TOOLS) {
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
    const commandLine = pickArg(rawArgs, ['CommandLine', 'command']);
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
