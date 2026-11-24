// tests/e2e/fortune-share-print-en.e2e.mjs — fortune share & print, Chrome, English. Checks: tests/e2e/fortune-share-print-kit.mjs.
import { run } from "./fortune-share-print-kit.mjs";
export default async function (ctx) { await run(ctx, "en"); }
