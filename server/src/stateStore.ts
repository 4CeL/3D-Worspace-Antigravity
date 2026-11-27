import {
  classifyToolCall,
  detectPendingApprovalCandidate,
  normalizeFilePath,
  type ActivePulse,
  type ActivityEvent,
  type AgentNode,
  type AgentStatus,
  type BuildingConfig,
  type FileAction,
  type FileTouch,
  type FloorConfig,
  type FloorTheme,
  type HookEventPayload,
  type OfficeSnapshot,
  type PendingApprovalRequest,
  type PendingRequestKind,
  type RecencyWindow,
  type TeamCluster,
} from '@office/shared';
import {
  MAX_FLOORS,
  MAX_TEAM_FLOORS,
  createDefaultBuildingConfig,
  defaultThemeForFloorIndex,
  isSafeObjectKey,
  isValidFloorTheme,
  normalizeBuildingConfig,
} from './buildingStore.js';
import type { ParsedTranscriptDelta } from './transcriptParser.js';

interface ParentLink {
  parentId: string;
  role?: string;
  typeName?: string;
}

interface ActiveToolTracker {
  id: string;
  kind: PendingRequestKind;
  toolName: string;
  title: string;
  detail: string;
  startedAt: number;
  delayMs: number;
  announced: boolean;
}

interface InternalAgent {
  id: string;
  parentId: string | null;
  displayName: string;
  hasCustomName: boolean;
  role: string;
  typeName?: string;
  modelName?: string;
  workspacePath?: string;
  projectName: string;
  status: AgentStatus;
  focusText?: string;
  currentTool?: string;
  currentFile?: { fileName: string; path: string; action: FileAction };
  activeTool?: ActiveToolTracker;
  files: Map<string, FileTouch>;
  recentActivity: ActivityEvent[];
  lastUpdatedAt: number;
  lastHookAt?: number;
  createdAt: number;
  errorMessage?: string;
}

const IDLE_TIMEOUT_MS = 20_000;
const APPROVAL_STALE_MS = 10 * 60 * 1000;
const DEDUP_WINDOW_MS = 2_000;
const PULSE_TTL_MS = 5_000;
const MAX_ACTIVITY_ITEMS = 25;

function extractProjectName(workspacePath?: string): string {
  if (!workspacePath) return 'Antigravity';
  const cleaned = workspacePath.replace(/[/\\]+$/, '');
  const parts = cleaned.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || 'Antigravity';
}

function inferProjectFromFilePath(filePath: string): { workspacePath?: string; projectName?: string } {
  const normalized = filePath.replace(/\\/g, '/');
  // Skip internal .gemini brain/config paths when inferring user project name
  if (normalized.toLowerCase().includes('/.gemini/')) return {};
  const parts = normalized.split('/').filter(Boolean);
  const srcIdx = parts.findIndex((p) =>
    ['src', 'server', 'client', 'shared', 'docs', 'tests', 'hooks', 'app', 'lib', 'packages'].includes(
      p.toLowerCase(),
    ),
  );
  if (srcIdx > 1) {
    const isWinDrive = /^[a-zA-Z]:$/.test(parts[0]);
    const workspaceParts = parts.slice(0, srcIdx);
    const workspacePath = isWinDrive ? workspaceParts.join('\\') : `/${workspaceParts.join('/')}`;
    return { workspacePath, projectName: workspaceParts[workspaceParts.length - 1] };
  }
  if (parts.length >= 2) {
    return { projectName: parts[parts.length - 2] };
  }
  return {};
}

function computeRelativePath(fullPath: string, workspacePath?: string): string {
  if (!workspacePath) return fullPath;
  const normFull = fullPath.replace(/\\/g, '/');
  const normWs = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normFull.toLowerCase().startsWith(`${normWs.toLowerCase()}/`)) {
    return normFull.slice(normWs.length + 1);
  }
  return fullPath;
}

