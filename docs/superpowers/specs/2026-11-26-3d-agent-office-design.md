# Antigravity 3D Agent Office — Design Document

**Date:** 2026-11-26  
**Workspace:** `d:\Developments\PROJECTS\3D Workspace`  
**Status:** Approved (2026-11-26)

---

## 1. Intent & Why

When running multiple Antigravity agents and subagents in parallel across one or more projects, it is hard to see at a glance who is actively working, what each subagent is doing for which main agent, and which exact files are being read or modified.

**Antigravity 3D Agent Office** solves this by turning live Antigravity agent activity into a **Cozy Isometric 3D Startup Office** in a dedicated browser window. Every active agent and subagent sits at a desk inside a team cluster, visually animates what it is doing (reading, editing, running commands, thinking, or relaxing when done), displays its active file above its desk, and opens a slide-over inspector when clicked to review all files touched — making multi-agent work both immediately legible and genuinely enjoyable to watch, like working alongside a real team in an office.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals (v1)
1. **Real-Time Multi-Session Visibility:** Monitor **all active Antigravity conversations** across projects simultaneously in one office, with a quick filter per project.
2. **Clear Parent–Subagent Hierarchy:** Group each root/main agent with its spawned subagents into a shared **Team Cluster** (rug + coordinator desk + surrounding subagent desks + subtle link lines).
3. **File Activity Clarity:** Show the active file directly above each working desk and provide a full per-agent list of touched files (`READ`, `EDIT`, `WRITE`, timestamps, copyable paths) in a slide-over inspector drawer.
4. **Cozy Office Atmosphere:** Render a warm, sunlit **Cozy Isometric Startup Office** (wood floor, plants, coffee area, stylized low-poly desks & characters) that fills ~90%+ of the browser viewport cleanly.
5. **Instant + Resilient Telemetry:** Combine real-time Antigravity lifecycle hooks with local `transcript.jsonl` watching so animations react instantly while pre-existing sessions and parent–subagent metadata still load completely.
6. **Easy Setup & Testing:** Provide a 1-command hook setup/uninstall CLI plus a built-in **Demo / Simulation Mode** so the office can be previewed anytime without running live subagents.
7. **v2-Ready Separation:** Keep telemetry ingestion, state management, and 3D presentation cleanly separated so v2 **Control & Command** features (sending messages, spawning/stopping agents) can plug in without rewriting the 3D scene.

### Non-Goals (v1)
- Sending prompts, spawning new agents, or stopping/cancelling agents from the 3D UI (planned for v2).
- Embedding inside Antigravity as an MCP App side pane or sidebar view (v1 is a standalone browser web app for maximum viewport size).
- First-person walkable avatar navigation (v1 uses smooth isometric orbit, pan, zoom, and click-to-focus).
- Remote/multi-user hosting or cloud telemetry (strictly local single-user on `127.0.0.1`).

### Anti-Goals (Failure Conditions)
- **Blocking or breaking Antigravity:** Because Antigravity hooks run synchronously, any hook crash, timeout, or non-allow output when the 3D Office server is stopped would break the user's normal Antigravity workflow. The hook MUST always fail-open in milliseconds.
- **Cluttered admin dashboard:** Permanent heavy sidebars or overlapping unreadable 3D labels that ruin the "working in a cozy office" feeling.
- **Manual JSON surgery:** Forcing the user to hand-edit `~/.gemini/config/hooks.json` or paste conversation IDs.

---

## 3. Constraints

- **Platform:** Windows primary (`cmd /c` hook execution per Antigravity `hooks.json` spec, Windows file paths with backslashes, PowerShell, Node.js v22+). Path logic should still use Node `path` utilities cleanly.
- **Antigravity Data Locations:**
  - Transcripts live at `<USERPROFILE>\.gemini\antigravity\brain\<conversation-id>\.system_generated\logs\transcript.jsonl`.
  - Global hooks config lives at `<USERPROFILE>\.gemini\config\hooks.json` (may not exist yet, or may contain other user/plugin hooks that MUST be preserved).
- **Hook Execution Contract:**
  - `hooks.json` only supports `"type": "command"` and executes synchronously.
  - Hook script receives camelCase JSON on `stdin` (`conversationId`, `workspacePaths`, `transcriptPath`, `modelName`, `lastUserInput`, `hookEventName`, `cwd`, plus `toolCall` for `PreToolUse`/`PostToolUse` and `fullyIdle`/`terminationReason` for `Stop`).
  - Hook script MUST output valid JSON on `stdout`:
    - `PreToolUse`: `{"decision":"allow"}`
    - `PostToolUse`: `{}`
    - `SessionStart`, `PreInvocation`, `PostInvocation`: `{"injectSteps":[]}`
    - `Stop`: `{}`
  - HTTP POST from hook to local server MUST have a strict short timeout (e.g., `150ms`) and swallow all network/connection errors silently.
