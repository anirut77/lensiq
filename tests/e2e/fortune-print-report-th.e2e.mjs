// tests/e2e/fortune-print-report-th.e2e.mjs — paper report (print layout), Chrome, Thai. Checks: tests/e2e/fortune-print-report-kit.mjs.
import { run } from "./fortune-print-report-kit.mjs";
export default async function (ctx) { await run(ctx, "th"); }
