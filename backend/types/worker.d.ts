// backend/types/worker.d.ts — minimal ambient types for the Worker so `tsc --checkJs` runs offline (no
// @cloudflare/workers-types / @anthropic-ai/sdk install needed). Only what backend/src uses.

/** Cloudflare D1 (subset used by the Worker; tests use tests/unit/backend-d1-shim.js with the same surface). */
interface D1Result<T = Record<string, any>> {
  success: boolean;
  results?: T[];
  meta?: { changes?: number; last_row_id?: number; [k: string]: unknown };
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, any>>(column?: string): Promise<T | null>;
  all<T = Record<string, any>>(): Promise<D1Result<T>>;
  run<T = Record<string, any>>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = Record<string, any>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(sql: string): Promise<unknown>;
}

/** Workers Static Assets binding (admin shell). */
interface Fetcher { fetch(input: Request | string, init?: RequestInit): Promise<Response>; }

/** Worker env: bindings + vars + secrets (all optional strings except DB). */
interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  [name: string]: any;
}

interface ExecutionContext { waitUntil(p: Promise<unknown>): void; passThroughOnException?(): void; }
interface ScheduledController { cron: string; scheduledTime?: number; }

/** The Anthropic SDK is bundled by wrangler from backend/node_modules; typed loosely here. */
declare module "@anthropic-ai/sdk" {
  const Anthropic: any;
  export default Anthropic;
}

/** The shared browser module (fortune-ai.js, CommonJS/UMD at the repo root) is imported as-is by fortune.js. */
/** The Product Check personal-data guard (UMD at the repo root), imported as-is by ai/pc-features.js. */
declare module "../../../lensiq-pc-guard.js" {
  const LQPCGuard: any;
  export default LQPCGuard;
}

declare module "../../fortune-ai.js" {
  const FortuneAI: any;
  export default FortuneAI;
}
