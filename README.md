# Time Axis Tick Generator

Generates rounded, visually pleasing tick marks for a time axis given a start time, end time, and target tick count. Inputs and outputs are milliseconds since the Unix epoch.

## Usage

```js
import { generateTimeTicks } from 'time-axis-tick-generator';

const start = Date.UTC(2020, 0, 1, 12, 0, 0);
const end = Date.UTC(2020, 0, 1, 18, 0, 0);
const ticks = generateTimeTicks(start, end, 6);
// => [ Date.UTC(2020,0,1,12), Date.UTC(2020,0,1,13), ... ]
```

The library exports exactly one function, `generateTimeTicks(startMs, endMs, targetCount)`, which returns an array of integer millisecond timestamps strictly within `[startMs, endMs)`.

## Why this exists

Chart libraries either ship with a tick generator tuned to a specific visual style, or leave you to write your own. The common failure mode is ticks that don't line up: 13:37, 14:42, 15:47, etc. This library picks steps from a fixed ladder (10 years, 5 years, 2 years, 1 year, 6 months, 3 months, 2 months, 1 month, 1 week, 1 day, 6 hours, 2 hours, 1 hour, 15 minutes, 5 minutes, 1 minute, 10 seconds, 2 seconds, 1 second, then milliseconds down to 1 ms) and anchors every tick to a UTC midnight. The smallest step on the ladder that produces at least `targetCount` ticks is chosen, so the output count is always `>= targetCount` whenever the interval is wide enough to contain one full step.

The trade-off is that ticks are anchored to UTC midnight, which is a stable, timezone-neutral reference point. If you display in a specific timezone, apply a constant offset to the returned timestamps downstream; do not expect the library to align to local midnight. Anchoring to local midnight would require a timezone database and breaks determinism in tests, so we anchor to UTC.

## The awkward edge

Calendar steps (years and months) have variable length: a month is 28-31 days, a year is 365 or 366 days. To keep ticks visually regular on a linear axis, every tick is an integer multiple of the step anchored to a UTC midnight, computed via calendar arithmetic on the `Date` object. This means a year step anchored to Feb 29 in a leap year advances through non-leap years by clamping to Mar 1, and a month step from Jan 31 lands on Feb 28/29. Both are real calendar boundaries; they are not mathematically equidistant, but they are the visually expected positions.

Another edge: for very narrow intervals (shorter than one step), the library always returns at least one tick on the anchor to avoid producing an empty axis. For timestamps outside the representable range of `Date` (roughly ±8.64e15 ms, about ±275,000 years), a `RangeError` is thrown.
