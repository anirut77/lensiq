"use strict";
// tests/unit/totp-clock.js — deterministic clock for the backend tests that generate real TOTP codes.
//
// Those tests make a code with Date.now() and the Worker verifies it a few milliseconds later with its own Date.now().
// The Worker accepts the previous, the current and the next 30-second step. A test that asked for the PREVIOUS step
// ("step - 1", used so that a later code of the current step is not a replay) fails when the wall clock crosses a step
// boundary between generating and verifying ("invalid TOTP code", seen once in CI, run 43464554484); a test that makes two
// codes "of the current step" to prove replay protection can get two different steps. Both are removed by freezing the
// shared clock: Date.now() is the same instant for the generator and the Worker for the whole file, placed 10 s into a
// 30-second step so that step-1, step and step+1 are always inside the Worker's window. Nothing asserted changes.
//
// Use at the top of a test file:   require("./totp-clock.js").freeze();
const { mock, after } = require("node:test");

/** @param {number} [secIntoStep] seconds after the start of the current 30 s step at which the clock stands still */
function freeze(secIntoStep = 10) {
  const start = Math.floor(Date.now() / 30000) * 30000 + secIntoStep * 1000;
  mock.timers.enable({ apis: ["Date"], now: start });
  after(() => { mock.timers.reset(); });
  return start;
}

module.exports = { freeze };