- **Security & Privacy:**
  - Backend binds exclusively to `127.0.0.1` (no external network exposure).
  - Never send transcript or hook data outside `localhost`.
  - Only extract structured activity metadata (agent/model, status, tool name, file paths, short command/action summaries) — never stream raw file contents or sensitive environment variables to the browser.

---

## 4. Approaches Considered

### Chosen: Approach 1 — Hybrid (Transcript Watcher + Lightweight Global Hook)
- **How it works:** A local Node.js telemetry server watches `~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl` incrementally to reconstruct active/recent sessions, file touches, and `invoke_subagent` parent–child links. Simultaneously, a lightweight global hook registered under `"antigravity-3d-office"` in `~/.gemini/config/hooks.json` posts instant lifecycle events (`SessionStart`, `PreInvocation`, `PreToolUse`, `PostToolUse`, `Stop`) to the local server.
- **Why chosen:** Gives true zero-lag live animations, exact `workspacePaths` (project name) and `fullyIdle` status from hooks, while still populating already-running sessions and parent–subagent role/ID trees from transcripts. Survives server restarts seamlessly and provides a clean bridge for future v2 control actions.
- **Trade-offs:** Requires a 1-command hook setup step (automated via `npm run setup-hooks` + `npm run remove-hooks`) and lightweight reconciliation logic between hook events and transcript lines.

### Rejected: Approach 2 — Pure Transcript Watcher (Zero-Setup)
- **How it works:** Watches only `transcript.jsonl` on disk without touching `hooks.json`.
- **Trade-offs:** Zero setup in Antigravity, but has ~0.5–1s disk write lag, must guess "thinking" vs "idle" heuristically, and cannot reliably read official `workspacePaths` before file tools are called.

### Dropped Early: Approach 3 — Hook-Only Event Collector
- **Why dropped:** Cannot see sessions or file history that occurred before the 3D Office started, and hook payloads do not include `parentConversationId`, whereas `transcript.jsonl` records `invoke_subagent` calls with `Role`, `TypeName`, and the returned subagent `conversationId`.

---

## 5. Product & UX Specification

### 5.1 Visual Aesthetic *(User Decision)*
- **Theme:** **Cozy Isometric Startup Office** — bright, warm daylight interior with wooden floor planks, soft cream back walls with sunlit windows, potted indoor plants, a small coffee counter/lounge corner, and soft pastel team rugs beneath each cluster.
- **Characters & Desks:** Stylized low-poly human-like office characters seated at clean light-wood/white desks with ergonomic chairs, laptops/monitors, and desk lamps.
  - Coordinator/Main agents have a slightly larger desk or subtle coordinator accent (e.g., dual monitor / desk plant / gold nameplate).
  - Subagents get distinct shirt/accent colors by role/type (`research`, `browser`, `self`, custom role) so teammates are visually distinguishable at a glance.

### 5.2 Screen Layout & HUD *(User Decision)*
- **Full 3D Canvas:** The 3D office occupies 100% of the browser viewport.
- **Floating Top Bar (Minimal, Translucent):**
  - Left pill: Office brand title, live active count (`● N Aktif`), and **Project Filter dropdown** (`Semua Project` or specific workspace).
  - Right pill: **Hook Status indicator** (green = Hybrid Live; amber = Transcript-Only + quick setup guide popover), **`Label File: ON/OFF`** toggle, **`Sembunyikan Selesai`** toggle *(Agent Call)*, **`Mode Simulasi`** toggle *(Agent Call)*, and **`Reset Kamera`** button.
- **Floating 3D Desk Badges:** Above each active desk, a compact billboard pill displays:
  - Agent name/role (shortened cleanly).
  - Colored activity dot + current filename & action tag (e.g., `● auth.ts · edit` or `● npm test · run`), clickable to open the inspector.
  - Hidden/dimmed gracefully when zoomed far out or when `Label File` is toggled off to prevent clutter.
