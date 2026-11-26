# Antigravity 3D Agent Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local standalone browser Cozy Isometric 3D Office web app that monitors and inspects all active Antigravity agents, subagents, and the files they work on in real time via a hybrid global hook + transcript watcher architecture.

**Architecture:** A local Node.js/TypeScript server bound strictly to `127.0.0.1:4174` ingests live lifecycle events from a fail-open global Antigravity hook (`hooks/emit-event.cjs`) and incrementally tails `~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl`, reconciling both into an in-memory `StateStore` (with dynamic parent–subagent reparenting and a toggleable Demo Simulator) and streaming snapshots over WebSocket to a React + Three.js (`@react-three/fiber` + `@react-three/drei`) 3D office frontend with floating HUD pills and a slide-over file inspector.

**Tech Stack:** Node.js v22+, TypeScript, React 19, Vite, Tailwind CSS, Three.js (`@react-three/fiber`, `@react-three/drei`), `ws`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-3d-agent-office-design.md`

## Global Constraints

- **Platform:** Windows primary (`cmd /c` hook execution, Windows backslash paths including spaces in `d:\Developments\PROJECTS\3D Workspace`, Node.js v22+); use Node `path` utilities for cross-platform safety.
- **Network Security:** Bind strictly to `127.0.0.1` only (default backend `4174`, Vite dev `5173`); never transmit transcript or hook data off localhost; never stream raw file contents or secrets to the browser.
- **Hook Fail-Open Contract:** `hooks/emit-event.cjs` MUST have zero external dependencies, enforce <= 150ms HTTP POST timeout, swallow all errors silently, and always emit valid JSON on `stdout` (`{"decision":"allow"}` for `PreToolUse`, `{}` for `PostToolUse`/`Stop`, `{"injectSteps":[]}` for `SessionStart`/`PreInvocation`/`PostInvocation`).
- **Scope Guard (v1):** Read-only Monitor & Inspect UI (no prompt sending / spawning / killing in v1), while preserving a typed v2 `agent_command` WebSocket seam and `AgentDataSource` backend boundary.
- **Repo Hygiene:** Add `.superpowers/`, `node_modules/`, `dist/` to `.gitignore`.

## Review Focus

1. **Windows path with spaces (`3D Workspace`) & double-encoded JSON paths:** `setup-hooks` must double-quote the absolute script path for `cmd /c` (`node "<abs-path>"`), and `transcriptParser` must unwrap double-encoded JSON strings without corrupting Windows backslashes — pinned in Tasks 1 & 2.
2. **Antigravity hook fail-open when the 3D Office server is offline:** `hooks/emit-event.cjs` must exit cleanly with valid pass-through JSON within ~150ms when `127.0.0.1:4174` refuses connections — pinned in Task 2.
3. **Preserving existing hooks in `~/.gemini/config/hooks.json`:** `setup-hooks` and `remove-hooks` must create a `.bak` backup and only touch the `"antigravity-3d-office"` top-level key without altering other hooks — pinned in Task 2.
4. **Partial/chunked JSONL writes in `transcript.jsonl`:** Incremental file tailing must retain incomplete trailing bytes until the newline arrives, and skip malformed lines without crashing — pinned in Task 3.
5. **Subagent spawn race condition:** When a child subagent's hook or transcript arrives before the parent's `invoke_subagent` tool-result step is parsed, `StateStore` must dynamically reparent and merge the child into the parent's `TeamCluster` — pinned in Task 4.

---

## File Structure

- Root config & docs:
  - `.gitignore` — ignores `node_modules/`, `dist/`, `.superpowers/`, `*.bak`
  - `package.json` — npm workspaces (`shared`, `server`, `client`), unified scripts (`dev`, `build`, `test`, `setup-hooks`, `remove-hooks`)
  - `tsconfig.base.json` — shared strict TS compiler defaults
  - `vitest.config.ts` — unified test runner across `shared`, `hooks`, `server`, `client`
  - `README.md` — clear Indonesian setup, usage, simulation mode, and uninstall guide
- `shared/` — shared domain contracts & tool classification:
  - `shared/package.json`, `shared/tsconfig.json`
  - `shared/src/types.ts` — `AgentStatus`, `FileAction`, `FileTouch`, `ActivityEvent`, `AgentNode`, `TeamCluster`, `RecencyWindow`, `OfficeSnapshot`, `HookEventPayload`, `ServerMessage`, `ClientMessage`
  - `shared/src/toolTaxonomy.ts` — `unwrapJsonString`, `normalizePath`, `classifyToolCall`
  - `shared/src/index.ts` — barrel exports
  - `shared/src/__tests__/toolTaxonomy.test.ts`
- `hooks/` — Antigravity lifecycle hook emitter & installer:
  - `hooks/emit-event.cjs` — zero-dep synchronous fail-open hook emitter
  - `hooks/hookConfig.mjs` — pure config builder, safe merger, backup, and remover for `~/.gemini/config/hooks.json`
  - `hooks/setup-hooks.mjs` — CLI entrypoint for `npm run setup-hooks`
  - `hooks/remove-hooks.mjs` — CLI entrypoint for `npm run remove-hooks`
  - `hooks/__tests__/hooks.test.ts`
- `server/` — local telemetry backend:
  - `server/package.json`, `server/tsconfig.json`
  - `server/src/transcriptParser.ts` — incremental JSONL line parser, parallel `invoke_subagent` tool-result correlator, `workspaceUris` decoder
  - `server/src/transcriptWatcher.ts` — scans & tails `<brainDir>/<id>/.system_generated/logs/transcript.jsonl`
  - `server/src/stateStore.ts` — hybrid hook + transcript reconciler, deduplication, dynamic reparenting, idle & recency filtering
  - `server/src/demoSimulator.ts` — scripted multi-project Cozy Office demo generator
  - `server/src/server.ts` — `createOfficeServer()` HTTP + WebSocket server bound to `127.0.0.1`
  - `server/src/index.ts` — server CLI startup
  - `server/src/__tests__/transcriptParser.test.ts`
  - `server/src/__tests__/stateStore.test.ts`
  - `server/src/__tests__/server.test.ts`
- `client/` — Cozy Isometric 3D Office frontend:
  - `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/index.css`, `client/src/main.tsx`, `client/src/App.tsx`
  - `client/src/hooks/useOfficeSocket.ts` — live WebSocket sync + auto-reconnect + filter/demo controls
  - `client/src/scene/officeLayout.ts` — deterministic dynamic floor & cluster/desk layout math
  - `client/src/scene/OfficeCanvas.tsx` — R3F `<Canvas>`, lighting, warm cozy environment, click-empty-floor deselect
  - `client/src/scene/OfficeRoom.tsx` — dynamic wood floor, cream walls, sunlit windows, plants, coffee lounge
  - `client/src/scene/TeamClusterGroup.tsx` — pastel rug, project nameplate, coordinator + subagent desks
  - `client/src/scene/AgentDesk.tsx` — stylized desk, monitor glow by status, floating `<Html>` file pill
  - `client/src/scene/AgentAvatar.tsx` — low-poly animated character (typing, scanning, terminal, thinking, coffee/idle)
  - `client/src/scene/ConnectionArcs.tsx` — dashed parent ↔ subagent curved arcs + delegation pulse
  - `client/src/scene/CameraRig.tsx` — isometric `OrbitControls` + smooth fly-to-agent & reset camera
  - `client/src/ui/TopBar.tsx` — minimal translucent floating HUD pills + Hook Status setup popover
  - `client/src/ui/InspectorDrawer.tsx` — slide-over right drawer with team links, Files Worked On, Copy Path, activity feed
  - `client/src/__tests__/officeLayout.test.ts`
  - `client/src/__tests__/ui.test.tsx`

---

### Task 1: Workspace Scaffold, Shared Domain Contracts & Tool Taxonomy

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/types.ts`
- Create: `shared/src/toolTaxonomy.ts`
- Create: `shared/src/index.ts`
- Test: `shared/src/__tests__/toolTaxonomy.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `shared/src/types.ts`: `AgentStatus`, `FileAction`, `FileTouch`, `ActivityEvent`, `AgentNode`, `TeamCluster`, `RecencyWindow`, `OfficeSnapshot`, `HookEventPayload`, `ServerMessage`, `ClientMessage`
  - `shared/src/toolTaxonomy.ts`:
    - `unwrapJsonString(value: unknown): string`
    - `normalizeFilePath(rawPath: string): { fullPath: string; fileName: string }`
    - `classifyToolCall(toolName: string, rawArgs?: Record<string, unknown>): ClassifiedToolCall`

- [ ] **Step 1: Initialize git repo, `.gitignore`, root `package.json`, `tsconfig.base.json`, `vitest.config.ts`, and `shared/` package config**

Initialize `git init` in `d:\Developments\PROJECTS\3D Workspace`. Create `.gitignore` ignoring `node_modules/`, `dist/`, `.superpowers/`, `*.bak`, `.DS_Store`. Create root `package.json` with npm workspaces (`["shared", "server", "client"]`), scripts (`dev`, `build`, `test`, `setup-hooks`, `remove-hooks`), and dev dependencies (`typescript`, `vitest`, `concurrently`, `@types/node`, `tsx`). Create `shared/package.json` (`"@office/shared"`) and `shared/tsconfig.json`. Install root dev dependencies with `npm install`.

- [ ] **Step 2: Define shared domain contracts in `shared/src/types.ts`**

Define exact exported types:
- `AgentStatus = 'thinking' | 'editing' | 'reading' | 'running' | 'delegating' | 'idle' | 'error'`
- `FileAction = 'read' | 'edit' | 'write'`
- `RecencyWindow = '30m' | '2h' | 'today'`
- `FileTouch`: `{ path: string; relativePath: string; fileName: string; action: FileAction; lastTouchedAt: number; count: number }`
- `ActivityEvent`: `{ id: string; timestamp: number; toolName: string; status: AgentStatus; summary: string; targetPath?: string; fileAction?: FileAction; isError?: boolean }`
- `AgentNode`: `{ id: string; parentId: string | null; rootId: string; isSubagent: boolean; displayName: string; role: string; typeName?: string; modelName?: string; workspacePath?: string; projectName: string; status: AgentStatus; focusText?: string; currentTool?: string; currentFile?: { fileName: string; path: string; action: FileAction }; files: FileTouch[]; recentActivity: ActivityEvent[]; lastUpdatedAt: number; lastHookAt?: number; createdAt: number; errorMessage?: string }`
- `TeamCluster`: `{ rootId: string; projectName: string; workspacePath?: string; title: string; leadAgentId: string; agentIds: string[]; lastUpdatedAt: number }`
- `OfficeSnapshot`: `{ generatedAt: number; hookActive: boolean; lastHookAt: number | null; demoMode: boolean; clusters: TeamCluster[]; agents: Record<string, AgentNode>; activePulses: Array<{ id: string; fromAgentId: string; toAgentId: string; timestamp: number }> }`
- `HookEventPayload`: camelCase Antigravity hook stdin contract (`hookEventName`, `conversationId`, `workspacePaths?`, `transcriptPath?`, `modelName?`, `lastUserInput?`, `cwd?`, `stepIdx?`, `toolCall?: { id?: string; name: string; args?: Record<string, unknown> }`, `error?`, `fullyIdle?`, `terminationReason?`)
- `ServerMessage`: `{ type: 'snapshot'; payload: OfficeSnapshot } | { type: 'command_ack'; requestId: string; ok: false; reason: 'not_implemented' }`
- `ClientMessage`: `{ type: 'subscribe'; recency?: RecencyWindow } | { type: 'set_recency'; recency: RecencyWindow } | { type: 'toggle_demo'; enabled: boolean } | { type: 'agent_command'; requestId: string; conversationId: string; command: string; payload?: unknown }`

- [ ] **Step 3: Write failing tests in `shared/src/__tests__/toolTaxonomy.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { classifyToolCall, normalizeFilePath, unwrapJsonString } from '../toolTaxonomy';

