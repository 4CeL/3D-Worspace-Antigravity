import type { AgentNode, AgentStatus, FloorTheme } from '@office/shared';
import type { DeskPlacement, FloorLayout, OfficeLayout } from './officeLayout';

export type RoamingMode = 'seated' | 'walking_out' | 'visiting' | 'chatting' | 'returning';

export type RoamingBubble = '💬' | '☕' | '💡' | '👋' | null;

export interface FloorWaypoint {
  id: string;
  label: string;
  x: number;
  z: number;
  entryDoor?: [number, number];
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
  suiteDoor: Point2D | null;
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
const CORRIDOR_Z = 0;
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
 * Returns 6 safe walkable waypoints aligned to the fixed 28 x 24 multi-room glass floorplan:
 * - Central Corridor (z = 0)
 * - Lift Lobby ([-11.2, 0])
 * - Front-Left Glass Lounge / Meeting / Bistro Room ([-11.1, 4.6], North doorway [-11.1, 2.8])
 * - Back-Right Glass Pantry / Server / Coffee Room ([11.1, -4.5], South doorway [11.2, -2.8])
 * - East Corridor overlook ([11.2, 0.2])
 * - Front-Right Reading & Plant corner ([11.2, 6.2])
 */
export function computeFloorWaypoints(
  floorWidth: number,
  floorDepth: number,
  theme: FloorTheme,
): FloorWaypoint[] {
  const halfW = floorWidth / 2;
  const halfD = floorDepth / 2;

  const pantryLabel =
    theme === 'pantry'
      ? 'Di Pantry'
      : theme === 'lobby'
        ? 'Di Coffee Bar'
        : theme === 'engineering'
          ? 'Ruang Server'
          : 'Ruang Studio';

  const loungeLabel =
    theme === 'lobby'
      ? 'Di Lounge'
      : theme === 'creative'
        ? 'Ruang Diskusi'
        : theme === 'pantry'
          ? 'Area Bistro'
          : 'Ruang Santai';

  const clampX = (x: number) => clamp(x, -halfW + 1.8, halfW - 1.8);
  const clampZ = (z: number) => clamp(z, -halfD + 1.8, halfD - 1.8);

  return [
    {
      id: 'central-corridor',
      label: 'Koridor Utama',
      x: 0,
      z: CORRIDOR_Z,
    },
    {
      id: 'lift-lobby',
      label: 'Lobi Lift',
      x: clampX(-11.2),
      z: CORRIDOR_Z,
      preferredBubble: '👋',
    },
    {
      id: 'front-left-room',
      label: loungeLabel,
      x: clampX(-11.1),
      z: clampZ(4.6),
      entryDoor: [clampX(-11.1), 2.8],
      preferredBubble: theme === 'creative' ? '💡' : '☕',
    },
    {
      id: 'back-right-pantry',
      label: pantryLabel,
      x: clampX(11.1),
      z: clampZ(-4.5),
      entryDoor: [clampX(11.2), -2.8],
      preferredBubble: theme === 'engineering' || theme === 'creative' ? '💡' : '☕',
    },
    {
      id: 'east-corridor',
      label: 'Koridor Timur',
      x: clampX(11.2),
      z: 0.2,
    },
    {
      id: 'front-right-terrace',
      label: 'Sudut Tanaman',
      x: clampX(11.2),
      z: clampZ(6.2),
    },
  ];
}

export class RoamingController {
  private floorWidth = 28;
  private floorDepth = 24;
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
      const suiteDoor: Point2D | null = desk.doorPosition
        ? { x: desk.doorPosition[0], z: desk.doorPosition[1] }
        : null;
      const existing = this.records.get(agentId);

      if (!existing) {
        const hash = hashString(agentId);
        // Deterministic staggered delay in [3.0, 5.5] seconds
        const idleDelay = 3.0 + (hash % 2501) / 1000;
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
          suiteDoor,
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
        const seatMoved = Math.hypot(existing.seatX - seatX, existing.seatZ - seatZ) > 0.05;
        existing.floorId = desk.floorId;
        existing.isSubagent = agent.isSubagent;
        existing.status = agent.status;
        existing.deskX = desk.position[0];
        existing.deskY = desk.position[1];
        existing.deskZ = desk.position[2];
        existing.deskRotationY = desk.rotationY;
        existing.suiteDoor = suiteDoor;
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
      exitX: deskX + 1.15 * sinR,
      exitZ: deskZ + 1.15 * cosR,
    };
  }