- **Slide-Over Inspector Drawer (Right Side, On-Demand):**
  - Closed by default; opens smoothly when clicking any character, desk, or floating badge (and closes via `✕`, `Esc`, or clicking empty floor).
  - Contents:
    1. **Header:** Agent display name (conversation title/summary or subagent role), model name, current status badge (`Berpikir`, `Mengedit`, `Membaca`, `Menjalankan Command`, `Selesai/Santai`, `Error`), and project/workspace name.
    2. **Team Relationship:** Shows whether this is a Main Agent (with clickable chips for each spawned Subagent) or a Subagent (with clickable link back to its Parent Agent) — clicking smoothly flies the camera to that teammate's desk.
    3. **Files Worked On (Primary Section):** Deduplicated list of files touched in this session sorted by most recent, each with action badge (`EDIT` emerald, `WRITE` teal, `READ` sky-blue), filename + relative path, last-touched time, touch count, and a **Copy Path** button.
    4. **Recent Activity Feed:** Compact chronological list of the last ~15 tool actions (e.g., `edit_file app.tsx`, `run_command npm test`, `invoke_subagent Codebase Researcher`) with timestamps and error flags.

### 5.3 Spatial Layout & Agent Lifecycle
- **Team Clustering *(User Decision)*:** Each root conversation spawns a **Team Cluster** on a soft colored rug labeled with the project/session name. The Main Agent sits at the lead desk; its subagents spawn around it in the same cluster with subtle dashed curved arcs connecting parent ↔ subagent while active (and a brief pulse along the arc when `invoke_subagent` or `send_message` occurs).
- **Dynamic Office Expansion *(User Decision)*:** The office floor and cluster grid expand dynamically as more active sessions appear (e.g., 1×1 → 2×1 → 2×2 → 3×2 clusters), smoothly repositioning camera bounds without jarring jumps.
- **Finished / Idle Behavior *(User Decision + Agent Call)*:**
  - When an agent or subagent finishes (`Stop` with `fullyIdle: true`, or no activity for >20 seconds), it does **not** vanish immediately. It transitions to a `done`/`idle` state (relaxed posture, coffee cup icon/prop, dimmed monitor) so the user can still click its desk and inspect all files it touched.
  - **Recency Window *(Agent Call)*:** By default, the office displays sessions that are currently active **or** had activity within the **last 30 minutes** (with a quick selector in the top bar for `30m / 2j / Hari ini`), preventing week-old conversations from crowding the floor.
- **Activity-to-Animation Mapping *(Agent Call)*:**
  - `thinking` (`PreInvocation` / planning): gentle head bob/sway, warm amber monitor glow, animated `•••` pill.
  - `editing` (`edit_file`, `write_file`): energetic typing animation, emerald monitor glow, green file pill.
  - `reading` (`read_file`, grep/list/search tools): attentive scanning posture, sky-blue monitor glow, blue file pill.
  - `running` (`run_command`, tests/builds): flickering terminal screen, violet monitor glow, purple command pill.
  - `delegating` (`invoke_subagent`, `send_message`): brief pulse along parent ↔ subagent connection arc.
  - `error` (tool returned error): brief soft red monitor border + error badge in inspector.
  - `idle` / `done`: relaxed lean-back + coffee steam/mug visual, neutral warm monitor.

---

## 6. Technical Architecture

### 6.1 Stack *(Agent Call)*
- **Frontend (`client/`):** React 19 + TypeScript + Vite + Three.js via `@react-three/fiber` and `@react-three/drei`, styled with Tailwind CSS for the floating HUD and Slide-Over Inspector.
- **Backend (`server/`):** Node.js (v22+) + TypeScript (`tsx` for dev, `tsc` build), lightweight HTTP server + `ws` WebSocket server, file watcher for `transcript.jsonl`, and in-memory state store.
- **Shared (`shared/`):** Shared TypeScript domain contracts (`AgentNode`, `TeamCluster`, `FileTouch`, `ActivityEvent`, `OfficeSnapshot`, `ServerMessage`, `ClientMessage`).
- **Hook Integration (`hooks/`):** Zero-dependency Node.js `.cjs` emitter script (`emit-event.cjs`) + CLI scripts (`setup-hooks.mjs`, `remove-hooks.mjs`).

### 6.2 Hybrid Telemetry Engine
```text
Antigravity Agent/Subagent
   ├──► [1] Global Hook (~/.gemini/config/hooks.json)
   │        └─► hooks/emit-event.cjs (<=150ms HTTP POST, always fail-open)
   │               └─► POST http://127.0.0.1:4174/api/hook-event
   │
   └──► [2] Disk Transcript (~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl)
            └─► server/transcriptWatcher.ts (incremental byte-offset JSONL reader)
                   │
                   ▼
        server/stateStore.ts (Reconciles hook + transcript by conversationId)
                   │
                   ▼ WebSocket (ws://127.0.0.1:4174/ws)
        client/ (React Three Fiber 3D Cozy Office + Slide-Over Inspector)
```

