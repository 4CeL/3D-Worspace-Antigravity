# Fixed Floorplate & Transparent Glass Office Suites — Design Document

**Date:** 2026-11-26  
**Status:** Approved (User Request)  
**Builds on:** `docs/superpowers/specs/2026-11-26-glass-rooms-roaming-agents-design.md`

## Intent
Lock every floor to a permanent, unchanging architectural footprint (`28 × 24`) and divide each floor into real transparent glass-walled rooms connected by a central corridor—giving each team/agent cluster its own glass office suite while keeping the building silhouette rock-solid regardless of how many teams are active.

## Fixed Architectural Floorplan (`FIXED_FLOOR_WIDTH = 28`, `FIXED_FLOOR_DEPTH = 24`)
- **North Row (`z ∈ [-11.3, -2.8]`):**
  - West (`x ∈ [-13.6, -9.2]`): Elevator Core & Lift Lobby
  - **Glass Suite 1** (`x ∈ [-8.8, -0.4]`): Transparent glass walls + oak/aluminum mullions + frosted mid-band + South doorway to corridor
  - **Glass Suite 2** (`x ∈ [0.2, 8.6]`): Transparent glass walls + South doorway to corridor
  - East (`x ∈ [9.0, 13.5]`): Glass Pantry / Server / Coffee Room
- **Central Corridor (`z ∈ [-2.6, +2.4]`):** Wide woven carpet runner linking Lift Lobby, all 4 Glass Suites, Lounge/Meeting Room, and Pantry.
- **South Row (`z ∈ [+2.8, +11.2]`):**
  - Front-Left (`x ∈ [-13.5, -8.8]`): Transparent Glass Lounge / Meeting / Bistro Room (North doorway to corridor)
  - **Glass Suite 3** (`x ∈ [-8.4, -0.2]`): Transparent glass walls + North doorway to corridor
  - **Glass Suite 4** (`x ∈ [0.4, 8.6]`): Transparent glass walls + North doorway to corridor
  - Front-Right (`x ∈ [9.0, 13.5]`): Plant & Reading Corner + exterior floor badge `L{n}`
- **Doorway-Aware Roaming:** Idle subagents exit their suite doorway into the central corridor (`z = 0`) before walking to other rooms/pantry/lounge so they never clip through glass walls.
- **Pointer Pass-Through:** Every glass wall and mullion uses `raycast={() => null}` so clicking desks or roaming agents through glass works cleanly.