function normalizePathKey(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function getRecencyCutoffMs(recency: RecencyWindow, now: number): number {
  if (recency === '30m') return now - 30 * 60 * 1000;
  if (recency === '2h') return now - 2 * 60 * 60 * 1000;
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay.getTime();
}

export interface StateStoreOptions {
  initialAliases?: Record<string, string>;
  initialBuilding?: BuildingConfig;
}

export class StateStore {
  private readonly agents = new Map<string, InternalAgent>();
  private readonly parentLinks = new Map<string, ParentLink>();
  private readonly customAliases = new Map<string, string>();
  private readonly floors: FloorConfig[] = [];
  private readonly teamFloors = new Map<string, string>();
  private readonly roomNames = new Map<string, string>();
  private readonly failedGhostIds = new Set<string>();
  private readonly hiddenAgents = new Set<string>();
  private readonly recentDedup = new Map<string, { timestamp: number; source: 'hook' | 'transcript' }>();
  private readonly seenToolCallIds = new Set<string>();
  private readonly pulses: ActivePulse[] = [];
  private readonly listeners = new Set<() => void>();
  private hookActive = false;
  private lastHookAt: number | null = null;

  constructor(options: StateStoreOptions = {}) {
    if (options.initialAliases) {
      for (const [id, name] of Object.entries(options.initialAliases)) {
        const trimmed = name.trim();
        if (id && trimmed) {
          this.customAliases.set(id, trimmed);
        }
      }
    }

    const building = options.initialBuilding
      ? normalizeBuildingConfig(options.initialBuilding)
      : createDefaultBuildingConfig();
    this.floors.push(...building.floors);
    for (const [rootId, floorId] of Object.entries(building.teamFloors)) {
      this.teamFloors.set(rootId, floorId);
    }
    if (building.roomNames) {
      for (const [rootId, roomName] of Object.entries(building.roomNames)) {
        const trimmed = typeof roomName === 'string' ? roomName.trim().slice(0, 40) : '';
        if (isSafeObjectKey(rootId) && trimmed) {
          this.roomNames.set(rootId, trimmed);
        }
      }
    }
    if (Array.isArray(building.hiddenAgents)) {
      for (const agentId of building.hiddenAgents) {
        if (isSafeObjectKey(agentId)) {
          this.hiddenAgents.add(agentId);
        }
      }
    }
  }

  addFloor(name?: string, theme?: FloorTheme): FloorConfig | null {
    if (this.floors.length >= MAX_FLOORS) return null;
    const nextIndex = this.floors.length + 1;
    let id = `floor-${nextIndex}`;
    while (this.floors.some((f) => f.id === id)) {
      id = `floor-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    const label =
      typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : `Lantai ${nextIndex}`;
    const resolvedTheme: FloorTheme = isValidFloorTheme(theme)
      ? theme
      : defaultThemeForFloorIndex(nextIndex);
    const floor: FloorConfig = { id, index: nextIndex, name: label, theme: resolvedTheme };
    this.floors.push(floor);
    this.emitChange();
    return floor;
  }

  renameFloor(floorId: string, name: string): boolean {
    const target = this.floors.find((f) => f.id === floorId);
    const trimmed = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (!target || !trimmed) return false;
    target.name = trimmed;
    this.emitChange();
    return true;
  }

  setFloorTheme(floorId: string, theme: FloorTheme): boolean {
    const target = this.floors.find((f) => f.id === floorId);
    if (!target || !isValidFloorTheme(theme)) return false;
    target.theme = theme;
    this.emitChange();
    return true;
  }

  deleteFloor(floorId: string): boolean {
    const idx = this.floors.findIndex((f) => f.id === floorId);
    if (idx <= 0 || this.floors.length <= 1) return false; // Floor 1 cannot be deleted
    const fallbackFloorId = this.floors[0].id;
    this.floors.splice(idx, 1);
    this.floors.forEach((f, i) => {
      f.index = i + 1;
    });
    for (const [rootId, assigned] of this.teamFloors.entries()) {
      if (assigned === floorId) {
        this.teamFloors.set(rootId, fallbackFloorId);
      }
    }
    this.emitChange();
    return true;
  }

  setTeamFloor(rootId: string, floorId: string): boolean {
    const trimmedRoot = typeof rootId === 'string' ? rootId.trim() : '';
    if (!isSafeObjectKey(trimmedRoot) || !this.floors.some((f) => f.id === floorId)) return false;
    if (!this.teamFloors.has(trimmedRoot) && this.teamFloors.size >= MAX_TEAM_FLOORS) {
      const oldestKey = this.teamFloors.keys().next().value;
      if (oldestKey) this.teamFloors.delete(oldestKey);
    }
    this.teamFloors.set(trimmedRoot, floorId);
    this.emitChange();
    return true;
  }

  isAgentHidden(agentId: string): boolean {
    const trimmed = typeof agentId === 'string' ? agentId.trim() : '';
    return trimmed.length > 0 && this.hiddenAgents.has(trimmed);
  }

  hideAgent(agentId: string): boolean {
    const trimmed = typeof agentId === 'string' ? agentId.trim() : '';
    if (!isSafeObjectKey(trimmed)) return false;
    if (!this.hiddenAgents.has(trimmed) && this.hiddenAgents.size >= MAX_TEAM_FLOORS) {
      const oldest = this.hiddenAgents.values().next().value;
      if (oldest) this.hiddenAgents.delete(oldest);
    }
    this.hiddenAgents.add(trimmed);
    this.emitChange();
    return true;
  }

  unhideAllAgents(): number {
    const prevCount = this.hiddenAgents.size;
    if (prevCount > 0) {
      this.hiddenAgents.clear();
      this.emitChange();
    }
    return prevCount;
  }

  setRoomName(rootId: string, name: string | null): boolean {
    const trimmedRoot = typeof rootId === 'string' ? rootId.trim() : '';
    if (!isSafeObjectKey(trimmedRoot)) return false;
    const trimmedName = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (trimmedName) {
      if (!this.roomNames.has(trimmedRoot) && this.roomNames.size >= MAX_TEAM_FLOORS) {
        const oldestKey = this.roomNames.keys().next().value;
        if (oldestKey) this.roomNames.delete(oldestKey);
      }
      this.roomNames.set(trimmedRoot, trimmedName);
    } else {
      this.roomNames.delete(trimmedRoot);
    }
    this.emitChange();
    return true;
  }

  getBuildingConfig(): BuildingConfig {
    const teamFloors: Record<string, string> = {};
    for (const [k, v] of this.teamFloors.entries()) {
      if (isSafeObjectKey(k)) {
        teamFloors[k] = v;
      }
    }
    const roomNames: Record<string, string> = {};
    for (const [k, v] of this.roomNames.entries()) {
      if (isSafeObjectKey(k) && v) {
        roomNames[k] = v;
      }
    }
    return {
      floors: this.floors.map((f) => ({ ...f })),
      teamFloors,
      hiddenAgents: Array.from(this.hiddenAgents),
      roomNames,
    };
  }

  setAgentAlias(agentId: string, name: string | null): void {
    const id = agentId.trim();
    if (!id) return;
    const trimmed = typeof name === 'string' ? name.trim().slice(0, 60) : '';
    if (trimmed) {
      this.customAliases.set(id, trimmed);
    } else {
      this.customAliases.delete(id);
    }
    this.emitChange();
  }

  getAliases(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.customAliases.entries()) {
      out[k] = v;
    }
    return out;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private ensureAgent(id: string, now: number): InternalAgent {
    let agent = this.agents.get(id);
    if (!agent) {
      const link = this.parentLinks.get(id);
      const shortId = id.slice(0, 6);
      agent = {
        id,
        parentId: link?.parentId ?? null,
        displayName: link?.role || `Agent ${shortId}`,
        hasCustomName: Boolean(link?.role),
        role: link?.role || 'Main Agent',
        typeName: link?.typeName,
        projectName: 'Antigravity',
        status: 'idle',
        files: new Map(),
        recentActivity: [],
        lastUpdatedAt: now,
        createdAt: now,
      };
      this.agents.set(id, agent);

      if (link?.parentId) {
        this.inheritWorkspaceFromParent(agent);
      }
    }
    return agent;
  }

  private inheritWorkspaceFromParent(child: InternalAgent): void {
    if (!child.parentId) return;
    const parent = this.agents.get(child.parentId);
    if (!parent) return;
    if (!child.workspacePath && parent.workspacePath) {
      child.workspacePath = parent.workspacePath;
      child.projectName = parent.projectName;
      this.refreshRelativePaths(child);
    } else if (child.projectName === 'Antigravity' && parent.projectName !== 'Antigravity') {
      child.projectName = parent.projectName;
    }
  }

  private setWorkspace(agent: InternalAgent, workspacePath: string): void {
    const trimmed = workspacePath.trim();
    if (!trimmed) return;
    agent.workspacePath = trimmed;
    agent.projectName = extractProjectName(trimmed);
    this.refreshRelativePaths(agent);

    // Propagate workspace to children that lack one
    for (const candidate of this.agents.values()) {
      if (candidate.parentId === agent.id && !candidate.workspacePath) {
        candidate.workspacePath = trimmed;
        candidate.projectName = agent.projectName;
        this.refreshRelativePaths(candidate);
      }
    }
  }

  private refreshRelativePaths(agent: InternalAgent): void {
    for (const touch of agent.files.values()) {
      touch.relativePath = computeRelativePath(touch.path, agent.workspacePath);
    }
  }

  private isDuplicateEvent(
    source: 'hook' | 'transcript',
    conversationId: string,
    toolName: string,
    target: string | undefined,
    timestamp: number,
    toolCallId?: string,
  ): boolean {
    if (toolCallId) {
      const idKey = `${conversationId}::${toolCallId}`;
      if (this.seenToolCallIds.has(idKey)) return true;
      this.seenToolCallIds.add(idKey);
      if (this.seenToolCallIds.size > 2000) {
        const first = this.seenToolCallIds.values().next().value;
        if (first) this.seenToolCallIds.delete(first);
      }
    }

    const normTarget = target ? normalizePathKey(target) : '';
    const sig = `${conversationId}|${toolName}|${normTarget}`;
    const prev = this.recentDedup.get(sig);
    // Only deduplicate across different ingestion sources (hook vs transcript) so rapid/parallel
    // same-tool calls within a single transcript turn are never dropped.
    if (
      prev !== undefined &&
      prev.source !== source &&
      Math.abs(timestamp - prev.timestamp) <= DEDUP_WINDOW_MS
    ) {
      return true;
    }
    this.recentDedup.set(sig, { timestamp, source });

    if (this.recentDedup.size > 2000) {
      for (const [k, entry] of this.recentDedup) {
        if (timestamp - entry.timestamp > DEDUP_WINDOW_MS * 5) {
          this.recentDedup.delete(k);
        }
      }
    }
    return false;
  }

  private recordFileTouch(
    agent: InternalAgent,
    filePath: string,
    fileName: string,
    action: FileAction,
    timestamp: number,
  ): void {
    if (!agent.workspacePath) {
      const inferred = inferProjectFromFilePath(filePath);
      if (inferred.workspacePath) {
        this.setWorkspace(agent, inferred.workspacePath);
      } else if (inferred.projectName && agent.projectName === 'Antigravity') {
        agent.projectName = inferred.projectName;
      }
    }

    const key = normalizePathKey(filePath);
    const existing = agent.files.get(key);
    if (existing) {
      existing.action = action;
      existing.lastTouchedAt = Math.max(existing.lastTouchedAt, timestamp);
      existing.count += 1;
      existing.relativePath = computeRelativePath(filePath, agent.workspacePath);
    } else {
      agent.files.set(key, {
        path: filePath,
        relativePath: computeRelativePath(filePath, agent.workspacePath),
        fileName,
        action,
        lastTouchedAt: timestamp,
        count: 1,
      });
    }

    agent.currentFile = { fileName, path: filePath, action };
  }

  private pushActivity(agent: InternalAgent, activity: ActivityEvent): void {
    agent.recentActivity.unshift(activity);
    if (agent.recentActivity.length > MAX_ACTIVITY_ITEMS) {
      agent.recentActivity.length = MAX_ACTIVITY_ITEMS;
    }
  }

  private recordPulse(fromAgentId: string, toAgentId: string, timestamp: number): void {
    if (!fromAgentId || !toAgentId || fromAgentId === toAgentId) return;
    this.pulses.push({
      id: `pulse-${fromAgentId}-${toAgentId}-${timestamp}`,
      fromAgentId,
      toAgentId,
      timestamp,
    });
    if (this.pulses.length > 50) {
      this.pulses.splice(0, this.pulses.length - 50);
    }
  }

  private linkSubagent(
    parentId: string,
    childId: string,
    role: string | undefined,
    typeName: string | undefined,
    workspacePaths: string[],
    timestamp: number,
  ): void {
    if (!childId || childId === parentId) return;
    this.parentLinks.set(childId, { parentId, role, typeName });

    const parent = this.ensureAgent(parentId, timestamp);
    if (workspacePaths.length > 0 && !parent.workspacePath) {
      this.setWorkspace(parent, workspacePaths[0]);
    }

    const child = this.ensureAgent(childId, timestamp);
    child.parentId = parentId;
    if (role) {
      child.role = role;
      child.displayName = role;
      child.hasCustomName = true;
    } else if (child.role === 'Main Agent') {
      child.role = typeName || 'Subagent';
    }
    if (typeName) child.typeName = typeName;

    if (workspacePaths.length > 0) {
      this.setWorkspace(child, workspacePaths[0]);
    } else {
      this.inheritWorkspaceFromParent(child);
    }

    this.recordPulse(parentId, childId, timestamp);
  }

  applyHookEvent(payload: HookEventPayload, now = Date.now()): void {
    if (!payload || typeof payload.conversationId !== 'string' || !payload.conversationId.trim()) {
      return;
    }

    this.hookActive = true;
    this.lastHookAt = now;

    const agent = this.ensureAgent(payload.conversationId, now);
    agent.lastUpdatedAt = Math.max(agent.lastUpdatedAt, now);
    agent.lastHookAt = now;

    if (payload.modelName) {
      agent.modelName = payload.modelName;
    }
    if (Array.isArray(payload.workspacePaths) && payload.workspacePaths.length > 0) {
      this.setWorkspace(agent, payload.workspacePaths[0]);
    } else if (payload.cwd && !agent.workspacePath) {
      this.setWorkspace(agent, payload.cwd);
    }

    if (payload.lastUserInput && !agent.hasCustomName && !agent.parentId) {
      const clean = payload.lastUserInput.replace(/\s+/g, ' ').trim();
      if (clean) {
        agent.displayName = clean.length > 42 ? `${clean.slice(0, 41)}…` : clean;
        agent.hasCustomName = true;
      }
    }

    const eventName = payload.hookEventName;

    if (eventName === 'PreInvocation' || eventName === 'PreToolUse') {
      this.failedGhostIds.delete(agent.id);
      this.hiddenAgents.delete(agent.id);
    }

    if (eventName === 'SessionStart' || eventName === 'PreInvocation') {
      agent.status = 'thinking';
      agent.errorMessage = undefined;
      agent.activeTool = undefined;
    } else if (eventName === 'PostInvocation') {
      agent.activeTool = undefined;
    } else if (
      eventName === 'PreToolUse' &&
      payload.toolCall &&
      typeof payload.toolCall === 'object' &&
      !Array.isArray(payload.toolCall)
    ) {
      const toolName =
        typeof payload.toolCall.name === 'string' ? payload.toolCall.name.trim().slice(0, 128) : '';
      const toolArgs =
        payload.toolCall.args &&
        typeof payload.toolCall.args === 'object' &&
        !Array.isArray(payload.toolCall.args)
          ? payload.toolCall.args
          : undefined;
      const toolCallId =
        typeof payload.toolCall.id === 'string' && payload.toolCall.id.trim()
          ? payload.toolCall.id.trim().slice(0, 128)
          : undefined;

      const classified = classifyToolCall(toolName, toolArgs);
      agent.status = classified.status;
      agent.currentTool = toolName || undefined;
      agent.errorMessage = undefined;
      agent.activeTool = undefined;

      const candidate = detectPendingApprovalCandidate(toolName, toolArgs, agent.workspacePath);
      if (candidate) {
        agent.activeTool = {
          id: toolCallId || `req-${now}-${toolName}`,
          kind: candidate.kind,
          toolName,
          title: candidate.title,
          detail: candidate.detail,
          startedAt: now,
          delayMs: candidate.delayMs,
          announced: candidate.delayMs <= 0,
        };
      }

      if (classified.focusText) {
        agent.focusText = classified.focusText;
      }
      if (classified.recipientId) {
        this.recordPulse(agent.id, classified.recipientId, now);
      }

      const dup = this.isDuplicateEvent(
        'hook',
        agent.id,
        toolName,
        classified.filePath,
        now,
        toolCallId,
      );
      if (classified.filePath && classified.fileName && classified.fileAction) {
        if (!dup) {
          this.recordFileTouch(agent, classified.filePath, classified.fileName, classified.fileAction, now);
        }
      } else {
        agent.currentFile = undefined;
      }
      if (!dup) {
        this.pushActivity(agent, {
          id: toolCallId || `hk-${now}-${toolName}`,
          timestamp: now,
          toolName,
          status: classified.status,
          summary: classified.summary,
          targetPath: classified.filePath,
          fileAction: classified.fileAction,
        });
      }
    } else if (eventName === 'PostToolUse') {
      const postToolCall =
        payload.toolCall && typeof payload.toolCall === 'object' && !Array.isArray(payload.toolCall)
          ? payload.toolCall
          : undefined;
      const postId =
        typeof postToolCall?.id === 'string' && postToolCall.id.trim()
          ? postToolCall.id.trim().slice(0, 128)
          : undefined;
      const postName =
        typeof postToolCall?.name === 'string' ? postToolCall.name.trim().slice(0, 128) : undefined;
      if (
        !postId ||
        !agent.activeTool ||
        agent.activeTool.id === postId ||
        agent.activeTool.toolName === postName
      ) {
        agent.activeTool = undefined;
      }
      if (payload.error) {
        agent.status = 'error';
        agent.errorMessage = payload.error;
        this.pushActivity(agent, {
          id: `hk-err-${now}-${payload.toolCall?.name || 'tool'}`,
          timestamp: now,
          toolName: payload.toolCall?.name || 'tool',
          status: 'error',
          summary: `Error: ${payload.error}`,
          isError: true,
        });
      }
    } else if (eventName === 'Stop') {
      agent.activeTool = undefined;
      if (payload.error) {
        agent.status = 'error';
        agent.errorMessage = payload.error;
      } else {
        agent.status = 'idle';
        agent.currentTool = undefined;
        agent.currentFile = undefined;
      }
    }

    this.emitChange();
  }

  applyTranscriptDelta(
    conversationId: string,
    delta: ParsedTranscriptDelta,
    now = Date.now(),
  ): void {
    const ts = delta.lastTimestamp ?? now;
    const agent = this.ensureAgent(conversationId, delta.createdAt ?? ts);
    agent.createdAt = Math.min(agent.createdAt, delta.createdAt ?? ts);
    agent.lastUpdatedAt = Math.max(agent.lastUpdatedAt, ts);

    if (delta.modelName) {
      agent.modelName = delta.modelName;
    }
    if (delta.workspacePaths.length > 0 && !agent.workspacePath) {
      this.setWorkspace(agent, delta.workspacePaths[0]);
    }
    if (delta.firstUserPrompt && !agent.hasCustomName && !agent.parentId) {
      agent.displayName =
        delta.firstUserPrompt.length > 42
          ? `${delta.firstUserPrompt.slice(0, 41)}…`
          : delta.firstUserPrompt;
      agent.hasCustomName = true;
    }
    if (delta.focusText) {
      agent.focusText = delta.focusText;
    }

    const usedActivityIdx = new Set<number>();
    for (const touch of delta.fileTouches) {
      const matchIdx = delta.activities.findIndex(
        (a, idx) =>
          !usedActivityIdx.has(idx) &&
          a.targetPath === touch.path &&
          a.fileAction === touch.action &&
          a.timestamp === touch.timestamp,
      );
      const matchingActivity = matchIdx >= 0 ? delta.activities[matchIdx] : undefined;
      if (matchIdx >= 0) usedActivityIdx.add(matchIdx);

      const toolName = matchingActivity?.toolName || (touch.action === 'read' ? 'read_file' : 'edit_file');
      const dup = this.isDuplicateEvent('transcript', conversationId, toolName, touch.path, touch.timestamp);
      if (!dup) {
        const { fullPath, fileName } = normalizeFilePath(touch.path);
        this.recordFileTouch(agent, fullPath, fileName, touch.action, touch.timestamp);
        if (matchingActivity) {
          this.pushActivity(agent, matchingActivity);
        }
      }
    }

    delta.activities.forEach((act, idx) => {
      if (usedActivityIdx.has(idx)) return;
      if (act.targetPath && act.fileAction) return;
      const dup = this.isDuplicateEvent('transcript', conversationId, act.toolName, act.targetPath, act.timestamp);
      if (!dup) {
        this.pushActivity(agent, act);
      }
    });

    for (const pulse of delta.messagePulses) {
      this.recordPulse(conversationId, pulse.toAgentId, pulse.timestamp);
    }

    for (const link of delta.subagentLinks) {
      this.linkSubagent(
        conversationId,
        link.childConversationId,
        link.role,
        link.typeName,
        link.workspacePaths,
        link.timestamp,
      );
    }

    if (Array.isArray(delta.failedSubagentIds)) {
      for (const failedId of delta.failedSubagentIds) {
        if (typeof failedId === 'string' && failedId.trim()) {
          this.failedGhostIds.add(failedId.trim());
        }
      }
    }

    // Clear stale activeTool if a newer transcript step proves the tool completed
    // (e.g., if a PostToolUse hook was missed/dropped)
    if (
      agent.activeTool &&
      ts > agent.activeTool.startedAt &&
      (delta.lastStatus === 'idle' ||
        (delta.lastToolName && delta.lastToolName !== agent.activeTool.toolName))
    ) {
      agent.activeTool = undefined;
    }

    // Only override status from transcript if hook hasn't updated more recently
    if (delta.lastStatus && (!agent.lastHookAt || ts >= agent.lastHookAt)) {
      agent.status = delta.lastStatus;
      if (delta.lastToolName) agent.currentTool = delta.lastToolName;
      if (delta.lastError) agent.errorMessage = delta.lastError;
      if (delta.lastStatus !== 'editing' && delta.lastStatus !== 'reading') {
        agent.currentFile = undefined;
      }
    }

    // If this transcript's last event is already older than IDLE_TIMEOUT_MS, mark idle
    if (!agent.activeTool && agent.status !== 'idle' && now - agent.lastUpdatedAt > IDLE_TIMEOUT_MS) {
      agent.status = 'idle';
      agent.currentTool = undefined;
    }

    this.emitChange();
  }

  private resolvePendingApproval(
    agent: InternalAgent,
    now: number,
  ): PendingApprovalRequest | undefined {
    const tool = agent.activeTool;
    if (!tool) return undefined;
    const elapsed = now - tool.startedAt;
    if (elapsed < tool.delayMs || elapsed > APPROVAL_STALE_MS) {
      return undefined;
    }
    return {
      id: tool.id,
      kind: tool.kind,
      toolName: tool.toolName,
      title: tool.title,
      detail: tool.detail,
      startedAt: tool.startedAt,
    };
  }

  tickIdleCheck(now = Date.now()): boolean {
    let changed = false;
    for (const agent of this.agents.values()) {
      if (agent.activeTool) {
        const elapsed = now - agent.activeTool.startedAt;
        if (elapsed > APPROVAL_STALE_MS) {
          agent.activeTool = undefined;
          changed = true;
        } else if (!agent.activeTool.announced && elapsed >= agent.activeTool.delayMs) {
          agent.activeTool.announced = true;
          changed = true;
        }
      }

      if (
        !agent.activeTool &&
        agent.status !== 'idle' &&
        now - agent.lastUpdatedAt > IDLE_TIMEOUT_MS
      ) {
        agent.status = 'idle';
        agent.currentTool = undefined;
        changed = true;
      }
    }

    const prevPulseCount = this.pulses.length;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      if (now - this.pulses[i].timestamp > PULSE_TTL_MS) {
        this.pulses.splice(i, 1);
      }
    }
    if (this.pulses.length !== prevPulseCount) {
      changed = true;
    }

    if (changed) {
      this.emitChange();
    }
    return changed;
  }

  private resolveRootId(agentId: string): string {
    const visited = new Set<string>();
    let currentId = agentId;
    while (true) {
      if (visited.has(currentId)) return currentId;
      visited.add(currentId);
      const agent = this.agents.get(currentId);
      const parentId = agent?.parentId ?? this.parentLinks.get(currentId)?.parentId ?? null;
      if (!parentId || !this.agents.has(parentId)) {
        return currentId;
      }
      currentId = parentId;
    }
  }

  getSnapshot(options: { recency?: RecencyWindow; now?: number } = {}): OfficeSnapshot {
    const now = options.now ?? Date.now();
    const recency = options.recency ?? '30m';
    const cutoff = getRecencyCutoffMs(recency, now);

    // Group all agents by their resolved rootId
    const clusterMembers = new Map<string, InternalAgent[]>();
    for (const agent of this.agents.values()) {
      const rootId = this.resolveRootId(agent.id);
      const list = clusterMembers.get(rootId) ?? [];
      list.push(agent);
      clusterMembers.set(rootId, list);
    }

    const clusters: TeamCluster[] = [];
    const agentsOut: Record<string, AgentNode> = {};

    for (const [rootId, members] of clusterMembers.entries()) {
      // Sort: lead first, then subagents by createdAt
      members.sort((a, b) => {
        if (a.id === rootId) return -1;
        if (b.id === rootId) return 1;
        return a.createdAt - b.createdAt;
      });

      const visibleMembers = members.filter((m) => {
        const isSubagent = m.id !== rootId || Boolean(m.parentId);
        if (this.hiddenAgents.has(m.id)) return false;
        if (this.failedGhostIds.has(m.id) && m.files.size === 0 && m.recentActivity.length === 0) {
          return false;
        }
        if (
          isSubagent &&
          m.status === 'idle' &&
          m.files.size === 0 &&
          m.recentActivity.length === 0 &&
          !m.lastHookAt &&
          now - m.createdAt > 15_000
        ) {
          return false;
        }
        return true;
      });

      if (visibleMembers.length === 0) {
        continue;
      }

      const hasActive = visibleMembers.some(
        (m) => m.status !== 'idle' || Boolean(this.resolvePendingApproval(m, now)),
      );
      const clusterUpdatedAt = Math.max(...visibleMembers.map((m) => m.lastUpdatedAt));
      if (!hasActive && clusterUpdatedAt < cutoff) {
        continue;
      }

      const lead = visibleMembers[0];
      const leadAlias = this.customAliases.get(lead.id);
      const projectName =
        visibleMembers.find((m) => m.projectName !== 'Antigravity')?.projectName ||
        members.find((m) => m.projectName !== 'Antigravity')?.projectName ||
        lead.projectName;
      const workspacePath =
        visibleMembers.find((m) => m.workspacePath)?.workspacePath ||
        members.find((m) => m.workspacePath)?.workspacePath ||
        lead.workspacePath;

      const assignedFloorId = this.teamFloors.get(rootId);
      const validFloorId =
        assignedFloorId && this.floors.some((f) => f.id === assignedFloorId)
          ? assignedFloorId
          : this.floors[0].id;

      const customRoomName = this.roomNames.get(rootId);
      clusters.push({
        rootId,
        projectName,
        roomName: customRoomName || projectName,
        hasCustomRoomName: Boolean(customRoomName),
        workspacePath,
        title: leadAlias || lead.displayName,
        leadAgentId: lead.id,
        agentIds: visibleMembers.map((m) => m.id),
        floorId: validFloorId,
        lastUpdatedAt: clusterUpdatedAt,
      });

      for (const m of visibleMembers) {
        const sortedFiles = Array.from(m.files.values()).sort(
          (a, b) => b.lastTouchedAt - a.lastTouchedAt,
        );
        const alias = this.customAliases.get(m.id);
        const pendingApproval = this.resolvePendingApproval(m, now);
        agentsOut[m.id] = {
          id: m.id,
          parentId: m.parentId,
          rootId,
          isSubagent: m.id !== rootId || Boolean(m.parentId),
          displayName: alias || m.displayName,
          hasCustomAlias: Boolean(alias),
          role: m.id === rootId && !m.parentId ? 'Main Agent' : m.role,
          typeName: m.typeName,
          modelName: m.modelName,
          workspacePath: m.workspacePath ?? workspacePath,
          projectName: m.projectName !== 'Antigravity' ? m.projectName : projectName,
          status: m.status,
          focusText: m.focusText,
          currentTool: m.currentTool,
          currentFile: m.currentFile,
          files: sortedFiles,
          recentActivity: [...m.recentActivity],
          lastUpdatedAt: m.lastUpdatedAt,
          lastHookAt: m.lastHookAt,
          createdAt: m.createdAt,
          errorMessage: m.errorMessage,
          pendingApproval,
        };
      }
    }

    clusters.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);

    const activePulses = this.pulses.filter(
      (p) =>
        now - p.timestamp <= PULSE_TTL_MS &&
        !this.hiddenAgents.has(p.fromAgentId) &&
        !this.hiddenAgents.has(p.toAgentId),
    );

    return {
      generatedAt: now,
      hookActive: this.hookActive,
      lastHookAt: this.lastHookAt,
      demoMode: false,
      floors: this.floors.map((f) => ({ ...f })),
      clusters,
      agents: agentsOut,
      activePulses,
      hiddenCount: this.hiddenAgents.size,
    };
  }
}
