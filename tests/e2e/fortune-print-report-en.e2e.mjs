// tests/e2e/fortune-print-report-en.e2e.mjs — paper report (print layout), Chrome, English. Checks: tests/e2e/fortune-print-report-kit.mjs.
import { run } from "./fortune-print-report-kit.mjs";
export default async function (ctx) { await run(ctx, "en"); }
