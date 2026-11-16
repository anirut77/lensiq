// tests/e2e/fortune-share-print-th.e2e.mjs — fortune share & print, Chrome, Thai (+ calm session). Checks: tests/e2e/fortune-share-print-kit.mjs.
import { run } from "./fortune-share-print-kit.mjs";
export default async function (ctx) { await run(ctx, "th"); }
