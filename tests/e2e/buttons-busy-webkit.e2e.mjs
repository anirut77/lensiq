// tests/e2e/buttons-busy-webkit.e2e.mjs — busy state + double-tap protection of the key action buttons in WebKit (iPhone
// 13 profile, 375 px, fake cameras; macOS CI shard) (list: tests/e2e/buttons-busy-list.json, rules: tests/e2e/buttons-kit.mjs).
import { runBusy } from "./buttons-kit.mjs";

export default async function (ctx) { await runBusy(ctx, "webkit"); }
