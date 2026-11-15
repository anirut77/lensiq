// tests/e2e/buttons-webkit-1.e2e.mjs — part 1 of the button press gate in WebKit (iPhone 13 profile, 375 px; macOS CI shard) (rules: tests/e2e/buttons-kit.mjs).
import { runStyle } from "./buttons-kit.mjs";

export default async function (ctx) { await runStyle(ctx, "webkit", 1); }
