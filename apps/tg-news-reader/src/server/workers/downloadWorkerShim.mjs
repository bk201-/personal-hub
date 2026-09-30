/**
 * Dev-only shim entry point for the download worker.
 *
 * Why this exists:
 *   downloadWorker.ts uses `moduleResolution: "nodenext"` which requires
 *   `.js` extensions on imports (e.g. `'../db/index.js'`). At runtime in dev
 *   those files don't exist on disk — tsx's resolve hook rewrites them to `.ts`.
 *
 *   With Node.js 22.12+ ESM hooks run off-thread. The old `--import tsx/esm`
 *   via execArgv doesn't reliably activate tsx's resolve hook in time for
 *   worker thread static imports, and node:module's register() is rejected
 *   by tsx/esm because it expects to be loaded via --import.
 *
 *   The fix: use tsx's OWN register() from `tsx/esm/api` — it handles the
 *   Node.js module customization protocol correctly, then dynamically import
 *   the TypeScript worker so tsx hooks are guaranteed active.
 *
 * In production the worker pool spawns downloadWorker.js (compiled),
 * so this shim is never used in prod.
 */

import { register } from 'tsx/esm/api';

// Register tsx's ESM hooks for this worker thread using tsx's own API.
// This is different from node:module's register() — tsx/esm/api knows
// how to install itself without triggering the --loader deprecation error.
const unregister = register();

// Dynamically import the real TypeScript worker.
// tsx is now active: '../db/index.js' → '../db/index.ts', etc.
await import('./downloadWorker.ts');

// Worker thread will stay alive via worker_threads message loop;
// unregister is a no-op here but kept for clarity.
void unregister;
