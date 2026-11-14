// @ts-check
// backend/src/freetier.js — free tiers of the four business products (owner decision 2026-11-13, option B). Fortune and
// the general tools have no limit (signed-out users keep the full fortune reading). The limits are COUNTED on the device
// (lensiq-freetier.js carries the same numbers; tests/unit/free-tier.test.js keeps them equal) and are NOT ENFORCED:
// FREE_TIER_ENFORCE is a code constant, not a setting — turning enforcement on is a code change after the owner decides.
// Limits apply only from a date announced at least NOTICE_DAYS ahead and start START_AFTER_DAYS after the announcement;
// customers can always export their data. A licence works offline for OFFLINE_LICENCE_DAYS after the device last checked.
// Honest note (CTO brief): a limit that runs on the user's device can be bypassed by someone who edits the code; the
// contract is what binds.

const freeze = o => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze({ ...v })])));

export const FREE_TIERS = freeze({
  gate: { trial_days: 30, lanes: 1, plates_per_day: 100 },
  attendance: { people: 5 },
  exam: { candidates_per_session: 5 },
  crowd: { hours_per_device_per_day: 2 }
});
export const FREE_TIER_ENFORCE = false;
export const NOTICE_DAYS = 30;
export const START_AFTER_DAYS = 30;
export const OFFLINE_LICENCE_DAYS = 14;

/** Unix seconds when limits announced at `announcedAt` (unix seconds) may start. */
export const limitsStart = announcedAt => announcedAt + START_AFTER_DAYS * 86400;
/** True when a start date respects the notice period. */
export const announcementOk = (announcedAt, startAt) => Number.isFinite(announcedAt) && Number.isFinite(startAt) && startAt - announcedAt >= NOTICE_DAYS * 86400;
/** Until when a device may treat a licence as valid without reaching the Worker: 14 days, never past the licence end. */
export const offlineUntil = (checkedAt, endsAt) => Math.min(checkedAt + OFFLINE_LICENCE_DAYS * 86400, endsAt);
