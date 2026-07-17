# workspace-sync

workspace-sync provides real-time workspace state synchronisation between backend and frontend. It is consumed by both Cedar and the apps.

## Build

workspace-sync compiles to `dist/` via tsdown before it is consumed. After a fresh checkout: `npm install && npm run build` in `workspace-sync/`. For development: `npm run build:watch`. The compiled `dist/` is committed so GitHub installs work in CI without a build step.

## General Architecture

workspace-sync is a small, focused TypeScript library with three export paths:

- **`workspace-sync`** (`src/`) — shared core: types (`WorkspaceDefinition`, `WorkspaceDelta`), SQL query builders (`buildInitialQuery`, `buildUpsertQuery`, `buildDeleteQuery`), delta computation (`getWorkspaceDelta`, `parseInitialWorkspace`), the in-memory workspace store (`createWorkspaceStore`, `applyWorkspaceDelta`), and multi-tab coordination (`createTabCoordinator`).
- **`workspace-sync/backend`** (`src/backend/`) — `createWorkspaceRouter`: a tRPC router factory that exposes `getFoundation` and `getFoundationDelta` endpoints given a `WorkspaceDefinition`.
- **`workspace-sync/frontend`** (`src/frontend/`) — `createWorkspaceProvider`: a React provider factory that polls for deltas and binds the store to React, including `useWorkspaceSelector` for subscribing to a slice.

**How it works:** The backend builds workspace state from Postgres using raw SQL (aggregated into a single JSON blob). The frontend loads an initial snapshot then polls for deltas every 10 seconds. Both are driven by a `WorkspaceDefinition` that describes which tables and columns to include.

Apps can opt into multi-tab coordination (`anchor`) and an IndexedDB snapshot cache (`persist`): one tab polls and feeds the rest over a BroadcastChannel, and a cached snapshot renders before the network answers. Both are off by default and degrade to independent, cold-booting tabs. See `plans/reactive-workspace.md` for the arc this is part of.

Code shared between backend and frontend (types, query builders, delta logic) lives at the root of `src/`. Consumer-specific code lives in `backend/` or `frontend/`.

### File and Folder Structure

**Files:**
Refactor a file into a folder with well-named modules if it:

- Exceeds ~500 lines, **or**
- Handles multiple responsibilities (violates SRP).

**Folders:**

- Represent one feature/concept.
- **Co-locate** all related items (logic, tests, utilities).
- If there is a single primary export, name the folder after the original file.
- If there are multiple exports, use dash-case and describe the category in the folder's `AGENTS.md`.

**Co-location principles:**

- Co-locate by feature/concept, not by type.
- Code shared between `backend/` and `frontend/` belongs at the root of `src/`.
- Consider the _Law of Demeter_ for imports: avoid deep relative paths. If needed, refactor to flatten the hierarchy.

### AGENTS.md Files

**Goal:** The fractal structure aims for cognitive encapsulation — any sub-tree should be understandable in isolation. AGENTS.md files serve this goal the way code comments do: they surface what naming and structure alone don't convey. The `backend/` and `frontend/` subfolders are intentional exceptions — they exist for consumer separation and are inherently cross-cutting.

**Location:** Every `src/` folder and subfolder should include an `AGENTS.md`.

**Content:**

- **Purpose**: 1–2 sentences.
- **Notes**: Gotchas, unconventional patterns, known tech debt, or context not obvious from the code or naming.
- **Key Files**: Critical files/modules and their roles (skip obvious details).
- **Relationships**: Dependencies on other folders.

**Rules:**

- **Brevity**: Prioritize succinctness for LLM token efficiency. **Omit details derivable from conventions, naming, or folder structure.**
- **Prioritize the Notes section** for non-obvious context.
- **Updates**: Required when adding/removing files, changing responsibilities, or creating subfolders (also update parent's `AGENTS.md`).

### Testing Philosophy

Prioritize _semantic coverage_ (testing behavior) over line coverage. **Focus on critical paths and refactoring safety.** Tests should enable safe refactoring; skip trivial paths (e.g., simple getters/setters) that add no value. The pattern is to create a file with the same name + `.test.ts(x)` next to the file being tested.

For integration tests covering the interaction between multiple files, use a `{concept}.test.ts` at the appropriate folder level. If that file exceeds ~500 lines, apply the same file→folder rule: refactor to a `{concept}.test/` folder with named sub-files inside.
