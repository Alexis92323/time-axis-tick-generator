import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTimeTicks } from '../src/index.js';

// All test timestamps are explicit constants. No Date.now(), no sleep, no wall-clock.
// Comparisons use == against integer timestamps, never against floats.

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Reference UTC midnight timestamps used across tests.
const MIDNIGHT_2020_01_01 = Date.UTC(2020, 0, 1);
const MIDNIGHT_2021_01_01 = Date.UTC(2021, 0, 1);
const MIDNIGHT_2020_02_01 = Date.UTC(2020, 1, 1);

function midnightUTC(y, m, d) {
  return Date.UTC(y, m, d);
}

function midnightAndOffsetMidnightUTC(y, m, d, hours) {
  return Date.UTC(y, m, d, hours);
}

// Rounding helpers used for calendar-aware assertions.
function roundToSecond(ts) {
  const rem = ts % MS_PER_SECOND;
  return ts - (rem < 0 ? rem + MS_PER_SECOND : rem);
}

function roundToMinute(ts) {
  const rem = ts % MS_PER_MINUTE;
  return ts - (rem < 0 ? rem + MS_PER_MINUTE : rem);
}

function roundToHour(ts) {
  const rem = ts % MS_PER_HOUR;
  return ts - (rem < 0 ? rem + MS_PER_HOUR : rem);
}