#### Key Implementation Notes & Verified Antigravity Contracts

1. **Exact `~/.gemini/config/hooks.json` Schema & Windows Quoting:**
   - Top-level keys are named hooks directly at root (no outer `"hooks"` wrapper).
   - `SessionStart`, `PreInvocation`, `PostInvocation`, and `Stop` are **flat arrays** of handler objects; `PreToolUse` and `PostToolUse` are **grouped arrays** with `matcher` and nested `hooks`:
     ```json
     {
       "antigravity-3d-office": {
         "SessionStart": [
           { "type": "command", "command": "node \"D:\\Developments\\PROJECTS\\3D Workspace\\hooks\\emit-event.cjs\"", "timeout": 5 }
         ],
         "PreInvocation": [
           { "type": "command", "command": "node \"D:\\Developments\\PROJECTS\\3D Workspace\\hooks\\emit-event.cjs\"", "timeout": 5 }
         ],
         "PreToolUse": [
           {
             "matcher": "*",
             "hooks": [
               { "type": "command", "command": "node \"D:\\Developments\\PROJECTS\\3D Workspace\\hooks\\emit-event.cjs\"", "timeout": 5 }
             ]
           }
         ],
         "PostToolUse": [
           {
             "matcher": "*",
             "hooks": [
               { "type": "command", "command": "node \"D:\\Developments\\PROJECTS\\3D Workspace\\hooks\\emit-event.cjs\"", "timeout": 5 }
             ]
           }
         ],
         "Stop": [
           { "type": "command", "command": "node \"D:\\Developments\\PROJECTS\\3D Workspace\\hooks\\emit-event.cjs\"", "timeout": 5 }
         ]
       }
     }
     ```
   - Because Antigravity executes command hooks via `cmd /c` on Windows and the workspace path contains a space (`3D Workspace`), `command` invokes `node` directly (no spaces) with the absolute script path wrapped in double quotes.

2. **Exact Hook `stdin` Payload Schema & Subagent Resilience:**
   - All stdin keys are camelCase (`conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`, `modelName`, `lastUserInput`, `hookEventName`, `cwd`).
   - `PreToolUse` / `PostToolUse` include `stepIdx` and `toolCall: { id, name, args }` (native JSON object). `PostToolUse` includes `error` (non-empty string) when the tool fails.
   - `Stop` includes `executionNum`, `terminationReason`, `error`, `fullyIdle`, `continuationActive`.
   - Global hooks fire for conversations/subagents under their respective `conversationId`. Regardless, `StateStore` MUST also drive subagent live animations and idle fallback from each subagent's own `transcript.jsonl` in case any subagent type does not emit hooks.

3. **Verified `transcript.jsonl` Format & Parallel Tool-Result Correlation:**
   - `PLANNER_RESPONSE` steps contain `step_index`, `source`, `type`, `status`, `created_at`, `model`, and optional `tool_calls: [{ name, args }]`. Note: string values inside `transcript.jsonl` `args` are often double-encoded JSON strings (e.g., `"Path": "\"C:\\\\...\""`), so the parser MUST unwrap JSON-quoted strings defensively (while also accepting plain strings from hooks).
   - Tool results appear as sequential `type: "GENERIC"` steps immediately following the `PLANNER_RESPONSE` in the same index order as `tool_calls` (no `tool_call_id` in `transcript.jsonl`). For parallel `tool_calls` (including parallel `invoke_subagent` calls in one turn), match the `i`-th `tool_calls` entry to the `i`-th subsequent `GENERIC` step before the next `PLANNER_RESPONSE`/`USER_INPUT`.

4. **Async `invoke_subagent` Linking & Mid-Flight Cluster Reparenting:**
   - Verified empirically: `invoke_subagent` returns **immediately upon spawn (async)** in its `GENERIC` tool-result step with text containing a JSON block:
     ```json
     {
       "conversationId": "<child-uuid>",
       "logAbsoluteUri": "file:///.../transcript.jsonl",
       "workspaceUris": ["file:///d%3A/Developments/PROJECTS/3D%20Workspace"]
     }
     ```
   - Extract `conversationId` (and decode `workspaceUris` as a project-name fallback) and link it to the parent's `TeamCluster` with the `Role` and `TypeName` from the matched `invoke_subagent` call.
   - **Race-condition safety:** If a child conversation's hook events or transcript arrive slightly before the parent's `invoke_subagent` result is parsed, `StateStore` initially places it as a standalone node and **dynamically reparents/merges** it into the parent's `TeamCluster` the moment the link arrives (inheriting the parent's `workspacePaths` if needed).

