// tests/e2e/buttons-chrome-3.e2e.mjs — part 3 of the button press gate in Chrome (375 px) (rules: tests/e2e/buttons-kit.mjs).
import { runStyle } from "./buttons-kit.mjs";

export default async function (ctx) { await runStyle(ctx, "chrome", 3); }
