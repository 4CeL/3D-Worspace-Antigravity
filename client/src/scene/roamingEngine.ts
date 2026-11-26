import type { AgentNode, AgentStatus, FloorTheme } from '@office/shared';
import type { DeskPlacement, FloorLayout, OfficeLayout } from './officeLayout';

export type RoamingMode = 'seated' | 'walking_out' | 'visiting' | 'chatting' | 'returning';

export type RoamingBubble = '💬' | '☕' | '💡' | '👋' | null;

export interface FloorWaypoint {
  id: string;
  label: string;
  x: number;
  z: number;
  preferredBubble?: Exclude<RoamingBubble, null>;
}

export interface RoamingAgentState {
  agentId: string;
  floorId: string;
  mode: RoamingMode;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  bubble: RoamingBubble;
  partnerId: string | null;
  targetWaypointId: string | null;
  activityLabel: string;
}

interface Point2D {
  x: number;
  z: number;
}

interface InternalAgentRecord {
  agentId: string;
  floorId: string;
  isSubagent: boolean;
  status: AgentStatus;
  hash: number;
  deskX: number;
  deskY: number;
  deskZ: number;
  deskRotationY: number;
  seatX: number;
  seatZ: number;
  exitX: number;
  exitZ: number;
  mode: RoamingMode;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  idleElapsed: number;
  idleDelay: number;
  stateTimer: number;
  bubbleTimer: number;
  bubbleIndex: number;
  bubble: RoamingBubble;
  partnerId: string | null;
  targetWaypointId: string | null;
  visitCount: number;
  path: Point2D[];
  chatSpot: Point2D | null;
  activityLabel: string;
}

const WALK_SPEED = 1.85;
const RETURN_SPEED = 3.6;
const TURN_RATE = 9.0;
const SEAT_SNAP_DIST = 0.15;
const WAYPOINT_SNAP_DIST = 0.16;
const CHAT_SPACING = 0.96;
const CHAT_PAIR_RADIUS = 2.65;
const CHAT_BUBBLES: readonly Exclude<RoamingBubble, null>[] = ['💬', '☕', '💡', '👋'];

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, alpha);
}

/**
 * Returns 6 safe perimeter/corridor walkable waypoints per floor strictly outside
 * center desk footprints, wall edges, ElevatorCore, and furniture bounds.
 */
export function computeFloorWaypoints(
  floorWidth: number,
  floorDepth: number,
  theme: FloorTheme,
): FloorWaypoint[] {
  const halfW = floorWidth / 2;
  const halfD = floorDepth / 2;

  const pantryPoint: FloorWaypoint =
    theme === 'pantry'
      ? {
          id: 'pantry-alcove',
          label: 'Di Pantry',
          x: halfW - 2.55,
          z: -halfD + 3.45,
          preferredBubble: '☕',
        }
      : theme === 'lobby'
        ? {
            id: 'pantry-alcove',
            label: 'Di Coffee Bar',
            x: halfW - 2.6,
            z: -halfD + 2.35,
            preferredBubble: '☕',
          }
        : theme === 'engineering'
          ? {
              id: 'pantry-alcove',
              label: 'Cek Server',
              x: halfW - 2.15,
              z: -halfD + 2.25,
              preferredBubble: '💡',
            }
          : {
              id: 'pantry-alcove',
              label: 'Di Rak Studio',
              x: halfW - 2.25,
              z: -halfD + 2.2,
              preferredBubble: '💡',
            };

  const loungeLabel =
    theme === 'lobby'
      ? 'Di Lounge'
      : theme === 'creative'
        ? 'Ruang Diskusi'
        : theme === 'pantry'
          ? 'Area Bistro'
          : 'Sudut Santai';

  return [
    pantryPoint,
    {
      id: 'front-left-room',
      label: loungeLabel,
      x: -halfW + 3.15,
      z: halfD - 4.15,
      preferredBubble: theme === 'creative' ? '💡' : '☕',
    },
    {
      id: 'elevator-hall',
      label: 'Lorong Lift',
      x: -halfW + 3.05,
      z: -halfD + 3.45,
      preferredBubble: '👋',
    },
    {
      id: 'west-corridor',
      label: 'Jalan-jalan',
      x: -halfW + 3.1,
      z: -0.4,
    },
    {
      id: 'north-window',
      label: 'Lihat Jendela',
      x: 0.6,
      z: -halfD + 3.55,
    },
    {
      id: 'front-right-plant',
      label: 'Santai',
      x: halfW - 2.45,
      z: halfD - 2.55,
    },
  ];
}