5. **Antigravity Tool & Argument Taxonomy:**
   - **File Read (`read`):** `read_file` (`Path`), `view_file` (`AbsolutePath`), `view_file_outline` (`AbsolutePath`), `view_code_item` (`File`).
   - **File Edit (`edit`):** `edit_file` (`Path`), `replace_file_content` (`TargetFile`), `multi_replace_file_content` (`TargetFile`).
   - **File Write (`write`):** `write_file` (`Path`), `write_to_file` (`TargetFile`).
   - **Search / Explore (`reading` activity):** `grep_search`, `find_by_name`, `list_dir`, `search_web`, `read_resource`, `read_url_content`.
   - **Terminal (`running`):** `run_command` (prefer `toolSummary` for pill/feed display, fallback to truncated `CommandLine`).
   - **Orchestration (`delegating`):** `invoke_subagent` (`Role`, `TypeName`), `send_message` (`Recipient`, `Message` — triggers animated arc pulse between sender and `Recipient`).
   - **Task Status Hints:** `update_focus` (`focus`) updates the agent's short task subtitle in the inspector/pill.
   - **Unknown / MCP Tools:** Gracefully render as `running` with tool name; never throw.

6. **Hook–Transcript Reconciliation:**
   - Hook events immediately set live `status`, `workspacePaths`, `modelName`, `currentTool`, and `currentFile`.
   - Transcript watcher backfills historical `FileTouch` entries, `invoke_subagent` relationships, and sessions started before the server launched.
   - Deduplicate recent activity entries by `toolCall.id` (hooks) or `(conversationId, toolName, normalizedTarget, ~2s window)` (hook vs transcript).

7. **Hook Installation Safety (`npm run setup-hooks` / `npm run remove-hooks`):**
   - Reads `~/.gemini/config/hooks.json` if present (creates directory/file if absent), writes a timestamped backup `.bak` before modifying, and upserts ONLY the `"antigravity-3d-office"` top-level hook entry (preserving all other user/plugin hooks).
   - `remove-hooks` removes only `"antigravity-3d-office"` cleanly.

### 6.3 Demo / Simulation Mode
- Accessible from a top-bar toggle (`Mode Simulasi`) without touching real Antigravity state.
- Runs a deterministic/scripted 2-project mock office (e.g., 1 main agent + 2 subagents actively reading/editing/running tests, plus 1 second project with an idle agent) so the user can explore the 3D office, camera controls, animations, and file inspector immediately upon launch.

### 6.4 Future v2 Seam (Control & Command)
- The WebSocket protocol defines typed `ClientMessage` envelopes (`subscribe`, `set_filter`, and reserved `agent_command` namespace) and the backend isolates `TranscriptWatcher` + `HookIngestor` behind an `AgentDataSource` interface, so adding v2 `ConversationService` control adapters requires zero structural changes to the 3D office UI.

---

## 7. Setup & User Onboarding

Because the user asked to be guided through setup:
1. Include a concise, step-by-step **Panduan Setup** in `README.md` (Indonesian) covering:
   - `npm install`
   - `npm run setup-hooks` (with explanation of what it writes to `~/.gemini/config/hooks.json` and how to verify/undo with `npm run remove-hooks`)
   - `npm run dev` (launches both backend & 3D Office frontend and prints the local URL to open in browser)
2. Show live Hook Connection Status in the 3D Office top bar with a quick-copy setup tip if no hook events have been received yet.

---

## 8. What's Left to the Builder

- Exact default ports (suggested: `5173` frontend Vite, `4174` backend HTTP/WS, configurable via env vars).
- Exact procedural Three.js geometry proportions, wood/plant/lighting materials, and character rigging/easing curves within the Cozy Isometric Startup Office palette.
- Exact file-watcher library (`chokidar` vs native `fs.watch` + periodic directory scan fallback on Windows) and JSONL partial-line buffering strategy.
- Exact camera smoothing parameters, zoom clamp bounds, and billboard LOD fade thresholds.
- Automated test coverage for JSONL parsing (including double-encoded Windows paths), parent–subagent linking, hook-transcript reconciliation, fail-open hook execution, and idempotent `setup-hooks` / `remove-hooks` merging.
