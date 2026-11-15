// tests/e2e/buttons-busy.e2e.mjs — busy state + double-tap protection of the key action buttons in Chrome (375 px)
// (list: tests/e2e/buttons-busy-list.json, rules: tests/e2e/buttons-kit.mjs).
import { runBusy } from "./buttons-kit.mjs";

export default async function (ctx) { await runBusy(ctx, "chrome"); }