export class RoamingController {
  private floorWidth = 17;
  private floorDepth = 17;
  private floorsById = new Map<string, FloorLayout>();
  private waypointsByFloor = new Map<string, FloorWaypoint[]>();
  private records = new Map<string, InternalAgentRecord>();
  private lastRoamingSignature = '';

  public syncLayout(layout: OfficeLayout, agents: Record<string, AgentNode>): boolean {
    this.floorWidth = layout.floorWidth;
    this.floorDepth = layout.floorDepth;

    this.floorsById.clear();
    this.waypointsByFloor.clear();
    for (const floor of layout.floors) {
      this.floorsById.set(floor.floorId, floor);
      this.waypointsByFloor.set(
        floor.floorId,
        computeFloorWaypoints(layout.floorWidth, layout.floorDepth, floor.theme),
      );
    }

    const activeIds = new Set<string>();

    for (const [agentId, desk] of Object.entries(layout.desks)) {
      const agent = agents[agentId];
      if (!agent) continue;
      activeIds.add(agentId);

      const { seatX, seatZ, exitX, exitZ } = this.computeSeatAnchors(desk);
      const existing = this.records.get(agentId);

      if (!existing) {
        const hash = hashString(agentId);
        // Deterministic staggered delay in [3.0, 5.5] seconds
        const idleDelay = 3.0 + ((hash % 2501) / 1000);
        this.records.set(agentId, {
          agentId,
          floorId: desk.floorId,
          isSubagent: agent.isSubagent,
          status: agent.status,
          hash,
          deskX: desk.position[0],
          deskY: desk.position[1],
          deskZ: desk.position[2],
          deskRotationY: desk.rotationY,
          seatX,
          seatZ,
          exitX,
          exitZ,
          mode: 'seated',
          x: seatX,
          y: desk.position[1],
          z: seatZ,
          rotationY: desk.rotationY + Math.PI,
          idleElapsed: 0,
          idleDelay,
          stateTimer: 0,
          bubbleTimer: 0,
          bubbleIndex: hash % CHAT_BUBBLES.length,
          bubble: null,
          partnerId: null,
          targetWaypointId: null,
          visitCount: 0,
          path: [],
          chatSpot: null,
          activityLabel: 'Santai',
        });
      } else {
        const floorChanged = existing.floorId !== desk.floorId;
        const seatMoved =
          Math.hypot(existing.seatX - seatX, existing.seatZ - seatZ) > 0.05;
        existing.floorId = desk.floorId;
        existing.isSubagent = agent.isSubagent;
        existing.status = agent.status;
        existing.deskX = desk.position[0];
        existing.deskY = desk.position[1];
        existing.deskZ = desk.position[2];
        existing.deskRotationY = desk.rotationY;
        existing.seatX = seatX;
        existing.seatZ = seatZ;
        existing.exitX = exitX;
        existing.exitZ = exitZ;
        existing.y = desk.position[1];

        if (!existing.isSubagent || floorChanged) {
          this.unpair(existing);
          existing.mode = 'seated';
          existing.x = seatX;
          existing.z = seatZ;
          existing.rotationY = desk.rotationY + Math.PI;
          existing.path = [];
          existing.bubble = null;
          existing.targetWaypointId = null;
          existing.activityLabel = 'Di Meja';
          existing.idleElapsed = 0;
        } else if (existing.mode === 'seated') {
          existing.x = seatX;
          existing.z = seatZ;
          existing.rotationY = desk.rotationY + Math.PI;
        } else if (existing.status !== 'idle' && existing.mode !== 'returning') {
          this.beginReturnToDesk(existing);
        } else if (existing.mode === 'returning' && seatMoved) {
          this.beginReturnToDesk(existing);
        }
      }
    }

    // Prune removed agents cleanly
    for (const [id, rec] of this.records) {
      if (!activeIds.has(id)) {
        this.unpair(rec);
        this.records.delete(id);
      }
    }

    return this.checkRoamingSignatureChanged();
  }

