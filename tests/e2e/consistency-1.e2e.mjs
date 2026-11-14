// tests/e2e/consistency-1.e2e.mjs — part 1 of the site-wide consistency gate (rules: tests/e2e/consistency-kit.mjs).
import { runPart } from "./consistency-kit.mjs";

export default async function (ctx) { await runPart(ctx, 1); }
