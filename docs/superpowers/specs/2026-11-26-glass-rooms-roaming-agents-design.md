# Architectural Glass Rooms & Roaming Idle Subagents — Design Document

**Date:** 2026-11-26  
**Status:** Approved (2026-11-26)  
**Builds on:** `docs/superpowers/specs/2026-11-26-floor-decor-themes-design.md`

## Intent
Make every floor feel like a richly partitioned real architectural office (with glass meeting/lounge partitions, wood slat dividers, and corridor runners instead of an open empty slab) and bring idle subagents to life by letting them stand up, stroll around their floor, visit rooms/pantry/lounge, and chat with each other with small floating interaction bubbles—while immediately returning to their desk when assigned new work.

## Key Design Decisions
1. **Open Glass & Wood Slat Partitions (`RoomPartitions.tsx`):**
   - Transparent framed glass dividers (`opacity ~0.24`, oak/aluminum mullions, wide open doorways) enclose the front-left lounge/meeting/bistro nook with a clean doorway facing the corridor.
   - Stylish vertical oak wood slat dividers frame the back-right pantry/server/coffee alcove while staying airy from isometric angles.
   - Corridor carpet runners connect the elevator core to the rooms, and low glass-oak acoustic dividers define the work pod perimeter.
   - All partition meshes disable pointer raycasting so clicks always pass through cleanly to desks and characters.
2. **Roaming & Interacting Idle Subagents (`roamingEngine.ts` + `RoamingAgent.tsx`):**
   - Pure deterministic `RoamingController` stepped inside R3F `useFrame` (zero per-frame React `setState`).
   - Main Agents remain anchored at their coordinator desk; idle subagents stand up after a short staggered delay (~3.5–5.5s), walk with stride/arm-swing animations to floor waypoints (pantry, lounge/meeting room, window, corridor), pair up when two idle subagents meet on the same floor (facing each other at ~0.95m spacing with bobbing interaction bubbles `💬`/`☕`/`💡`/`👋`), and briskly walk back to their desk whenever `status !== 'idle'`.
   - Clicking a roaming subagent selects it and opens `InspectorDrawer` normally.
