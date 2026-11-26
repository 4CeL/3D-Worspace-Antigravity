# Multi-Floor Cutaway 3D Building — Design Document

**Date:** 2026-11-26  
**Status:** Approved (2026-11-26)  
**Builds on:** `docs/superpowers/specs/2026-11-26-3d-agent-office-design.md`

## Intent & Why
As the user monitors multiple Antigravity teams/projects simultaneously, expanding a single flat floor indefinitely feels less like a real office and harder to organize. Turning the workspace into a **multi-floor cutaway 3D building** lets the user add floors, name them, assign each team (`TeamCluster` by `rootId`) to any floor, inspect the whole building at once, or focus cleanly on a single floor.

## Approach Chosen
**Stacked Cutaway 3D Building + Floor Focus (Persisted on Local Backend):**
- Floors stack vertically at a consistent `FLOOR_HEIGHT = 5.4` with a unified footprint across all floors.
- A floating left **Elevator Panel** lets the user view **Semua Lantai** (full stacked building) or focus **Lantai `k`** (smooth camera glide to Floor `k`, automatically hiding floors `> k` so upper slabs never block the view, while keeping floors `<= k` visible below).
- Floor definitions and per-team floor assignments (`rootId -> floorId`) persist in `server/data/building-config.json` (gitignored), matching `agent-aliases.json`.
- *Why not single-floor-only switcher or browser-only storage:* Stacked cutaway delivers the true multi-story building feel requested by the user, and backend persistence keeps floor layout synchronized across tabs and restarts alongside `StateStore`.

## Core Rules
- Minimum 1 floor (`floor-1`, "Lantai 1"), maximum 8 floors.
- Floor 1 cannot be deleted. Deleting Floor `N` (`N > 1`) automatically moves any teams on Floor `N` safely to Floor 1.
- New/unassigned teams default to Floor 1.
- Moving a team in `InspectorDrawer` moves the entire team (Main Agent + all Subagents) together.
- Demo Mode starts with 2 floors (`Lt. 1 · Core Office` and `Lt. 2 · Mobile Lab`) and supports adding/renaming/deleting floors and moving demo teams live.