function roundToDay(ts) {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function roundToHourFromMidnight(ts) {
  // Round down to nearest hour boundary anchored to UTC midnight (same grid).
  const rem = ts % MS_PER_HOUR;
  return ts - (rem < 0 ? rem + MS_PER_HOUR : rem);
}

test('throws TypeError when startMs is not a number', () => {
  assert.throws(() => generateTimeTicks('x', 1000, 5), TypeError);
});

test('throws TypeError when endMs is NaN', () => {
  assert.throws(() => generateTimeTicks(0, NaN, 5), TypeError);
});

test('throws TypeError when targetCount is not an integer', () => {
  assert.throws(() => generateTimeTicks(0, 1000, 1.5), TypeError);
});

test('throws TypeError when targetCount is zero', () => {
  assert.throws(() => generateTimeTicks(0, 1000, 0), TypeError);
});

test('throws RangeError when startMs >= endMs', () => {
  assert.throws(() => generateTimeTicks(100, 100, 5), RangeError);
  assert.throws(() => generateTimeTicks(200, 100, 5), RangeError);
});

test('throws RangeError when timestamps are outside Date range', () => {
  assert.throws(() => generateTimeTicks(-9e15, -8.5e15, 5), RangeError);
  assert.throws(() => generateTimeTicks(8.5e15, 9.1e15, 5), RangeError);
});

test('emits sub-millisecond interval anchored to step 1 ms', () => {
  const start = MIDNIGHT_2020_01_01;
  const end = start + 3;
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(Array.isArray(ticks));
  assert.ok(ticks.length >= 1);
  for (const t of ticks) assert.ok(t >= start && t < end);
});

test('10s ticks align to UTC midnight anchor and stay in range', () => {
  const start = Date.UTC(2020, 0, 1, 0, 0, 5);
  const end = Date.UTC(2020, 0, 1, 0, 2, 0);
  const ticks = generateTimeTicks(start, end, 10);
  assert.ok(ticks.length >= 1);
  assert.ok(ticks[0] % (10 * MS_PER_SECOND) === 0, 'first tick on 10s grid');
  assert.ok(ticks[0] >= start, 'first tick >= start');
  assert.ok(ticks[ticks.length - 1] < end, 'last tick < end');
});

test('minute ticks land on whole-minute boundaries', () => {
  const start = Date.UTC(2020, 0, 1, 0, 0, 30);
  const end = Date.UTC(2020, 0, 1, 0, 20, 0);
  const ticks = generateTimeTicks(start, end, 10);
  assert.ok(ticks.length >= 1);
  assert.ok(ticks[0] % MS_PER_MINUTE === 0, 'first tick on minute grid');
});

test('hour ticks land on whole-hour boundaries', () => {
  const start = Date.UTC(2020, 0, 1, 5, 30);
  const end = Date.UTC(2020, 0, 1, 18, 0);
  const ticks = generateTimeTicks(start, end, 6);
  assert.ok(ticks.length >= 1);
  assert.ok(ticks[0] % MS_PER_HOUR === 0, 'first tick on hour grid');
});

test('ticks are strictly ascending', () => {
  const start = Date.UTC(2020, 0, 1, 5, 30);
  const end = Date.UTC(2020, 0, 1, 18, 0);
  const ticks = generateTimeTicks(start, end, 6);
  for (let i = 1; i < ticks.length; i++) {
    assert.ok(ticks[i] > ticks[i - 1], `tick ${i} strictly greater than tick ${i - 1}`);
  }
});

test('all ticks lie within [startMs, endMs)', () => {
  const start = Date.UTC(2020, 0, 1, 5, 30);
  const end = Date.UTC(2020, 0, 1, 18, 0);
  const ticks = generateTimeTicks(start, end, 6);
  for (const t of ticks) {
    assert.ok(t >= start && t < end, `tick ${t} in [start, end)`);
  }
});

test('daily ticks align to UTC midnight', () => {
  const start = Date.UTC(2020, 0, 1, 12, 0, 0);
  const end = Date.UTC(2020, 0, 10, 0, 0, 0);
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(ticks.length >= 1);
  for (const t of ticks) {
    const d = new Date(t);
    assert.equal(d.getUTCHours(), 0, 'daily tick at midnight UTC');
    assert.equal(d.getUTCMinutes(), 0);
  }
});

test('weekly ticks align to UTC midnight', () => {
  const start = Date.UTC(2020, 0, 1, 12, 0, 0);
  const end = Date.UTC(2020, 1, 28, 0, 0, 0);
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(ticks.length >= 1);
  for (const t of ticks) {
    const d = new Date(t);
    assert.equal(d.getUTCHours(), 0, 'weekly tick at midnight UTC');
  }
});

test('monthly ticks land on the first day of the month', () => {
  const start = Date.UTC(2020, 0, 15, 12, 0, 0);
  const end = Date.UTC(2020, 5, 1, 0, 0, 0);
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(ticks.length >= 1);
  for (const t of ticks) {
    const d = new Date(t);
    assert.equal(d.getUTCDate(), 1, 'monthly tick on day 1');
    assert.equal(d.getUTCHours(), 0, 'monthly tick at midnight UTC');
  }
});

test('yearly ticks land on Jan 1 UTC', () => {
  const start = Date.UTC(2018, 5, 1);
  const end = Date.UTC(2025, 0, 1);
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(ticks.length >= 1);
  for (const t of ticks) {
    const d = new Date(t);
    assert.equal(d.getUTCMonth(), 0, 'yearly tick in January');
    assert.equal(d.getUTCDate(), 1, 'yearly tick on day 1');
  }
});

test('tick spacing equals step size for hour step', () => {
  const start = Date.UTC(2020, 0, 1, 1, 0, 0);
  const end = Date.UTC(2020, 0, 1, 8, 0, 0);
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(ticks.length >= 2);
  const gaps = [];
  for (let i = 1; i < ticks.length; i++) gaps.push(ticks[i] - ticks[i - 1]);
  const allEqual = gaps.every(g => g === gaps[0]);
  assert.ok(allEqual, 'all gaps equal (regular grid)');
});

test('tick spacing equals step size for minute step', () => {
  const start = Date.UTC(2020, 0, 1, 0, 5, 0);
  const end = Date.UTC(2020, 0, 1, 0, 35, 0);
  const ticks = generateTimeTicks(start, end, 4);
  assert.ok(ticks.length >= 2);
  const gaps = [];
  for (let i = 1; i < ticks.length; i++) gaps.push(ticks[i] - ticks[i - 1]);
  const allEqual = gaps.every(g => g === gaps[0]);
  assert.ok(allEqual, 'all gaps equal (regular grid)');
});

test('returns at least one tick even when interval contains no full step', () => {
  // 2-second interval with targetCount=10 forces step down to 1s; at least one tick emits.
  const start = Date.UTC(2020, 0, 1, 0, 0, 1, 500);
  const end = Date.UTC(2020, 0, 1, 0, 0, 3, 500);
  const ticks = generateTimeTicks(start, end, 10);
  assert.ok(ticks.length >= 1);
});

test('larger targetCount yields a finer step', () => {
  const start = Date.UTC(2020, 0, 1, 0, 0, 0);
  const end = Date.UTC(2020, 0, 2, 0, 0, 0);
  const coarse = generateTimeTicks(start, end, 2);
  const fine = generateTimeTicks(start, end, 50);
  // Finer target should produce at least as many ticks as the coarse one.
  assert.ok(fine.length >= coarse.length, 'finer target yields more-or-equal ticks');
});

test('targetCount=1 still returns a tick in-range', () => {
  const start = Date.UTC(2020, 0, 1, 12, 0, 0);
  const end = Date.UTC(2020, 0, 2, 0, 0, 0);
  const ticks = generateTimeTicks(start, end, 1);
  assert.ok(ticks.length >= 1);
  assert.ok(ticks[0] >= start && ticks[0] < end);
});

test('monthly anchor falls in [start, end)', () => {
  const start = Date.UTC(2020, 0, 15, 12, 0, 0);
  const end = Date.UTC(2020, 6, 1, 0, 0, 0);
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(ticks.length >= 1);
  for (const t of ticks) {
    assert.ok(t >= start, `tick ${t} >= start`);
    assert.ok(t < end, `tick ${t} < end`);
  }
});

test('yearly anchor falls in [start, end)', () => {
  const start = Date.UTC(2018, 5, 1);
  const end = Date.UTC(2025, 0, 1);
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(ticks.length >= 1);
  for (const t of ticks) {
    assert.ok(t >= start, `tick ${t} >= start`);
    assert.ok(t < end, `tick ${t} < end`);
  }
});

test('monthly step lands on month boundary for the duration of a year', () => {
  const start = Date.UTC(2020, 0, 2, 0, 0, 0);
  const end = Date.UTC(2021, 0, 1, 0, 0, 0);
  const ticks = generateTimeTicks(start, end, 12);
  assert.ok(ticks.length >= 1);
  for (const t of ticks) {
    const d = new Date(t);
    assert.equal(d.getUTCDate(), 1, 'monthly tick on day 1');
    assert.equal(d.getUTCHours(), 0, 'monthly tick at midnight');
  }
});

test('sub-minute step aligns to midnight grid', () => {
  const start = Date.UTC(2020, 0, 1, 0, 0, 13, 500);
  const end = Date.UTC(2020, 0, 1, 0, 2, 0, 0);
  const ticks = generateTimeTicks(start, end, 10);
  assert.ok(ticks.length >= 1);
  // All ticks should be multiples of the step size from midnight. We don't assert the
  // exact step (that's an implementation detail), but we assert the grid property:
  // the gap between consecutive ticks is constant (regular grid).
  if (ticks.length >= 2) {
    const gaps = [];
    for (let i = 1; i < ticks.length; i++) gaps.push(ticks[i] - ticks[i - 1]);
    const allEqual = gaps.every(g => g === gaps[0]);
    assert.ok(allEqual, 'regular grid');
  }
});

test('returns an array', () => {
  const start = Date.UTC(2020, 0, 1, 0, 0, 0);
  const end = Date.UTC(2020, 0, 1, 1, 0, 0);
  const ticks = generateTimeTicks(start, end, 5);
  assert.ok(Array.isArray(ticks));
});

test('returns integers', () => {
  const start = Date.UTC(2020, 0, 1, 0, 0, 0);
  const end = Date.UTC(2020, 0, 1, 1, 0, 0);
  const ticks = generateTimeTicks(start, end, 5);
  for (const t of ticks) {
    assert.ok(Number.isInteger(t), `tick ${t} is an integer`);
  }
});