  /**
   * Advances simulation by dt seconds.
   * Returns true ONLY when the set of roaming agent IDs (mode !== 'seated') changed.
   */
  public step(dt: number): boolean {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    const clampedDt = Math.min(dt, 0.25);

    for (const rec of this.records.values()) {
      // Main agents never roam
      if (!rec.isSubagent) {
        if (rec.mode !== 'seated') {
          this.unpair(rec);
          rec.mode = 'seated';
          rec.x = rec.seatX;
          rec.z = rec.seatZ;
          rec.bubble = null;
        }
        continue;
      }

      // Immediate return when assigned work
      if (rec.status !== 'idle') {
        rec.idleElapsed = 0;
        if (rec.mode !== 'seated' && rec.mode !== 'returning') {
          this.beginReturnToDesk(rec);
        }
      }

      switch (rec.mode) {
        case 'seated':
          this.stepSeated(rec, clampedDt);
          break;
        case 'walking_out':
          this.stepWalkingOut(rec, clampedDt);
          break;
        case 'visiting':
          this.stepVisiting(rec, clampedDt);
          break;
        case 'chatting':
          this.stepChatting(rec, clampedDt);
          break;
        case 'returning':
          this.stepReturning(rec, clampedDt);
          break;
      }
    }

    return this.checkRoamingSignatureChanged();
  }

  public getState(agentId: string): RoamingAgentState | undefined {
    const rec = this.records.get(agentId);
    if (!rec) return undefined;
    return {
      agentId: rec.agentId,
      floorId: rec.floorId,
      mode: rec.mode,
      x: rec.x,
      y: rec.y,
      z: rec.z,
      rotationY: rec.rotationY,
      bubble: rec.bubble,
      partnerId: rec.partnerId,
      targetWaypointId: rec.targetWaypointId,
      activityLabel: rec.activityLabel,
    };
  }

  public getRoamingAgentIds(): Set<string> {
    const ids = new Set<string>();
    for (const rec of this.records.values()) {
      if (rec.mode !== 'seated') {
        ids.add(rec.agentId);
      }
    }
    return ids;
  }

  private computeSeatAnchors(desk: DeskPlacement) {
    const sinR = Math.sin(desk.rotationY);
    const cosR = Math.cos(desk.rotationY);
    const deskX = desk.position[0];
    const deskZ = desk.position[2];
    return {
      seatX: deskX + 0.56 * sinR,
      seatZ: deskZ + 0.56 * cosR,
      exitX: deskX + 1.02 * sinR,
      exitZ: deskZ + 1.02 * cosR,
    };
  }

  private stepSeated(rec: InternalAgentRecord, dt: number): void {
    if (rec.status !== 'idle') {
      rec.idleElapsed = 0;
      return;
    }

    rec.idleElapsed += dt;
    if (rec.idleElapsed >= rec.idleDelay) {
      const wp = this.chooseNextWaypoint(rec);
      if (!wp) return;
      rec.targetWaypointId = wp.id;
      rec.activityLabel = wp.label;
      rec.path = this.buildPathToWaypoint(rec, wp, true);
      rec.mode = 'walking_out';
      rec.bubble = null;
    }
  }

