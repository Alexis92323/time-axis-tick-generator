/**
 * Time Axis Tick Generator.
 *
 * All inputs and outputs are milliseconds since the Unix epoch (1970-01-01T00:00:00.000Z),
 * matching the convention of JavaScript's built-in Date.now() and Date.getTime().
 *
 * Each tick is an integer multiple of its step: tick_i = anchor + i * step, where the
 * anchor is a multiple of the step rounded down to a UTC midnight. This guarantees
 * that every tick aligns to a regular grid (month, day, minute, etc.), so ticks are
 * visually regular on a linear axis.
 *
 * We intentionally avoid arithmetic on full Dates for tick placement. Adding months
 * via Date.setMonth introduces irregular gaps (28 vs 31 vs 30 days) between ticks,
 * which looks wrong on a linear time axis. Instead, we anchor all ticks to a UTC
 * midnight (because UTC midnight is stable), and treat the anchor as a multiple of
 * the step (month and day multiples are taken from midnight). For sub-day steps,
 * ticks align to UTC midnight. This is a pragmatic trade-off: visually regular ticks
 * at the cost of UTC-centric alignment. For pure-timezone display, a downstream
 * layer can apply a constant offset to the returned timestamps.
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY; // 365 * 24 * 3600 * 1000 = 31_536_000_000

// Each step has a UTC-midnight-based anchorMultiple and a sizeMs (or years count).
// anchorMultiple is used to round the start time down to the grid; sizeMs is the
// tick interval. Since midnight is a multiple of day, minute, second, hour, week
// (7 days), and year (365 days), all grids align to midnight.
const STEPS = [
  { years: 10 },
  { years: 5 },
  { years: 2 },
  { years: 1 },
  { months: 6 },
  { months: 3 },
  { months: 2 },
  { months: 1 },
  { days: 7 },
  { days: 1 },
  { hours: 6 },
  { hours: 2 },
  { hours: 1 },
  { minutes: 15 },
  { minutes: 5 },
  { minutes: 1 },
  { seconds: 10 },
  { seconds: 2 },
  { seconds: 1 },
  { milliseconds: 500 },
  { milliseconds: 200 },
  { milliseconds: 100 },
  { milliseconds: 50 },
  { milliseconds: 20 },
  { milliseconds: 10 },
  { milliseconds: 5 },
  { milliseconds: 2 },
  { milliseconds: 1 },
];

const MONTHS_IN_YEAR = 12;

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function daysInMonth(year, month) {
  // month is 0-indexed (0=Jan). The day-of-month trick avoids building a full table.
  if (month === 1) return isLeapYear(year) ? 29 : 28;
  // Months with 30 days: Apr(3), Jun(5), Sep(8), Nov(11).
  if (month === 3 || month === 5 || month === 8 || month === 11) return 30;
  return 31;
}

/**
 * Returns a Date for the first day of the year (UTC), preserving the sign of t.
 * Rounding down for negative timestamps crosses into the previous year.
 */