  private getSuiteDoorInsideZ(rec: InternalAgentRecord): number {
    if (!rec.suiteDoor) return rec.exitZ;
    // Step 0.65m inside the suite doorway (clear of the conference table end)
    return rec.suiteDoor.z < 0 ? rec.suiteDoor.z - 0.65 : rec.suiteDoor.z + 0.65;
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

    // Opportunistic greeting when walking past a lone visiting coworker in the same open zone
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

      this.tryPairForChat(rec);
    }
  }

  private stepVisiting(rec: InternalAgentRecord, dt: number): void {
    if (this.tryPairForChat(rec)) {
      return;
    }

    rec.stateTimer -= dt;
    if (rec.stateTimer <= 0) {
      // Hold briefly if a coworker is already walking to our waypoint to meet us
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
      rec.path = this.buildPathToWaypoint(rec, nextWp, false);
      rec.targetWaypointId = nextWp.id;
      rec.activityLabel = nextWp.label;
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

    const faceDx = partner.x - rec.x;
    const faceDz = partner.z - rec.z;
    if (Math.hypot(faceDx, faceDz) > 0.001) {
      const targetRot = Math.atan2(faceDx, faceDz);
      rec.rotationY = lerpAngle(rec.rotationY, targetRot, TURN_RATE * dt);
    }

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

  private getEnclosingRoomDoor(x: number, z: number): Point2D | null {
    // Front-Left Glass Room: x in [-13.5, -8.8], z in [2.8, 11.2], North doorway [-11.1, 2.8]
    if (x <= -8.7 && z >= 2.6) {
      return { x: -11.1, z: 2.8 };
    }
    // Back-Right Glass Room: x in [9.0, 13.5], z in [-11.3, -2.8], South doorway [11.2, -2.8]
    if (x >= 8.9 && z <= -2.6) {
      return { x: 11.2, z: -2.8 };
    }
    return null;
  }

  private beginReturnToDesk(rec: InternalAgentRecord): void {
    this.unpair(rec);
    const prevWp = this.findWaypoint(rec.floorId, rec.targetWaypointId);
    rec.mode = 'returning';
    rec.bubble = null;
    rec.targetWaypointId = null;
    rec.activityLabel = 'Kembali ke meja';

    const path: Point2D[] = [];
    const insideOwnSuite =
      rec.suiteDoor !== null &&
      Math.sign(rec.z) === Math.sign(rec.deskZ) &&
      Math.abs(rec.z) > 2.85 &&
      Math.abs(rec.x - rec.suiteDoor.x) < 4.0;

    if (!insideOwnSuite && rec.suiteDoor) {
      const physicalRoomDoor = this.getEnclosingRoomDoor(rec.x, rec.z);
      const exitDoor =
        physicalRoomDoor ??
        (prevWp?.entryDoor && Math.abs(rec.z) > 2.4
          ? { x: prevWp.entryDoor[0], z: prevWp.entryDoor[1] }
          : null);

      // Exit any other glass room cleanly through its doorway to Central Corridor (z = 0)
      if (exitDoor) {
        path.push({ x: exitDoor.x, z: exitDoor.z });
        path.push({ x: exitDoor.x, z: CORRIDOR_Z });
      } else if (Math.abs(rec.z) > 2.2) {
        path.push({ x: rec.x, z: CORRIDOR_Z });
      }

      // Walk along Central Corridor to own suite doorway, enter, and route around shared conference table
      const doorInsideZ = this.getSuiteDoorInsideZ(rec);
      path.push({ x: rec.suiteDoor.x, z: CORRIDOR_Z });
      path.push({ x: rec.suiteDoor.x, z: rec.suiteDoor.z });
      path.push({ x: rec.suiteDoor.x, z: doorInsideZ });
      path.push({ x: rec.exitX, z: doorInsideZ });
    } else if (insideOwnSuite && rec.suiteDoor && Math.abs(rec.x - rec.exitX) > 0.35) {
      // Interrupted inside own suite near doorway — route around the end of the shared table
      const doorInsideZ = this.getSuiteDoorInsideZ(rec);
      path.push({ x: rec.exitX, z: doorInsideZ });
    }

    const distToExit = Math.hypot(rec.exitX - rec.x, rec.exitZ - rec.z);
    if (distToExit > 0.35 || path.length > 0) {
      path.push({ x: rec.exitX, z: rec.exitZ });
    }
    path.push({ x: rec.seatX, z: rec.seatZ });
    rec.path = path;
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
        rec.path = this.buildPathToWaypoint(rec, nextWp, false);
        rec.targetWaypointId = nextWp.id;
        rec.activityLabel = nextWp.label;
        rec.mode = 'walking_out';
      } else {
        rec.mode = 'visiting';
        rec.stateTimer = 3.0;
      }
    }
  }

  private isInSameOpenZone(a: InternalAgentRecord, b: InternalAgentRecord): boolean {
    // Both inside the open Central Corridor (no glass wall between them)
    if (Math.abs(a.z) <= 2.2 && Math.abs(b.z) <= 2.2) {
      return true;
    }
    if (a.targetWaypointId !== null && a.targetWaypointId === b.targetWaypointId) {
      const wp = this.findWaypoint(a.floorId, a.targetWaypointId);
      if (wp?.entryDoor) {
        // Both agents must already be well inside the glass room past its doorway (|z| >= 3.4)
        const doorSign = Math.sign(wp.entryDoor[1]);
        return (
          Math.sign(a.z) === doorSign &&
          Math.sign(b.z) === doorSign &&
          Math.abs(a.z) >= Math.abs(wp.entryDoor[1]) + 0.6 &&
          Math.abs(b.z) >= Math.abs(wp.entryDoor[1]) + 0.6
        );
      }
      return true;
    }
    return false;
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
      if (!this.isInSameOpenZone(walker, candidate)) continue;

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
      if (!this.isInSameOpenZone(rec, candidate)) continue;

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

    rec.rotationY = Math.atan2(spotB.x - spotA.x, spotB.z - spotA.z);
    bestPartner.rotationY = Math.atan2(spotA.x - spotB.x, spotA.z - spotB.z);

    return true;
  }

  private chooseNextWaypoint(rec: InternalAgentRecord): FloorWaypoint | null {
    const list = this.waypointsByFloor.get(rec.floorId);
    if (!list || list.length === 0) return null;

    // Prefer joining a lone visiting or strolling coworker on the same floor
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
          const travelEta = Math.hypot(shared.x - rec.x, shared.z - rec.z) / WALK_SPEED;
          lonePeer.stateTimer = Math.max(lonePeer.stateTimer, Math.min(18, travelEta + 3.0));
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

  /**
   * Doorway-aware path builder:
   * - Exits the agent's glass suite through its open doorway into the Central Corridor (z = 0)
   * - Exits any glass destination room through its entryDoor back into z = 0
   * - Enters destination glass rooms cleanly through their entryDoor
   */
  private buildPathToWaypoint(
    rec: InternalAgentRecord,
    wp: FloorWaypoint,
    fromDesk: boolean,
  ): Point2D[] {
    const path: Point2D[] = [];

    if (fromDesk) {
      path.push({ x: rec.exitX, z: rec.exitZ });
      if (rec.suiteDoor) {
        const doorInsideZ = this.getSuiteDoorInsideZ(rec);
        // Walk along the side aisle past the shared conference table before turning toward the doorway
        path.push({ x: rec.exitX, z: doorInsideZ });
        path.push({ x: rec.suiteDoor.x, z: doorInsideZ });
        path.push({ x: rec.suiteDoor.x, z: rec.suiteDoor.z });
        path.push({ x: rec.suiteDoor.x, z: CORRIDOR_Z });
      }
    } else {
      const curWp = this.findWaypoint(rec.floorId, rec.targetWaypointId);
      const physicalRoomDoor = this.getEnclosingRoomDoor(rec.x, rec.z);
      const exitDoor =
        physicalRoomDoor ??
        (curWp?.entryDoor && Math.abs(rec.z) > 2.4
          ? { x: curWp.entryDoor[0], z: curWp.entryDoor[1] }
          : null);
      if (exitDoor) {
        path.push({ x: exitDoor.x, z: exitDoor.z });
        path.push({ x: exitDoor.x, z: CORRIDOR_Z });
      } else if (Math.abs(rec.z) > 2.2) {
        path.push({ x: rec.x, z: CORRIDOR_Z });
      }
    }

    const targetCorridorX = wp.entryDoor ? wp.entryDoor[0] : wp.x;
    path.push({ x: targetCorridorX, z: CORRIDOR_Z });

    if (wp.entryDoor) {
      path.push({ x: wp.entryDoor[0], z: wp.entryDoor[1] });
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