  private stepWalkingOut(rec: InternalAgentRecord, dt: number): void {
    const arrived = this.followPath(rec, WALK_SPEED, dt, WAYPOINT_SNAP_DIST);

    // If walking right past a lone visiting coworker on the same floor, stop and chat!
    if (!arrived && this.tryPairWalkingWithVisitor(rec)) {
      return;
    }

    if (arrived) {
      rec.mode = 'visiting';
      rec.visitCount += 1;
      rec.stateTimer = 4.5 + ((rec.hash + rec.visitCount * 733) % 3200) / 1000;
      const wp = this.findWaypoint(rec.floorId, rec.targetWaypointId);
      rec.bubble = wp?.preferredBubble ?? null;
      rec.activityLabel = wp?.label ?? 'Santai';

      // Immediately check if another idle subagent on this floor is ready to chat
      this.tryPairForChat(rec);
    }
  }

  private stepVisiting(rec: InternalAgentRecord, dt: number): void {
    // Opportunistically pair with a nearby visiting subagent on the same floor
    if (this.tryPairForChat(rec)) {
      return;
    }

    rec.stateTimer -= dt;
    if (rec.stateTimer <= 0) {
      // If a coworker is already walking to our waypoint to meet us, hold briefly instead of walking away
      const hasIncomingPeer = Array.from(this.records.values()).some(
        (other) =>
          other.agentId !== rec.agentId &&
          other.floorId === rec.floorId &&
          other.isSubagent &&
          other.status === 'idle' &&
          other.mode === 'walking_out' &&
          other.partnerId === null &&
          other.targetWaypointId !== null &&
          other.targetWaypointId === rec.targetWaypointId,
      );
      if (hasIncomingPeer) {
        rec.stateTimer = 1.5;
        return;
      }

      const nextWp = this.chooseNextWaypoint(rec);
      if (!nextWp) return;
      rec.targetWaypointId = nextWp.id;
      rec.activityLabel = nextWp.label;
      rec.path = this.buildPathToWaypoint(rec, nextWp, false);
      rec.bubble = null;
      rec.mode = 'walking_out';
    }
  }

  private stepChatting(rec: InternalAgentRecord, dt: number): void {
    const partner = rec.partnerId ? this.records.get(rec.partnerId) : undefined;
    if (!partner || partner.mode !== 'chatting' || partner.partnerId !== rec.agentId) {
      rec.partnerId = null;
      rec.chatSpot = null;
      rec.bubble = null;
      rec.mode = 'visiting';
      rec.stateTimer = 2.0;
      return;
    }

    // Ease smoothly onto non-clipping chat spot
    if (rec.chatSpot) {
      const dx = rec.chatSpot.x - rec.x;
      const dz = rec.chatSpot.z - rec.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.03) {
        const stepDist = Math.min(dist, WALK_SPEED * dt);
        rec.x += (dx / dist) * stepDist;
        rec.z += (dz / dist) * stepDist;
      } else {
        rec.x = rec.chatSpot.x;
        rec.z = rec.chatSpot.z;
      }
    }

    // Face each other smoothly
    const faceDx = partner.x - rec.x;
    const faceDz = partner.z - rec.z;
    if (Math.hypot(faceDx, faceDz) > 0.001) {
      const targetRot = Math.atan2(faceDx, faceDz);
      rec.rotationY = lerpAngle(rec.rotationY, targetRot, TURN_RATE * dt);
    }

    // Cycle cheerful interaction bubbles
    rec.bubbleTimer -= dt;
    if (rec.bubbleTimer <= 0) {
      rec.bubbleIndex = (rec.bubbleIndex + 1) % CHAT_BUBBLES.length;
      rec.bubble = CHAT_BUBBLES[rec.bubbleIndex];
      rec.bubbleTimer = 2.4;
    }