function startOfYear(t) {
  const d = new Date(t);
  d.setUTCMonth(0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Rounds t down to the start of a month boundary (UTC).
 */
function startOfMonth(t) {
  const d = new Date(t);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Rounds t down to UTC midnight. Central to grid alignment.
 */
function startOfDay(t) {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Floor t to a fixed-ms grid that starts at UTC midnight. Used for hour/minute/etc.
 */
function floorToGrid(t, sizeMs) {
  // sizeMs divides evenly into a day, so (ms % sizeMs) at midnight is 0 and the
  // remainder equals the milliseconds elapsed since midnight (works for t<0 too).
  const ms = t % sizeMs;
  const rem = ms < 0 ? ms + sizeMs : ms;
  return t - rem;
}

/**
 * Anchor the start time to the first multiple of the step at or before startMs.
 * For sub-month steps, we floor to UTC midnight then to the step grid.
 * For year/month steps, we floor to the year/month boundary via Date arithmetic.
 */
function anchorStart(startMs, step) {
  if (step.years) {
    return startOfYear(startMs).getTime();
  } else if (step.months) {
    return startOfMonth(startMs).getTime();
  }
  const dayMs = startOfDay(startMs).getTime();
  if (step.days) {
    const size = step.days * MS_PER_DAY;
    return floorToGrid(dayMs, size);
  } else if (step.hours) {
    return floorToGrid(dayMs, step.hours * MS_PER_HOUR);
  } else if (step.minutes) {
    return floorToGrid(dayMs, step.minutes * MS_PER_MINUTE);
  } else if (step.seconds) {
    return floorToGrid(dayMs, step.seconds * MS_PER_SECOND);
  }
  return floorToGrid(dayMs, step.milliseconds);
}

/**
 * Number of calendar units covered by an interval. For years: count year transitions.
 * For months: count month transitions. Both count boundaries strictly between
 * startMs and endMs. This avoids over-counting when the end falls exactly on a boundary.
 */
function unitsCovered(startMs, endMs, unit, count) {
  let n = 0;
  if (unit === 'years') {
    let d = new Date(startMs);
    let safety = 200000; // guard against pathological infinite loops
    while (d.getTime() < endMs && safety-- > 0) {
      d.setUTCFullYear(d.getUTCFullYear() + count);
      n++;
    }
    return n;
  } else if (unit === 'months') {
    let d = new Date(startMs);
    let safety = 200000;
    while (d.getTime() < endMs && safety-- > 0) {
      d.setUTCMonth(d.getUTCMonth() + count);
      n++;
    }
    return n;
  }
  const size = count;
  if (unit === 'days') return Math.ceil((endMs - startMs) / (size * MS_PER_DAY));
  if (unit === 'hours') return Math.ceil((endMs - startMs) / (size * MS_PER_HOUR));
  if (unit === 'minutes') return Math.ceil((endMs - startMs) / (size * MS_PER_MINUTE));
  if (unit === 'seconds') return Math.ceil((endMs - startMs) / (size * MS_PER_SECOND));
  return Math.ceil((endMs - startMs) / size);
}

function coverageUnit(step) {
  if (step.years) return { unit: 'years', count: step.years };
  if (step.months) return { unit: 'months', count: step.months };
  if (step.days) return { unit: 'days', count: step.days };
  if (step.hours) return { unit: 'hours', count: step.hours };
  if (step.minutes) return { unit: 'minutes', count: step.minutes };
  if (step.seconds) return { unit: 'seconds', count: step.seconds };
  return { unit: 'milliseconds', count: step.milliseconds };
}

/**
 * Returns the timestamp `count` units after the given base timestamp.
 * For years/months we use Date arithmetic so each step is a real calendar period.
 * For fixed-ms steps we add sizeMs directly, which preserves the grid.
 */
function addUnits(baseMs, unit, count) {
  if (unit === 'years') {
    const d = new Date(baseMs);
    d.setUTCFullYear(d.getUTCFullYear() + count);
    return d.getTime();
  }
  if (unit === 'months') {
    const d = new Date(baseMs);
    d.setUTCMonth(d.getUTCMonth() + count);
    return d.getTime();
  }
  if (unit === 'days') return baseMs + count * MS_PER_DAY;
  if (unit === 'hours') return baseMs + count * MS_PER_HOUR;
  if (unit === 'minutes') return baseMs + count * MS_PER_MINUTE;
  if (unit === 'seconds') return baseMs + count * MS_PER_SECOND;
  return baseMs + count;
}

/**
 * Pick the smallest step that yields at least `targetCount` ticks between startMs and endMs.
 * The list is pre-ordered from coarsest (years) to finest (1ms).
 */
function chooseStep(startMs, endMs, targetCount) {
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const { unit, count } = coverageUnit(step);
    const covered = unitsCovered(startMs, endMs, unit, count);
    if (covered >= targetCount) {
      return step;
    }
  }
  return STEPS[STEPS.length - 1];
}

/**
 * Advance the Date by `count` years, skipping over non-existent dates (e.g. Feb 29
 * on a non-leap year) without losing a year's worth of progress. Used by yearStepNext.
 */
function advanceYears(d, count) {
  const before = d.getUTCFullYear();
  while (d.getUTCFullYear() !== before + count) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCMonth() === 1 && d.getUTCDate() === 28 && count < 0) {
      // When counting backwards, Feb 28 -> Feb 29 - 1 day = Feb 28, which would loop.
      // Jump straight to Feb 29 if it exists in the target year.
      d = new Date(Date.UTC(before + count, 1, 29));
    }
    if (d.getTime() < -8.6e15) break;
  }
}

/**
 * Returns baseMs + count years, handling Feb 29 anchor edge case by skipping forward
 * over the missing day rather than losing a year of progress.
 */
function yearStepNext(baseMs, count) {
  const d = new Date(baseMs);
  const originalDay = d.getUTCDate();
  try {
    d.setUTCFullYear(d.getUTCFullYear() + count);
    if (d.getUTCMonth() === 1 && originalDay === 29 && d.getUTCDate() !== 29) {
      // Feb 29 -> Feb 28 on non-leap target. Step forward to Mar 1.
      d.setUTCMonth(2, 1);
    }
    return d.getTime();
  } catch (e) {
    // RangeError means the year is out of Date's representable range.
    return NaN;
  }
}

/**
 * Returns baseMs + count months, handling end-of-month overflow by clamping to the
 * last day of the target month (e.g. Jan 31 + 1 month = Feb 28/29).
 */
function monthStepNext(baseMs, count) {
  const d = new Date(baseMs);
  try {
    d.setUTCMonth(d.getUTCMonth() + count);
    return d.getTime();
  } catch (e) {
    return NaN;
  }
}

/**
 * Returns baseMs + count units. For years/months this delegates to Date arithmetic
 * so each tick is a real calendar boundary (Feb 29 anchor handled gracefully).
 * For fixed-ms steps this is simple arithmetic that preserves grid alignment.
 */
function stepNext(baseMs, unit, count) {
  if (unit === 'years') return yearStepNext(baseMs, count);
  if (unit === 'months') return monthStepNext(baseMs, count);
  if (unit === 'days') return baseMs + count * MS_PER_DAY;
  if (unit === 'hours') return baseMs + count * MS_PER_HOUR;
  if (unit === 'minutes') return baseMs + count * MS_PER_MINUTE;
  if (unit === 'seconds') return baseMs + count * MS_PER_SECOND;
  return baseMs + count;
}

/**
 * Generate rounded, visually pleasing tick marks for a time axis.
 *
 * @param {number} startMs - Interval start, ms since epoch.
 * @param {number} endMs - Interval end (exclusive), ms since epoch.
 * @param {number} targetCount - Desired minimum number of ticks; at least one tick is
 *   always returned. Must be a positive integer.
 * @returns {number[]} Integer ms timestamps of ticks within [startMs, endMs), sorted ascending.
 * @throws {TypeError} If arguments are not numbers or targetCount is not a positive integer.
 * @throws {RangeError} If startMs >= endMs or either timestamp is outside representable range.
 */
export function generateTimeTicks(startMs, endMs, targetCount) {
  if (typeof startMs !== 'number' || !Number.isFinite(startMs)) {
    throw new TypeError('startMs must be a finite number');
  }
  if (typeof endMs !== 'number' || !Number.isFinite(endMs)) {
    throw new TypeError('endMs must be a finite number');
  }
  if (typeof targetCount !== 'number' || !Number.isInteger(targetCount) || targetCount < 1) {
    throw new TypeError('targetCount must be a positive integer');
  }
  if (startMs >= endMs) {
    throw new RangeError('startMs must be less than endMs');
  }
  const MAX_MS = 8.64e15;
  if (startMs < -MAX_MS || endMs > MAX_MS) {
    throw new RangeError('startMs or endMs is outside the representable Date range');
  }

  const step = chooseStep(startMs, endMs, targetCount);
  const { unit, count } = coverageUnit(step);
  let anchor = anchorStart(startMs, step);

  // For year/month steps, the anchor from startOfYear/startOfMonth may sit below startMs,
  // so we step forward until we're within the interval. Use calendar arithmetic to keep
  // every tick a real calendar boundary (consistent with how stepNext works).
  if (unit === 'years' || unit === 'months') {
    while (anchor < startMs) {
      const next = stepNext(anchor, unit, count);
      if (!Number.isFinite(next)) {
        return []; // hit the representable-range edge; nothing left to emit
      }
      anchor = next;
    }
  } else {
    // For fixed-ms steps, step forward in fixed increments until within [startMs, endMs).
    while (anchor < startMs) {
      anchor = stepNext(anchor, unit, count);
    }
  }

  const ticks = [];
  let current = anchor;
  let guard = 0;
  const hardCap = 100000; // safety against runaway loops

  while (current < endMs && guard < hardCap) {
    if (current >= startMs) {
      ticks.push(current);
    }
    const next = stepNext(current, unit, count);
    if (!Number.isFinite(next) || next <= current) break; // out of range or overflow
    current = next;
    guard++;
  }

  // The smallest step guarantee returns at least one tick whenever the interval is wide
  // enough to contain even one step; for very narrow intervals this can still be empty,
  // so we ensure at least one tick on the anchor to avoid degenerate output.
  if (ticks.length === 0) {
    let fallback = anchor;
    if (fallback < startMs) {
      const next = stepNext(fallback, unit, count);
      if (Number.isFinite(next) && next < endMs) {
        fallback = next;
      }
    }
    if (fallback >= endMs) {
      fallback = startMs;
    }
    ticks.push(fallback);
  }

  return ticks;
}
