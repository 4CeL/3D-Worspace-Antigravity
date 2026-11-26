import {
  classifyToolCall,
  normalizeFilePath,
  type ActivePulse,
  type ActivityEvent,
  type AgentNode,
  type AgentStatus,
  type BuildingConfig,
  type FileAction,
  type FileTouch,
  type FloorConfig,
  type HookEventPayload,
  type OfficeSnapshot,
  type RecencyWindow,
  type TeamCluster,
} from '@office/shared';
import {
  MAX_FLOORS,
  createDefaultBuildingConfig,
  normalizeBuildingConfig,
} from './buildingStore.js';
import type { ParsedTranscriptDelta } from './transcriptParser.js';

interface ParentLink {
  parentId: string;
  role?: string;
  typeName?: string;
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
  files: Map<string, FileTouch>;
  recentActivity: ActivityEvent[];
  lastUpdatedAt: number;
  lastHookAt?: number;
  createdAt: number;
  errorMessage?: string;
}

const IDLE_TIMEOUT_MS = 20_000;
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
  }

  addFloor(name?: string): FloorConfig | null {
    if (this.floors.length >= MAX_FLOORS) return null;
    const nextIndex = this.floors.length + 1;
    let id = `floor-${nextIndex}`;
    while (this.floors.some((f) => f.id === id)) {
      id = `floor-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    const label =
      typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : `Lantai ${nextIndex}`;
    const floor: FloorConfig = { id, index: nextIndex, name: label };
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
    const trimmedRoot = rootId.trim();
    if (!trimmedRoot || !this.floors.some((f) => f.id === floorId)) return false;
    this.teamFloors.set(trimmedRoot, floorId);
    this.emitChange();
    return true;
  }

  getBuildingConfig(): BuildingConfig {
    const teamFloors: Record<string, string> = {};
    for (const [k, v] of this.teamFloors.entries()) {
      teamFloors[k] = v;
    }
    return {
      floors: this.floors.map((f) => ({ ...f })),
      teamFloors,
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

    if (eventName === 'SessionStart' || eventName === 'PreInvocation') {
      agent.status = 'thinking';
      agent.errorMessage = undefined;
    } else if (eventName === 'PreToolUse' && payload.toolCall) {
      const classified = classifyToolCall(payload.toolCall.name, payload.toolCall.args);
      agent.status = classified.status;
      agent.currentTool = payload.toolCall.name;
      agent.errorMessage = undefined;

      if (classified.focusText) {
        agent.focusText = classified.focusText;
      }
      if (classified.recipientId) {
        this.recordPulse(agent.id, classified.recipientId, now);
      }

      const dup = this.isDuplicateEvent(
        'hook',
        agent.id,
        payload.toolCall.name,
        classified.filePath,
        now,
        payload.toolCall.id,
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
          id: payload.toolCall.id || `hk-${now}-${payload.toolCall.name}`,
          timestamp: now,
          toolName: payload.toolCall.name,
          status: classified.status,
          summary: classified.summary,
          targetPath: classified.filePath,
          fileAction: classified.fileAction,
        });
      }
    } else if (eventName === 'PostToolUse') {
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
    if (agent.status !== 'idle' && now - agent.lastUpdatedAt > IDLE_TIMEOUT_MS) {
      agent.status = 'idle';
      agent.currentTool = undefined;
    }

    this.emitChange();
  }

  tickIdleCheck(now = Date.now()): boolean {
    let changed = false;
    for (const agent of this.agents.values()) {
      if (agent.status !== 'idle' && now - agent.lastUpdatedAt > IDLE_TIMEOUT_MS) {
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
      const hasActive = members.some((m) => m.status !== 'idle');
      const clusterUpdatedAt = Math.max(...members.map((m) => m.lastUpdatedAt));
      if (!hasActive && clusterUpdatedAt < cutoff) {
        continue;
      }

      // Sort: lead first, then subagents by createdAt
      members.sort((a, b) => {
        if (a.id === rootId) return -1;
        if (b.id === rootId) return 1;
        return a.createdAt - b.createdAt;
      });

      const lead = members[0];
      const leadAlias = this.customAliases.get(lead.id);
      const projectName =
        members.find((m) => m.projectName !== 'Antigravity')?.projectName || lead.projectName;
      const workspacePath =
        members.find((m) => m.workspacePath)?.workspacePath || lead.workspacePath;

      const assignedFloorId = this.teamFloors.get(rootId);
      const validFloorId =
        assignedFloorId && this.floors.some((f) => f.id === assignedFloorId)
          ? assignedFloorId
          : this.floors[0].id;

      clusters.push({
        rootId,
        projectName,
        workspacePath,
        title: leadAlias || lead.displayName,
        leadAgentId: lead.id,
        agentIds: members.map((m) => m.id),
        floorId: validFloorId,
        lastUpdatedAt: clusterUpdatedAt,
      });

      for (const m of members) {
        const sortedFiles = Array.from(m.files.values()).sort(
          (a, b) => b.lastTouchedAt - a.lastTouchedAt,
        );
        const alias = this.customAliases.get(m.id);
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
        };
      }
    }

    clusters.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);

    const activePulses = this.pulses.filter((p) => now - p.timestamp <= PULSE_TTL_MS);

    return {
      generatedAt: now,
      hookActive: this.hookActive,
      lastHookAt: this.lastHookAt,
      demoMode: false,
      floors: this.floors.map((f) => ({ ...f })),
      clusters,
      agents: agentsOut,
      activePulses,
    };
  }
}
