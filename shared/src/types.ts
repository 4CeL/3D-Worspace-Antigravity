export type AgentStatus =
  | 'thinking'
  | 'editing'
  | 'reading'
  | 'running'
  | 'delegating'
  | 'idle'
  | 'error';

export type FileAction = 'read' | 'edit' | 'write';

export type RecencyWindow = '30m' | '2h' | 'today';

export interface FileTouch {
  path: string;
  relativePath: string;
  fileName: string;
  action: FileAction;
  lastTouchedAt: number;
  count: number;
}

export interface ActivityEvent {
  id: string;
  timestamp: number;
  toolName: string;
  status: AgentStatus;
  summary: string;
  targetPath?: string;
  fileAction?: FileAction;
  isError?: boolean;
}

export interface AgentNode {
  id: string;
  parentId: string | null;
  rootId: string;
  isSubagent: boolean;
  displayName: string;
  hasCustomAlias?: boolean;
  role: string;
  typeName?: string;
  modelName?: string;
  workspacePath?: string;
  projectName: string;
  status: AgentStatus;
  focusText?: string;
  currentTool?: string;
  currentFile?: {
    fileName: string;
    path: string;
    action: FileAction;
  };
  files: FileTouch[];
  recentActivity: ActivityEvent[];
  lastUpdatedAt: number;
  lastHookAt?: number;
  createdAt: number;
  errorMessage?: string;
}

export interface FloorConfig {
  id: string;
  index: number;
  name: string;
}

export interface BuildingConfig {
  floors: FloorConfig[];
  teamFloors: Record<string, string>;
}

export interface TeamCluster {
  rootId: string;
  projectName: string;
  workspacePath?: string;
  title: string;
  leadAgentId: string;
  agentIds: string[];
  floorId: string;
  lastUpdatedAt: number;
}

export interface ActivePulse {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  timestamp: number;
}

export interface OfficeSnapshot {
  generatedAt: number;
  hookActive: boolean;
  lastHookAt: number | null;
  demoMode: boolean;
  floors: FloorConfig[];
  clusters: TeamCluster[];
  agents: Record<string, AgentNode>;
  activePulses: ActivePulse[];
}

export interface HookEventPayload {
  hookEventName: string;
  conversationId: string;
  workspacePaths?: string[];
  transcriptPath?: string;
  artifactDirectoryPath?: string;
  modelName?: string;
  lastUserInput?: string;
  cwd?: string;
  stepIdx?: number;
  toolCall?: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  };
  error?: string;
  fullyIdle?: boolean;
  terminationReason?: string;
  executionNum?: number;
  continuationActive?: boolean;
}

export type ServerMessage =
  | { type: 'snapshot'; payload: OfficeSnapshot }
  | { type: 'command_ack'; requestId: string; ok: false; reason: 'not_implemented' };

export type ClientMessage =
  | { type: 'subscribe'; recency?: RecencyWindow }
  | { type: 'set_recency'; recency: RecencyWindow }
  | { type: 'toggle_demo'; enabled: boolean }
  | {
      type: 'agent_command';
      requestId: string;
      conversationId: string;
      command: string;
      payload?: unknown;
    };