describe('unwrapJsonString', () => {
  it('unwraps double-encoded Windows paths without mangling backslashes', () => {
    expect(unwrapJsonString('"D:\\\\Developments\\\\PROJECTS\\\\3D Workspace\\\\src\\\\app.ts"'))
      .toBe('D:\\Developments\\PROJECTS\\3D Workspace\\src\\app.ts');
  });

  it('returns plain strings unchanged', () => {
    expect(unwrapJsonString('D:\\Developments\\PROJECTS\\3D Workspace\\README.md'))
      .toBe('D:\\Developments\\PROJECTS\\3D Workspace\\README.md');
  });
});

describe('classifyToolCall', () => {
  it('classifies read, edit, and write tools across Antigravity argument aliases', () => {
    expect(classifyToolCall('read_file', { Path: '"C:\\\\proj\\\\a.ts"' })).toMatchObject({
      status: 'reading', fileAction: 'read', fileName: 'a.ts',
    });
    expect(classifyToolCall('replace_file_content', { TargetFile: 'C:\\proj\\b.tsx' })).toMatchObject({
      status: 'editing', fileAction: 'edit', fileName: 'b.tsx',
    });
    expect(classifyToolCall('write_file', { Path: '"C:\\\\proj\\\\c.md"' })).toMatchObject({
      status: 'editing', fileAction: 'write', fileName: 'c.md',
    });
  });

  it('classifies run_command, invoke_subagent, send_message, update_focus, and unknown tools', () => {
    expect(classifyToolCall('run_command', { toolSummary: '"Run vitest"', CommandLine: '"npm test"' }))
      .toMatchObject({ status: 'running', summary: 'Run vitest' });
    expect(classifyToolCall('invoke_subagent', { Role: '"Codebase Researcher"', TypeName: '"research"' }))
      .toMatchObject({ status: 'delegating', subagentRole: 'Codebase Researcher', subagentType: 'research' });
    expect(classifyToolCall('send_message', { Recipient: '"child-1"', Message: '"Hi"' }))
      .toMatchObject({ status: 'delegating', recipientId: 'child-1' });
    expect(classifyToolCall('update_focus', { focus: '"Inspecting shader"' }))
      .toMatchObject({ focusText: 'Inspecting shader' });
    expect(classifyToolCall('custom_mcp_tool', {})).toMatchObject({ status: 'running' });
  });
});

