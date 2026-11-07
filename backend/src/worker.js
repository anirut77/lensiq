// @ts-check
// backend/src/worker.js — the deployed Worker entry (wrangler.toml `main`). It exports ONLY the default handler:
// workerd treats every named export of the main module as an entrypoint and refuses to start when one is not a
// handler (found by the round-11 workerd integration test: "Incorrect type for map entry 'RECONCILE_CRON'").
// The router, constants and test helpers stay importable from ./index.js.
import worker from "./index.js";

export default worker;
