# Multi-Floor Cutaway 3D Building Implementation Plan

> **For agentic workers:** Execute task-by-task with strict TDD (RED -> GREEN) and commit cleanly after verification.

**Goal:** Extend Antigravity 3D Agent Office into a stacked multi-floor cutaway 3D building where users can add, rename, and delete floors, focus individual floors via a floating elevator panel, and persistently assign any team to any floor.

**Spec:** `docs/superpowers/specs/2026-11-26-multi-floor-building-design.md`

## Tasks
1. **Shared Building Contracts, `buildingStore.ts`, `StateStore`, `DemoSimulator` & HTTP API (`shared/`, `server/`)**
   - Add `FloorConfig`, `BuildingConfig`, `TeamCluster.floorId`, `OfficeSnapshot.floors` to `shared/src/types.ts`.
   - Implement `server/src/buildingStore.ts` (`loadBuildingConfig`, `saveBuildingConfig`, `DEFAULT_FLOOR_ID`).
   - Extend `StateStore`, `DemoSimulator`, `server.ts`, and `index.ts` with `POST /api/floors`, `POST /api/floors/rename`, `POST /api/floors/delete`, `POST /api/team-floor` and persistence to `server/data/building-config.json`.
   - Tests in `server/src/__tests__/stateStore.test.ts` and `server/src/__tests__/server.test.ts` (add/rename/delete floor, safe migration to Floor 1, persistence across restart).
2. **Multi-Floor 3D Layout Engine (`client/src/scene/officeLayout.ts`)**
   - Compute unified building footprint (`floorWidth`, `floorDepth`) across all floors and per-floor `FloorLayout` at `y = (index - 1) * 5.4`.
   - Tests in `client/src/__tests__/officeLayout.test.ts` verifying vertical Y separation, unified footprint, and non-overlapping desks per floor.
3. **Stacked Cutaway 3D Building & Y-Aware Camera (`client/src/scene/`)**
   - Upgrade `OfficeRoom.tsx` (stacked slabs, cutaway walls, elevator core, corner columns, exterior `L{n}` badge).
   - Upgrade `OfficeCanvas.tsx`, `TeamClusterGroup.tsx`, `ConnectionArcs.tsx`, and `CameraRig.tsx` for multi-floor rendering, cutaway hiding of floors above `focusedFloorIndex`, Y-aware arc/focus math, and smooth floor/building camera framing.
4. **Floating Left Elevator Panel, Team Floor Dropdown & App Wiring (`client/src/ui/`, `App.tsx`, `README.md`)**
   - Create `client/src/ui/FloorElevator.tsx` (add/rename/delete floors, active count per floor, `Semua` overview).
   - Add **Lantai Gedung** team-move dropdown to `InspectorDrawer.tsx`.
   - Wire `useOfficeSocket.ts`, `filterSnapshot.ts`, `App.tsx`, and `README.md`.
   - Tests in `client/src/__tests__/ui.test.tsx` covering `FloorElevator` and `InspectorDrawer` floor move dropdown.
