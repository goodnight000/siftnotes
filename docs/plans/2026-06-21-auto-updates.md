# Auto Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add startup auto-update and interactive update-with-restore behavior to the Tauri desktop app.

**Architecture:** Keep update checks in the frontend Tauri plugin layer and add small pure helpers for update policy and state restoration. Startup checks run automatically and install silently before normal use when safe; interactive checks keep the existing dialog and persist restore state before install/relaunch.

**Tech Stack:** Tauri 2 updater plugin, `@tauri-apps/plugin-process`, Next.js 14, React 18, TypeScript, Node-based focused tests.

---

### Task 1: Update Policy Helpers

**Files:**
- Modify: `frontend/src/lib/update-prompt-policy.ts`
- Test: `frontend/tests/lib/update-prompt-policy.test.mjs`

**Step 1: Write the failing test**

Add tests for a `getUpdateAction` helper:

- startup plus available update plus not recording returns `install-silently`.
- interactive plus available update plus not recording returns `prompt`.
- any mode plus recording returns `blocked-by-recording`.
- no update returns `none`.

**Step 2: Run test to verify it fails**

Run: `cd frontend && node tests/lib/update-prompt-policy.test.mjs`

Expected: FAIL because `getUpdateAction` is not exported.

**Step 3: Write minimal implementation**

Add a pure `getUpdateAction` function and keep `shouldOpenUpdateDialog` as a compatibility wrapper for interactive prompts.

**Step 4: Run test to verify it passes**

Run: `cd frontend && node tests/lib/update-prompt-policy.test.mjs`

Expected: PASS.

### Task 2: Restore State Helpers

**Files:**
- Create: `frontend/src/lib/update-restore-state.ts`
- Create: `frontend/tests/lib/update-restore-state.test.mjs`

**Step 1: Write the failing test**

Test snapshot creation, destination sanitization, TTL expiry, and invalid external destinations.

**Step 2: Run test to verify it fails**

Run: `cd frontend && node tests/lib/update-restore-state.test.mjs`

Expected: FAIL because the module does not exist.

**Step 3: Write minimal implementation**

Export pure helpers for creating, parsing, checking freshness, and resolving a destination from a restore snapshot.

**Step 4: Run test to verify it passes**

Run: `cd frontend && node tests/lib/update-restore-state.test.mjs`

Expected: PASS.

### Task 3: Wire Startup and Interactive Update Flow

**Files:**
- Modify: `frontend/src/services/updateService.ts`
- Modify: `frontend/src/hooks/useUpdateCheck.ts`
- Modify: `frontend/src/components/UpdateCheckProvider.tsx`
- Modify: `frontend/src/components/UpdateDialog.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Step 1: Add restore-state persistence before install**

Use the current `window.location.pathname + window.location.search` and sidebar meeting state to save a snapshot before `downloadAndInstall`.

**Step 2: Add startup mode**

Make `UpdateCheckProvider` run startup checks, compute `getUpdateAction`, and call a silent install path when safe. Interactive checks still open the dialog.

**Step 3: Add relaunch restore**

In `RootLayout`, consume a fresh restore snapshot after providers mount and navigate to the saved in-app route.

**Step 4: Guard active recordings**

If an update is available while recording, do not install. In interactive mode, surface a toast explaining that the user should finish the recording first.

### Task 4: Fix Release Manifest Repository

**Files:**
- Modify: `scripts/generate-update-manifest-github.js`

**Step 1: Write or run focused script check**

Run the script against a temp bundle fixture or inspect generated output to ensure URLs use `charleszheng/siftnotes`.

**Step 2: Update hardcoded repository**

Replace legacy `Zackriya-Solutions/meeting-minutes` release URLs and verification text with `charleszheng/siftnotes`.

### Task 5: Verification

**Files:**
- Existing focused tests and typecheck/build as available.

**Step 1: Run focused tests**

Run:

```bash
cd frontend
node tests/lib/update-prompt-policy.test.mjs
node tests/lib/update-restore-state.test.mjs
```

**Step 2: Run broader frontend validation**

Run:

```bash
cd frontend
pnpm build
```

If build is too slow or blocked by environment, report that clearly with the failure output.