    rec.stateTimer -= dt;
    if (rec.stateTimer <= 0) {
      this.finishChatAndStroll(rec, partner);
    }
  }

  private stepReturning(rec: InternalAgentRecord, dt: number): void {
    const arrived = this.followPath(rec, RETURN_SPEED, dt, SEAT_SNAP_DIST);
    const distToSeat = Math.hypot(rec.seatX - rec.x, rec.seatZ - rec.z);
    if (arrived || distToSeat <= SEAT_SNAP_DIST) {
      rec.x = rec.seatX;
      rec.z = rec.seatZ;
      rec.rotationY = rec.deskRotationY + Math.PI;
      rec.path = [];
      rec.mode = 'seated';
      rec.bubble = null;
      rec.partnerId = null;
      rec.chatSpot = null;
      rec.idleElapsed = 0;
      rec.activityLabel = 'Di Meja';
    }
  }

  private beginReturnToDesk(rec: InternalAgentRecord): void {
    this.unpair(rec);
    rec.mode = 'returning';
    rec.bubble = null;
    rec.targetWaypointId = null;
    rec.activityLabel = 'Kembali ke meja';

    const distToExit = Math.hypot(rec.exitX - rec.x, rec.exitZ - rec.z);
    if (distToExit > 0.35) {
      rec.path = [
        { x: rec.exitX, z: rec.exitZ },
        { x: rec.seatX, z: rec.seatZ },
      ];
    } else {
      rec.path = [{ x: rec.seatX, z: rec.seatZ }];
    }
  }

  private unpair(rec: InternalAgentRecord): void {
    if (!rec.partnerId) return;
    const partner = this.records.get(rec.partnerId);
    rec.partnerId = null;
    rec.chatSpot = null;
    if (partner && partner.partnerId === rec.agentId) {
      partner.partnerId = null;
      partner.chatSpot = null;
      if (partner.mode === 'chatting') {
        partner.mode = 'visiting';
        partner.bubble = null;
        partner.stateTimer = 2.2;
        partner.activityLabel = 'Santai';
      }
    }
  }

  private finishChatAndStroll(a: InternalAgentRecord, b: InternalAgentRecord): void {
    a.partnerId = null;
    b.partnerId = null;
    a.chatSpot = null;
    b.chatSpot = null;
    a.bubble = null;
    b.bubble = null;

    for (const rec of [a, b]) {
      const nextWp = this.chooseNextWaypoint(rec);
      if (nextWp) {
        rec.targetWaypointId = nextWp.id;
        rec.activityLabel = nextWp.label;
        rec.path = this.buildPathToWaypoint(rec, nextWp, false);
        rec.mode = 'walking_out';
      } else {
        rec.mode = 'visiting';
        rec.stateTimer = 3.0;
      }
    }
  }

  private tryPairWalkingWithVisitor(walker: InternalAgentRecord): boolean {
    if (walker.mode !== 'walking_out' || walker.partnerId !== null || walker.status !== 'idle') {
      return false;
    }

    for (const candidate of this.records.values()) {
      if (candidate.agentId === walker.agentId) continue;
      if (candidate.floorId !== walker.floorId) continue;
      if (!candidate.isSubagent || candidate.status !== 'idle') continue;
      if (candidate.mode !== 'visiting' || candidate.partnerId !== null) continue;

      const d = Math.hypot(candidate.x - walker.x, candidate.z - walker.z);
      if (d <= 1.85) {
        walker.path = [];
        walker.mode = 'visiting';
        return this.pairAgentsForChat(walker, candidate);
      }
    }
    return false;
  }

  private tryPairForChat(rec: InternalAgentRecord): boolean {
    if (rec.mode !== 'visiting' || rec.partnerId !== null || rec.status !== 'idle') {
      return false;
    }

    let bestPartner: InternalAgentRecord | null = null;
    let bestDist = Infinity;

    for (const candidate of this.records.values()) {
      if (candidate.agentId === rec.agentId) continue;
      if (candidate.floorId !== rec.floorId) continue;
      if (!candidate.isSubagent || candidate.status !== 'idle') continue;
      if (candidate.mode !== 'visiting' || candidate.partnerId !== null) continue;

      const d = Math.hypot(candidate.x - rec.x, candidate.z - rec.z);
      const sameWaypoint =
        rec.targetWaypointId !== null && rec.targetWaypointId === candidate.targetWaypointId;
      if (sameWaypoint || d <= CHAT_PAIR_RADIUS) {
        if (d < bestDist) {
          bestDist = d;
          bestPartner = candidate;
        }
      }
    }

    if (!bestPartner) return false;
    return this.pairAgentsForChat(rec, bestPartner);
  }

  private pairAgentsForChat(rec: InternalAgentRecord, bestPartner: InternalAgentRecord): boolean {
    // Compute clean non-clipping chat spots ~CHAT_SPACING units apart
    const halfW = this.floorWidth / 2;
    const halfD = this.floorDepth / 2;
    const midX = clamp((rec.x + bestPartner.x) / 2, -halfW + 1.5, halfW - 1.5);
    const midZ = clamp((rec.z + bestPartner.z) / 2, -halfD + 1.5, halfD - 1.5);

    let dx = bestPartner.x - rec.x;
    let dz = bestPartner.z - rec.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) {
      const fallbackAngle = ((rec.hash % 360) * Math.PI) / 180;
      dx = Math.cos(fallbackAngle);
      dz = Math.sin(fallbackAngle);
    } else {
      dx /= len;
      dz /= len;
    }

    const halfGap = CHAT_SPACING / 2;
    const spotA: Point2D = {
      x: clamp(midX - dx * halfGap, -halfW + 1.2, halfW - 1.2),
      z: clamp(midZ - dz * halfGap, -halfD + 1.2, halfD - 1.2),
    };
    const spotB: Point2D = {
      x: clamp(midX + dx * halfGap, -halfW + 1.2, halfW - 1.2),
      z: clamp(midZ + dz * halfGap, -halfD + 1.2, halfD - 1.2),
    };

    const chatDuration = 6.0 + (((rec.hash ^ bestPartner.hash) >>> 0) % 3001) / 1000;

    rec.mode = 'chatting';
    bestPartner.mode = 'chatting';
    rec.partnerId = bestPartner.agentId;
    bestPartner.partnerId = rec.agentId;
    rec.chatSpot = spotA;
    bestPartner.chatSpot = spotB;
    rec.stateTimer = chatDuration;
    bestPartner.stateTimer = chatDuration;

    rec.bubbleIndex = rec.hash % CHAT_BUBBLES.length;
    bestPartner.bubbleIndex = (rec.bubbleIndex + 1) % CHAT_BUBBLES.length;
    rec.bubble = CHAT_BUBBLES[rec.bubbleIndex];
    bestPartner.bubble = CHAT_BUBBLES[bestPartner.bubbleIndex];
    rec.bubbleTimer = 2.2;
    bestPartner.bubbleTimer = 2.8;
    rec.activityLabel = 'Ngobrol';
    bestPartner.activityLabel = 'Ngobrol';

    // Immediately orient toward each other so initial frame looks responsive
    rec.rotationY = Math.atan2(spotB.x - spotA.x, spotB.z - spotA.z);
    bestPartner.rotationY = Math.atan2(spotA.x - spotB.x, spotA.z - spotB.z);

    return true;
  }

  private chooseNextWaypoint(rec: InternalAgentRecord): FloorWaypoint | null {
    const list = this.waypointsByFloor.get(rec.floorId);
    if (!list || list.length === 0) return null;

    // Prefer joining a lone visiting or strolling coworker on the same floor so social chats emerge naturally
    const lonePeer = Array.from(this.records.values()).find(
      (other) =>
        other.agentId !== rec.agentId &&
        other.floorId === rec.floorId &&
        other.isSubagent &&
        other.status === 'idle' &&
        (other.mode === 'visiting' || other.mode === 'walking_out') &&
        other.partnerId === null &&
        other.targetWaypointId !== null &&
        other.targetWaypointId !== rec.targetWaypointId,
    );

    if (lonePeer && lonePeer.targetWaypointId) {
      const shared = this.findWaypoint(rec.floorId, lonePeer.targetWaypointId);
      if (shared) {
        if (lonePeer.mode === 'visiting') {
          // Hold long enough for the incoming coworker to arrive across larger floors
          const travelEta = Math.hypot(shared.x - rec.x, shared.z - rec.z) / WALK_SPEED;
          lonePeer.stateTimer = Math.max(lonePeer.stateTimer, Math.min(16, travelEta + 2.5));
        }
        return shared;
      }
    }

    const candidates = list.filter((w) => w.id !== rec.targetWaypointId);
    const pool = candidates.length > 0 ? candidates : list;
    const idx = (rec.hash + rec.visitCount * 7) % pool.length;
    return pool[idx];
  }

  private findWaypoint(floorId: string, waypointId: string | null): FloorWaypoint | null {
    if (!waypointId) return null;
    const list = this.waypointsByFloor.get(floorId);
    return list?.find((w) => w.id === waypointId) ?? null;
  }

  private buildPathToWaypoint(
    rec: InternalAgentRecord,
    wp: FloorWaypoint,
    fromDesk: boolean,
  ): Point2D[] {
    const path: Point2D[] = [];
    const halfW = this.floorWidth / 2;
    const halfD = this.floorDepth / 2;

    if (fromDesk) {
      path.push({ x: rec.exitX, z: rec.exitZ });
    }

    // Route through perimeter corridor hub when crossing between opposite sides of the room
    const startX = fromDesk ? rec.exitX : rec.x;
    const startZ = fromDesk ? rec.exitZ : rec.z;
    const dist = Math.hypot(wp.x - startX, wp.z - startZ);

    if (dist > 6.5) {
      const northCorridorZ = -halfD + 3.55;
      const westCorridorX = -halfW + 3.1;
      if (Math.abs(wp.z - northCorridorZ) < 2.2) {
        path.push({ x: westCorridorX, z: northCorridorZ });
      } else {
        path.push({ x: westCorridorX, z: clamp(startZ, -halfD + 3.6, halfD - 4.4) });
      }
    }

    path.push({ x: wp.x, z: wp.z });
    return path;
  }

  private followPath(
    rec: InternalAgentRecord,
    speed: number,
    dt: number,
    snapDist: number,
  ): boolean {
    if (rec.path.length === 0) return true;

    let remaining = speed * dt;

    while (rec.path.length > 0 && remaining > 0) {
      const target = rec.path[0];
      const dx = target.x - rec.x;
      const dz = target.z - rec.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= snapDist) {
        rec.x = target.x;
        rec.z = target.z;
        rec.path.shift();
        continue;
      }

      const targetRot = Math.atan2(dx, dz);
      rec.rotationY = lerpAngle(rec.rotationY, targetRot, TURN_RATE * dt);

      if (remaining >= dist) {
        rec.x = target.x;
        rec.z = target.z;
        remaining -= dist;
        rec.path.shift();
      } else {
        rec.x += (dx / dist) * remaining;
        rec.z += (dz / dist) * remaining;
        remaining = 0;
      }
    }

    return rec.path.length === 0;
  }

  private checkRoamingSignatureChanged(): boolean {
    const roaming: string[] = [];
    for (const rec of this.records.values()) {
      if (rec.mode !== 'seated') {
        roaming.push(rec.agentId);
      }
    }
    roaming.sort();
    const sig = roaming.join(',');
    if (sig !== this.lastRoamingSignature) {
      this.lastRoamingSignature = sig;
      return true;
    }
    return false;
  }
}