describe('normalizeFilePath', () => {
  it('extracts basename for both Windows and POSIX paths', () => {
    expect(normalizeFilePath('D:\\Developments\\PROJECTS\\3D Workspace\\app.tsx').fileName).toBe('app.tsx');
    expect(normalizeFilePath('/tmp/test/index.ts').fileName).toBe('index.ts');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run shared/src/__tests__/toolTaxonomy.test.ts`
Expected: FAIL because `toolTaxonomy.ts` does not exist yet.

- [ ] **Step 5: Implement `shared/src/toolTaxonomy.ts` and `shared/src/index.ts`**

Implement `unwrapJsonString`, `normalizeFilePath`, and `classifyToolCall` mapping all verified Antigravity tool names and argument keys from Section 6.2 of the spec (`read_file`/`view_file`/`view_file_outline`/`view_code_item`, `edit_file`/`replace_file_content`/`multi_replace_file_content`, `write_file`/`write_to_file`, search/explore tools, `run_command`, `invoke_subagent`, `send_message`, `update_focus`, and safe fallback for unknown/MCP tools). Re-export everything from `shared/src/index.ts`.

- [ ] **Step 6: Run tests and verify pass**

Run: `npx vitest run shared/src/__tests__/toolTaxonomy.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.base.json vitest.config.ts shared
git commit -m "feat: scaffold workspace, shared contracts, and Antigravity tool taxonomy"
```

---

### Task 2: Fail-Open Global Hook Emitter & Safe Installer (`hooks/`)

**Files:**
- Create: `hooks/emit-event.cjs`
- Create: `hooks/hookConfig.mjs`
- Create: `hooks/setup-hooks.mjs`
- Create: `hooks/remove-hooks.mjs`
- Test: `hooks/__tests__/hooks.test.ts`

**Interfaces:**
- Consumes: `HookEventPayload` contract (camelCase Antigravity stdin JSON)
- Produces:
  - `hooks/emit-event.cjs`: standalone Node CJS script reading stdin, posting to `http://127.0.0.1:${OFFICE_PORT || 4174}/api/hook-event` with <= 150ms timeout, writing exact pass-through JSON to stdout
  - `hooks/hookConfig.mjs`:
    - `HOOK_KEY = 'antigravity-3d-office'`
    - `buildOfficeHookEntry(emitScriptAbsPath: string): Record<string, unknown>`
    - `installHookConfig(configPath: string, emitScriptAbsPath: string): { backupPath: string | null; configPath: string }`
    - `removeHookConfig(configPath: string): { removed: boolean; backupPath: string | null }`

- [ ] **Step 1: Write failing tests in `hooks/__tests__/hooks.test.ts`**

Write tests using temporary directories and spawning `node hooks/emit-event.cjs`:
1. `emits {"decision":"allow"} for PreToolUse and fails open within <1000ms when server port is closed` (passes `OFFICE_PORT=1` / unused closed port, asserts exit code `0` and stdout parses to `{ decision: 'allow' }`).
2. `emits valid pass-through JSON for PostToolUse ({}), Stop ({}), SessionStart ({"injectSteps":[]}), PreInvocation ({"injectSteps":[]}), and malformed stdin`.
3. `delivers parsed JSON payload to a live local HTTP endpoint on 127.0.0.1`.
4. `installHookConfig creates exact Antigravity schema (flat SessionStart/PreInvocation/Stop, grouped matcher:"*" PreToolUse/PostToolUse) with double-quoted Windows path containing spaces`.
5. `installHookConfig backs up existing hooks.json and preserves unrelated top-level hooks verbatim`.
6. `removeHookConfig removes only "antigravity-3d-office" while keeping unrelated hooks intact`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run hooks/__tests__/hooks.test.ts`
Expected: FAIL (missing `hooks/hookConfig.mjs` and `hooks/emit-event.cjs`).

- [ ] **Step 3: Implement `hooks/emit-event.cjs`, `hooks/hookConfig.mjs`, `hooks/setup-hooks.mjs`, and `hooks/remove-hooks.mjs`**

- `hooks/emit-event.cjs`: zero external deps (`http` only). Read stdin with a short safety cap, parse JSON inside `try/catch`, compute pass-through stdout string based on `payload.hookEventName` (`PreToolUse` → `{"decision":"allow"}`, `SessionStart`/`PreInvocation`/`PostInvocation` → `{"injectSteps":[]}`, else `{}`), attempt `http.request` POST to `127.0.0.1:${process.env.OFFICE_PORT || 4174}/api/hook-event` with `timeout: 150`, destroy on timeout/error, and ALWAYS print the pass-through JSON and exit `0`.
- `hooks/hookConfig.mjs`: build the exact schema verified in Section 6.2 (`node "${emitScriptAbsPath}"`, `timeout: 5`), create parent dir if missing, write timestamped `.bak` copy when modifying an existing file, upsert/remove only `HOOK_KEY = 'antigravity-3d-office'`.
- `hooks/setup-hooks.mjs` & `hooks/remove-hooks.mjs`: resolve default config path `path.join(os.homedir(), '.gemini', 'config', 'hooks.json')` (overrideable via `--config`), invoke `installHookConfig` / `removeHookConfig`, and print clear Indonesian + English confirmation.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run hooks/__tests__/hooks.test.ts`
Expected: PASS (all 6 tests green).

- [ ] **Step 5: Commit**

```bash
git add hooks
git commit -m "feat: add fail-open Antigravity hook emitter and safe setup/remove CLI"
```

---

### Task 3: Incremental Transcript Parser & Watcher (`server/`)

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/transcriptParser.ts`
- Create: `server/src/transcriptWatcher.ts`
- Test: `server/src/__tests__/transcriptParser.test.ts`

**Interfaces:**
- Consumes: `@office/shared` (`classifyToolCall`, `unwrapJsonString`, `AgentStatus`, `FileAction`)
- Produces:
  - `server/src/transcriptParser.ts`:
    - `ParsedTranscriptDelta` (events, subagentLinks, modelName, workspacePaths, firstUserPrompt, lastTimestamp, isStepRunning)
    - `createTranscriptParseState(): TranscriptParseState`
    - `parseTranscriptChunk(state: TranscriptParseState, chunk: string): ParsedTranscriptDelta`
    - `decodeFileUri(uri: string): string`
  - `server/src/transcriptWatcher.ts`:
    - `TranscriptWatcher` class with `start()`, `stop()`, emitting `'delta'` (`{ conversationId: string; delta: ParsedTranscriptDelta }`) and `'discovered'` (`{ conversationId: string; transcriptPath: string }`)

- [ ] **Step 1: Create `server/package.json` and `server/tsconfig.json` and install dependencies (`ws`, `@types/ws`)**

Configure `server/package.json` (`"@office/server"`) depending on `@office/shared` and `ws`. Run `npm install`.

- [ ] **Step 2: Write failing tests in `server/src/__tests__/transcriptParser.test.ts`**

Write unit tests covering:
1. `parses read_file, edit_file, write_file, run_command, and update_focus with double-encoded Windows paths`.
2. `buffers partial JSONL lines split across two chunks without losing or duplicating steps` (Review Focus #4).
3. `skips malformed JSON lines gracefully without crashing subsequent valid lines`.
4. `correlates two parallel invoke_subagent calls in one PLANNER_RESPONSE to their two sequential GENERIC tool-result steps by index order, extracting child conversationId, Role, TypeName, and decoded workspaceUris`.
5. `TranscriptWatcher tails an appended transcript.jsonl file inside a temp brain directory and emits incremental deltas`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/src/__tests__/transcriptParser.test.ts`
Expected: FAIL (missing `transcriptParser.ts` and `transcriptWatcher.ts`).

- [ ] **Step 4: Implement `server/src/transcriptParser.ts` and `server/src/transcriptWatcher.ts`**

- `transcriptParser.ts`: maintain `remainder` string buffer for incomplete lines and `pendingToolCalls` queue from the most recent `PLANNER_RESPONSE`. When a `GENERIC` step arrives, shift the matching pending call: if it was `invoke_subagent`, regex-extract the JSON block after `Created the following subagent:` for `conversationId` and `workspaceUris` (decoding `file:///d%3A/...` → `d:\...` on Windows); also detect error indicators (`status !== 'DONE'` or `Command exited with code [1-9]`).
- `transcriptWatcher.ts`: scan `<brainDir>/<id>/.system_generated/logs/transcript.jsonl` on start and periodically (every `1500ms`) plus `fs.watch` on active files, tracking byte offset per file to read only appended bytes with `fs.open`/`fs.read` (handling truncation by resetting offset). Filter initial scan to conversations modified within the last 24 hours so startup stays fast even with hundreds of old brain folders.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run server/src/__tests__/transcriptParser.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/tsconfig.json package-lock.json server/src/transcriptParser.ts server/src/transcriptWatcher.ts server/src/__tests__/transcriptParser.test.ts
git commit -m "feat: add incremental transcript JSONL parser and brain directory watcher"
```

---

### Task 4: Hybrid State Store, Mid-Flight Reparenting & Demo Simulator

**Files:**
- Create: `server/src/stateStore.ts`
- Create: `server/src/demoSimulator.ts`
- Test: `server/src/__tests__/stateStore.test.ts`

**Interfaces:**
- Consumes: `@office/shared`, `ParsedTranscriptDelta` from `server/src/transcriptParser.ts`
- Produces:
  - `server/src/stateStore.ts`:
    - `StateStore` class:
      - `applyHookEvent(payload: HookEventPayload, now?: number): void`
      - `applyTranscriptDelta(conversationId: string, delta: ParsedTranscriptDelta, now?: number): void`
      - `tickIdleCheck(now?: number): boolean`
      - `getSnapshot(options?: { recency?: RecencyWindow; now?: number }): OfficeSnapshot`
      - `onChange(listener: (snapshot: OfficeSnapshot) => void): () => void`
  - `server/src/demoSimulator.ts`:
    - `DemoSimulator` class: `start(onTick: (snapshot: OfficeSnapshot) => void)`, `stop()`, `getSnapshot(): OfficeSnapshot`

- [ ] **Step 1: Write failing tests in `server/src/__tests__/stateStore.test.ts`**

Write unit tests covering:
1. `reparents a child subagent mid-flight when child hook/transcript arrives BEFORE parent invoke_subagent link` (Review Focus #5 — asserts child moves out of standalone cluster into parent's `TeamCluster`, updates `role`/`parentId`/`rootId`, and inherits parent's `workspacePath`/`projectName`).
2. `deduplicates identical file touch & activity events received from both PreToolUse hook and transcript.jsonl within 2 seconds`.
3. `transitions status across PreInvocation (thinking) -> PreToolUse edit_file (editing + currentFile) -> PostToolUse error (error) -> Stop fullyIdle (idle)`.
4. `transitions active agent without Stop hook to idle after >20s of inactivity via tickIdleCheck`.
5. `filters clusters by recency window (30m vs 2h vs today) while always keeping currently non-idle agents visible`.
6. `records send_message pulses between sender and recipient conversation IDs and expires pulses after 5 seconds`.
7. `DemoSimulator produces a valid 2-project OfficeSnapshot with main + subagent clusters and advances animations on tick`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/src/__tests__/stateStore.test.ts`
Expected: FAIL (missing `stateStore.ts` and `demoSimulator.ts`).

- [ ] **Step 3: Implement `server/src/stateStore.ts` and `server/src/demoSimulator.ts`**

- `stateStore.ts`: maintain `agents: Map<string, AgentNode>`, `parentLinks: Map<string, { parentId: string; role?: string; typeName?: string }>`, recent dedup keys, and `activePulses`. Compute `TeamCluster[]` dynamically by resolving each agent's `rootId` (walking `parentId` safely with cycle guard), ensuring reparenting merges orphan clusters cleanly. Compute relative paths against `workspacePath` (fallback to basename). Maintain `hookActive` based on whether any hook event arrived.
- `demoSimulator.ts`: deterministic 2-project Cozy Office demo ("3D Workspace" with Main Agent + "UI Designer" + "API Researcher" actively cycling reading/editing/running/delegating with realistic file touches; and "Mobile App" with an idle/coffee-break agent + touched files).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/src/__tests__/stateStore.test.ts`
Expected: PASS (all 7 tests green).

- [ ] **Step 5: Commit**

```bash
git add server/src/stateStore.ts server/src/demoSimulator.ts server/src/__tests__/stateStore.test.ts
git commit -m "feat: add hybrid state store with mid-flight reparenting and demo simulator"
```

---

### Task 5: Local Telemetry HTTP + WebSocket Server (`server/src/server.ts`)

**Files:**
- Create: `server/src/server.ts`
- Create: `server/src/index.ts`
- Test: `server/src/__tests__/server.test.ts`

**Interfaces:**
- Consumes: `StateStore`, `TranscriptWatcher`, `DemoSimulator`, `@office/shared`
- Produces:
  - `createOfficeServer(options?: { port?: number; host?: string; brainDir?: string; staticDir?: string }): Promise<{ server: http.Server; port: number; close: () => Promise<void> }>`
  - HTTP API on `127.0.0.1`:
    - `GET /api/health` → `{ ok: true, hookActive: boolean, demoMode: boolean }`
    - `GET /api/snapshot?recency=30m|2h|today` → `OfficeSnapshot`
    - `POST /api/hook-event` → ingests `HookEventPayload`, returns `200 { ok: true }`
    - `POST /api/demo` (`{ enabled: boolean }`) → toggles demo simulator
  - WebSocket `/ws`: sends `ServerMessage` (`snapshot` scoped to each client's `recency`, default `'30m'`), handles `ClientMessage` (`subscribe`, `set_recency`, `toggle_demo`, `agent_command` → `command_ack` `not_implemented`).

- [ ] **Step 1: Write failing tests in `server/src/__tests__/server.test.ts`**

Write integration tests against `createOfficeServer({ port: 0, host: '127.0.0.1', brainDir: tempDir })`:
1. `POST /api/hook-event updates state and broadcasts live OfficeSnapshot to connected WebSocket clients`.
2. `POST /api/demo enables DemoSimulator and streams demo clusters over WebSocket without mutating real state`.
3. `WebSocket agent_command returns typed command_ack with reason not_implemented (v2 seam)`.
4. `rejects oversized (>1MB) or invalid JSON POST bodies cleanly without crashing`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/src/__tests__/server.test.ts`
Expected: FAIL (missing `server.ts`).

- [ ] **Step 3: Implement `server/src/server.ts` and `server/src/index.ts`**

- Enforce `host = '127.0.0.1'` default, allow local CORS (`http://localhost:*`, `http://127.0.0.1:*`), run a 2s interval `stateStore.tickIdleCheck()`, and serve built `client/dist` if `staticDir` exists (so `npm start` works in production too).
- `server/src/index.ts`: boot on `process.env.OFFICE_PORT || 4174`, watch `path.join(os.homedir(), '.gemini', 'antigravity', 'brain')`, log clear startup URL & hook status tip.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run server/src/__tests__/server.test.ts`
Expected: PASS (all 4 integration tests green).

- [ ] **Step 5: Commit**

```bash
git add server/src/server.ts server/src/index.ts server/src/__tests__/server.test.ts
git commit -m "feat: add localhost HTTP and WebSocket telemetry server"
```

---

### Task 6: Cozy Isometric 3D Office Scene (`client/src/scene/`)

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/index.css`
- Create: `client/src/scene/officeLayout.ts`
- Create: `client/src/scene/OfficeRoom.tsx`
- Create: `client/src/scene/AgentAvatar.tsx`
- Create: `client/src/scene/AgentDesk.tsx`
- Create: `client/src/scene/TeamClusterGroup.tsx`
- Create: `client/src/scene/ConnectionArcs.tsx`
- Create: `client/src/scene/CameraRig.tsx`
- Create: `client/src/scene/OfficeCanvas.tsx`
- Test: `client/src/__tests__/officeLayout.test.ts`

**Interfaces:**
- Consumes: `@office/shared` (`OfficeSnapshot`, `TeamCluster`, `AgentNode`, `AgentStatus`)
- Produces:
  - `client/src/scene/officeLayout.ts`:
    - `computeOfficeLayout(clusters: TeamCluster[], agents: Record<string, AgentNode>): OfficeLayout` (`floorWidth`, `floorDepth`, `clusters: ClusterPlacement[]`, `desks: Record<string, DeskPlacement>`)
  - `client/src/scene/OfficeCanvas.tsx`:
    - `<OfficeCanvas snapshot={...} selectedAgentId={...} showLabels={...} focusTarget={...} resetNonce={...} onSelectAgent={...} />`

- [ ] **Step 1: Initialize `client/` Vite + React 19 + TypeScript + Tailwind + Three.js (`three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`, `lucide-react`)**

Create `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts` (proxying `/api` and `/ws` to `http://127.0.0.1:4174`), `client/index.html`, and `client/src/index.css`. Install dependencies with `npm install`.

- [ ] **Step 2: Write failing tests in `client/src/__tests__/officeLayout.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { computeOfficeLayout } from '../scene/officeLayout';

describe('computeOfficeLayout', () => {
  it('returns cozy minimum room dimensions when office has 0 clusters', () => {
    const layout = computeOfficeLayout([], {});
    expect(layout.floorWidth).toBeGreaterThanOrEqual(14);
    expect(layout.floorDepth).toBeGreaterThanOrEqual(14);
  });

  it('expands floor and produces non-overlapping desks for multiple multi-agent clusters', () => {
    // 4 clusters, each with 1 lead + 3 subagents -> verify floor grows and minimum distance between every pair of desks >= 2.2 units
  });

  it('places coordinator desk at cluster lead position and subagents around it inside rug bounds', () => {
    // verify lead desk is centered/front and all subagent desks fall inside cluster rug rectangle
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run client/src/__tests__/officeLayout.test.ts`
Expected: FAIL (missing `officeLayout.ts`).

- [ ] **Step 4: Implement `client/src/scene/officeLayout.ts` and verify tests pass**

Implement deterministic grid expansion (`cols = Math.ceil(Math.sqrt(clusterCount))`), dynamically sized team rugs based on member count, lead coordinator desk + arranged subagent desks with guaranteed spacing, plus coffee corner anchor coordinates.
Run: `npx vitest run client/src/__tests__/officeLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the Cozy Isometric 3D components (`OfficeRoom`, `AgentAvatar`, `AgentDesk`, `TeamClusterGroup`, `ConnectionArcs`, `CameraRig`, `OfficeCanvas`)**

Follow the approved **Cozy Isometric Startup Office** aesthetic:
- `OfficeRoom.tsx`: warm oak wood floor (`#e2c29b` with subtle plank lines), soft cream back walls (`#faf4ea`), sunlit blue-sky window frames with light shafts, procedural potted monstera/ficus plants, and a cozy coffee counter + espresso machine + lounge rug in the corner.
- `AgentDesk.tsx`: clean white/light-wood desk, chair, laptop/monitor (dual monitor + mini plant for Main/Coordinator agents), emissive screen colored by `AgentStatus` (`thinking` amber `#f59e0b`, `editing` emerald `#10b981`, `reading` sky `#3b82f6`, `running` violet `#8b5cf6`, `delegating` amber-gold, `error` rose `#ef4444`, `idle` soft warm `#cbd5e1`), selection ring highlight when selected, and clickable floating `<Html>` desk file pill (`● filename · action`, cleanly hidden when `showLabels === false`).
- `AgentAvatar.tsx`: stylized low-poly character with distinct shirt colors by role, animated smoothly in `useFrame`: rapid hand/keyboard typing (`editing`), gentle leaning/head scan (`reading`), steady console tap (`running`), pensive head sway + pulsing dots (`thinking`), relaxed lean-back + ceramic coffee mug prop (`idle`).
- `TeamClusterGroup.tsx`: soft pastel rounded rug per cluster + clean wooden/white project nameplate on the rug edge + renders member desks/avatars.
- `ConnectionArcs.tsx`: subtle dashed curved Bezier lines connecting parent ↔ subagent desks, plus a bright moving orb pulse along the curve when `activePulses` contains a `send_message`/`invoke_subagent` event.
- `CameraRig.tsx` & `OfficeCanvas.tsx`: warm directional sun + hemisphere lighting with soft shadows, `OrbitControls` constrained to pleasant isometric angles, smooth lerp fly-to when `focusTarget` changes (clicking a teammate chip or agent), and `Reset Kamera` support.

- [ ] **Step 6: Verify client TypeScript compiles cleanly**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: 0 TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add client package-lock.json
git commit -m "feat: build Cozy Isometric 3D office scene and dynamic layout engine"
```

---

### Task 7: Floating Minimal HUD, Slide-Over Inspector, App Wiring & Indonesian Setup Guide

**Files:**
- Create: `client/src/hooks/useOfficeSocket.ts`
- Create: `client/src/ui/TopBar.tsx`
- Create: `client/src/ui/InspectorDrawer.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/main.tsx`
- Create: `README.md`
- Test: `client/src/__tests__/ui.test.tsx`

**Interfaces:**
- Consumes: `OfficeCanvas`, `@office/shared` (`OfficeSnapshot`, `AgentNode`, `RecencyWindow`)
- Produces: Complete runnable app (`npm run dev`, `npm run build`, `npm test`, `npm run setup-hooks`, `npm run remove-hooks`) + `README.md` setup guide.

- [ ] **Step 1: Add UI test dependencies (`@testing-library/react`, `@testing-library/jest-dom`, `jsdom`) and write failing tests in `client/src/__tests__/ui.test.tsx`**

Write tests verifying:
1. `TopBar displays active agent count, project filter options, Hook status pill (Hybrid Live vs Transcript-Only popover with npm run setup-hooks), and triggers toggle callbacks (showLabels, hideFinished, demoMode, resetCamera)`.
2. `InspectorDrawer renders selected agent name, status badge, clickable parent/subagent teammate chips, deduplicated Files Worked On list with EDIT/WRITE/READ badges, and Copy Path button`.
3. `InspectorDrawer closes on Escape key and on close button click`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/__tests__/ui.test.tsx`
Expected: FAIL (missing `TopBar.tsx` and `InspectorDrawer.tsx`).

- [ ] **Step 3: Implement `useOfficeSocket.ts`, `TopBar.tsx`, `InspectorDrawer.tsx`, `App.tsx`, `main.tsx`**

- `useOfficeSocket.ts`: connects to `ws://${location.host}/ws`, reconnects with exponential backoff, sends `{ type: 'subscribe', recency }` on connect and `{ type: 'set_recency', recency }` when recency changes, and exposes `snapshot`, `connected`, `recency`, `setRecency`, and `toggleDemo(enabled)` (`POST /api/demo`).
- `TopBar.tsx`: minimal floating translucent pills matching the approved Option A mockup — `🏢 Antigravity Office`, `● N Aktif`, Project filter dropdown (`Semua Project` + dynamic project names), Recency pill (`30m / 2j / Hari ini`), Hook Status badge (clicking opens quick Indonesian setup tip showing `npm run setup-hooks`), `Label File`, `Sembunyikan Selesai`, `Mode Simulasi`, `Reset Kamera`.
- `InspectorDrawer.tsx`: smooth slide-over panel on the right; header with name/role/model/status/project; Team section with clickable parent/subagent chips that call `onFocusAgent(id)`; primary **File Dikerjakan** list with `EDIT`/`WRITE`/`READ` color badges, filename, relative path, touch count, relative time, and one-click Copy Path button (`navigator.clipboard.writeText`); compact **Aktivitas Terbaru** feed; handles `Esc` key to close.
- `App.tsx`: wires `useOfficeSocket` + client-side project & hide-finished filtering + `OfficeCanvas` + `TopBar` + `InspectorDrawer` + friendly cozy empty-state card when no sessions are active (with a 1-click button to try **Mode Simulasi**!).

- [ ] **Step 4: Write `README.md` with clear Indonesian step-by-step setup guide**

Document:
1. Prasyarat (Node.js 22+)
2. Instalasi (`npm install`)
3. Setup Global Hook Antigravity (`npm run setup-hooks`) — jelaskan apa yang ditambahkan ke `~/.gemini/config/hooks.json`, backup otomatis, dan sifat fail-open
4. Menjalankan 3D Office (`npm run dev`) dan membuka di browser
5. Mencoba Mode Simulasi & fitur inspeksi file
6. Cara melepas hook (`npm run remove-hooks`)

- [ ] **Step 5: Run full test suite and full production build**

Run: `npm test && npm run build`
Expected: All unit, hook, server, layout, and UI tests PASS, and both `server` and `client` build cleanly with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add client README.md package.json package-lock.json vitest.config.ts
git commit -m "feat: add floating HUD, slide-over file inspector, app wiring, and setup guide"
```
