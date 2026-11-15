// tests/e2e/buttons-chrome-1.e2e.mjs — part 1 of the button press gate in Chrome (375 px) (rules: tests/e2e/buttons-kit.mjs).
import { runStyle } from "./buttons-kit.mjs";

export default async function (ctx) { await runStyle(ctx, "chrome", 1); }
