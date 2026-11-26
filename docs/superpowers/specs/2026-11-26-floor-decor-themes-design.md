# Per-Floor Office Decoration & Theme Presets — Design Document

**Date:** 2026-11-26  
**Status:** Approved (2026-11-26)  
**Builds on:** `docs/superpowers/specs/2026-11-26-multi-floor-building-design.md`

## Intent
Transform each floor of the 3D cutaway building from sparse walls into a richly furnished, lifelike cozy office with selectable per-floor room themes (`engineering`, `lobby`, `creative`, `pantry`) persisted in `server/data/building-config.json`.

## 4 Floor Theme Presets (Perimeter-Safe Placement)
All furniture sits cleanly in perimeter zones (back wall, left wall, front-left lounge zone, back-right utility zone) so center team clusters never collide with decor:
1. **`engineering` (Default Floor 1):** Mini server rack with subtle animated status LEDs, wall dashboard TV, colorful Kanban whiteboard, bookshelf/archive, water cooler, warm standing floor lamp, wall clock, potted plants.
2. **`lobby`:** Cozy 2-seater sofa + coffee table + lounge rug, full coffee bar (espresso machine, mini fridge, mugs), wooden bookshelf, framed wall art, standing lamp, wall clock, potted plants.
3. **`creative`:** Round discussion table + 3 studio chairs, colorful moodboard/poster wall, shelving unit with plants/books, water cooler, standing lamp, wall clock.
4. **`pantry`:** Expanded cafe/kitchen island + espresso machine + mini fridge + water dispenser, cafe bistro table with 2 stools, mug shelf, warm lamp, lush potted greenery.

## Persistence & UI
- `FloorConfig.theme?: FloorTheme` persisted via `POST /api/floors/theme` (`{ floorId, theme }`) in `server/data/building-config.json` (and live-switchable in Demo Mode).
- Compact per-floor theme selector inside `FloorElevator.tsx`.
