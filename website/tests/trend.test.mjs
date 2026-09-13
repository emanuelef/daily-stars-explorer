import assert from "node:assert/strict";
import test from "node:test";
import { calculateLocalTrend, loadTrend, parseApiTrend } from "../src/trend.ts";

const history = [
  ["28-02-2024", 2, 12],
  ["29-02-2024", 4, 16],
  ["01-03-2024", 6, 22],
];
const payload = {
  forecast_trend: [
    { ds: "2024-03-02", trend: 8 },
    { ds: "2024-02-29T00:00:00", trend: 4 },
    { ds: "2024-02-28", trend: 2 },
    { ds: "2024-03-01", trend: 6 },
    { ds: "2024-03-03", trend: 10 },
  ],
};
const options = { endpoint: "https://trend.example", timeoutMs: 50 };
const response = value => ({ ok: true, json: async () => value });

const DAY_MS = 24 * 60 * 60 * 1000;
const dateAfter = (start, days) => {
  const [year, month, day] = new Date(Date.parse(start) + days * DAY_MS).toISOString().slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
};
const dailyHistory = (length, daily, start = "2024-01-01") => {
  let total = 100;
  return Array.from({ length }, (_, index) => {
    const value = daily(index);
    total += value;
    return [dateAfter(start, index), value, total];
  });
};
const approximately = (actual, expected, tolerance = 0.02) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
};

test("local trend fits increasing and decreasing historical rates and extends their direction", () => {
  for (const daily of [index => 5 + index * 0.1, index => 40 - index * 0.1]) {
    const input = dailyHistory(180, daily);
    const result = calculateLocalTrend(input);
    assert.equal(result.length, input.length + 30);
    result.forEach((point, index) => approximately(point[1], daily(index)));
  }
});

test("historical fitted rates preserve actual cumulative totals without changing the input", () => {
  const input = dailyHistory(180, index => 5 + index * 0.1 + (index % 2 ? 3 : -3));
  // Actual totals can differ from the integral of the fitted trend.
  input.at(-1)[2] = 5000;
  const original = structuredClone(input);
  const result = calculateLocalTrend(input);
  assert.deepEqual(result.slice(0, input.length).map(([date, , total]) => [date, total]),
    input.map(([date, , total]) => [date, total]));
  assert.deepEqual(input, original);
  approximately(result[input.length][2], 5000 + result[input.length][1]);
});

test("an isolated burst does not become a spike in the underlying trend", () => {
  const input = dailyHistory(365, index => index === 240 ? 1000 : 5);
  const result = calculateLocalTrend(input);
  assert.ok(result.slice(220, 260).every(point => point[1] < 10));
  approximately(result.at(-1)[1], 5, 1);
});

test("an isolated burst in a short history does not dominate the fit or projection", () => {
  for (const length of [15, 21, 28, 35]) {
    for (const burstDay of [0, Math.floor(length / 2), length - 1]) {
      const result = calculateLocalTrend(dailyHistory(length, index => index === burstDay ? 1000 : 1));
      assert.ok(result.slice(0, length).every(point => point[1] > 0.5 && point[1] < 2),
        `historical rates should remain near 1 for ${length} days with a burst on day ${burstDay}`);
      assert.ok(result.slice(length).every(point => point[1] >= 0 && point[1] < 3),
        `a single burst should not produce runaway projections for ${length} days with a burst on day ${burstDay}`);
    }
  }
});

test("sparse weekly stars retain a positive underlying rate", () => {
  const input = dailyHistory(365, index => index % 7 === 0 ? 7 : 0);
  const result = calculateLocalTrend(input);
  assert.ok(result.slice(30, 330).every(point => point[1] > 0.8 && point[1] < 1.2));
  assert.ok(result.slice(365).every(point => point[1] > 0.5 && point[1] < 2));
});

test("short histories with one star per week retain a positive underlying rate", () => {
  for (const length of [15, 21, 28, 35]) {
    const input = dailyHistory(length, index => index % 7 === 0 ? 1 : 0);
    const observed = calculateLocalTrend(input).slice(0, length);
    const meanRate = observed.reduce((sum, point) => sum + point[1], 0) / length;
    assert.ok(meanRate > 0.08 && meanRate < 0.25,
      `sparse activity in ${length} days should retain a rate near 1/7, received ${meanRate}`);
    assert.ok(observed.every(point => point[1] > 0 && point[1] < 0.4));
  }
});

test("the historical trend follows sustained growth followed by a decline", () => {
  const input = dailyHistory(720, index => 4 + Math.min(index, 720 - index) * 0.1);
  const result = calculateLocalTrend(input);
  assert.ok(result[0][1] < 10);
  assert.ok(result[360][1] > 30);
  assert.ok(result[719][1] < 10);
  assert.ok(result.at(-1)[1] < result[719][1]);
});

test("local regression uses calendar distance across missing observations", () => {
  const offsets = [0, 1, 17, 32];
  const input = offsets.map(index => [dateAfter("2024-05-01", index), index + 1, 100 + index]);
  const result = calculateLocalTrend(input);
  assert.deepEqual(result.slice(0, input.length).map(point => point[0]), input.map(point => point[0]));
  result.slice(0, input.length).forEach((point, index) => approximately(point[1], offsets[index] + 1));
  result.slice(input.length).forEach(point => approximately(point[1], 33));
});

test("local trend sorts and normalizes dates and sanitizes unusable observations", () => {
  const result = calculateLocalTrend([
    ["08-03-2024", 8, 8],
    ["31-02-2024", 100, 100],
    ["1-3-2024", -1, NaN],
    ["02-03-2024", Infinity, NaN],
  ]);
  assert.equal(result.length, 33);
  assert.deepEqual(result.slice(0, 3).map(([date, , total]) => [date, total]), [
    ["01-03-2024", 0],
    ["02-03-2024", 0],
    ["08-03-2024", 8],
  ]);
  assert.ok(result.every(point => point.slice(1).every(value => Number.isFinite(value) && value >= 0)));
});

test("local projections integrate 30 daily rates from the last actual cumulative total", () => {
  const input = dailyHistory(14, index => 2 + index * 2, "2024-02-16");
  input.at(-1)[2] = 5000;
  const result = calculateLocalTrend(input);
  result.slice(0, input.length).forEach((point, index) => approximately(point[1], input[index][1]));
  const future = result.slice(input.length);
  assert.equal(future.length, 30);
  let total = input.at(-1)[2];
  future.forEach(([date, daily, cumulative], index) => {
    assert.equal(date, dateAfter("2024-02-29", index + 1));
    approximately(daily, 30 + index * 2);
    total += daily;
    approximately(cumulative, total);
  });
});

test("short histories fit historical rates but hold the final rate in projections", () => {
  for (const input of [history.slice(0, 2), history]) {
    const result = calculateLocalTrend(input);
    result.slice(0, input.length).forEach((point, index) => approximately(point[1], input[index][1]));
    result.slice(input.length).forEach(point => approximately(point[1], input.at(-1)[1]));
  }
});

test("a large final date gap does not extrapolate an unsupported daily slope", () => {
  const input = dailyHistory(180, index => 5 + index * 0.1);
  input.push([dateAfter("2024-01-01", 1000), 105, 5000]);
  const result = calculateLocalTrend(input);
  const fittedEndpoint = result[input.length - 1][1];
  result.slice(input.length).forEach(point => approximately(point[1], fittedEndpoint));
});

test("single-day projections use consecutive UTC dates through leap day", () => {
  const result = calculateLocalTrend([["28-2-2024", 3, 9]]);
  assert.equal(result.length, 31);
  result.forEach((point, index) => assert.deepEqual(point, [dateAfter("2024-02-28", index), 3, 9 + index * 3]));
  assert.equal(result[1][0], "29-02-2024");
  assert.equal(result[2][0], "01-03-2024");
  assert.equal(result.at(-1)[0], "29-03-2024");
});

test("declining projections clamp at zero and never reduce projected totals", () => {
  const input = dailyHistory(14, index => 27 - index * 2);
  const future = calculateLocalTrend(input).slice(input.length);
  assert.equal(future.length, 30);
  assert.ok(future.every(([, daily, total]) => daily === 0 && total === input.at(-1)[2]));
});

test("empty, zero, constant and extreme histories stay finite", () => {
  assert.deepEqual(calculateLocalTrend([]), []);
  assert.deepEqual(calculateLocalTrend([["31-02-2024", 1, 1]]), []);
  for (const value of [0, 5, Number.MAX_VALUE]) {
    const input = dailyHistory(180, () => value).map(([date]) => [date, value, value]);
    const result = calculateLocalTrend(input);
    assert.equal(result.length, 210);
    assert.ok(result.every(point => point.slice(1).every(number => Number.isFinite(number) && number >= 0)));
    result.forEach(point => approximately(point[1] / (value || 1), value ? 1 : 0, 0.000001));
    if (value === Number.MAX_VALUE) assert.equal(result.at(-1)[2], Number.MAX_VALUE);
  }
});

test("API trend aligns by date and retains future estimates with inclusive projected totals", () => {
  const original = structuredClone(payload);
  assert.deepEqual(parseApiTrend(payload, history), [
    ...history,
    ["02-03-2024", 8, 30],
    ["03-03-2024", 10, 40],
  ]);
  assert.deepEqual(payload, original);
});

test("API trend clamps negative predictions and ignores dates preceding chart history", () => {
  const result = parseApiTrend({ forecast_trend: [
    { ds: "2024-02-27", trend: 100 },
    ...payload.forecast_trend.map(entry => ({ ...entry, trend: -3 })),
  ] }, history);
  assert.equal(result.length, 5);
  assert.ok(result.every(point => point[1] === 0));
  assert.equal(result.at(-1)[2], 22);
});

test("successful API needs forecast_trend only and escapes the repository parameter", async () => {
  let request;
  const result = await loadTrend("owner/repo", history, {
    ...options,
    fetcher: async (url, init) => {
      request = { url, init };
      return response(payload);
    },
  });
  assert.equal(result.source, "api");
  assert.equal(result.data.length, 5);
  assert.equal(request.url, "https://trend.example/predict?repo=owner%2Frepo");
  assert.ok(request.init.signal instanceof AbortSignal);
});

test("network, HTTP, invalid JSON and empty HTTP bodies all fall back locally", async () => {
  const fetchers = [
    async () => { throw new TypeError("Failed to fetch"); },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: false, status: 429 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError("Unexpected token"); } }),
    async () => response(null),
  ];
  for (const fetcher of fetchers) {
    assert.deepEqual(await loadTrend("owner/repo", history, { ...options, fetcher }), {
      data: calculateLocalTrend(history), source: "local",
    });
  }
});

test("malformed, partial, unrelated, duplicate or non-finite API series fall back locally", async () => {
  const entries = payload.forecast_trend;
  const invalidPayloads = [
    {}, [], "error", { forecast_trend: [] }, { forecast_trend: {} },
    { forecast_trend: [null] },
    { forecast_trend: entries.slice(1).filter(entry => entry.ds !== "2024-03-01") },
    { forecast_trend: [{ ds: "2026-01-01", trend: 5 }] },
    { forecast_trend: [...entries, entries[0]] },
    { forecast_trend: entries.map(entry => ({ ...entry, ds: "2024-02-31" })) },
    ...[null, "5", NaN, Infinity].map(trend => ({
      forecast_trend: entries.map(entry => ({ ...entry, trend })),
    })),
  ];
  for (const invalid of invalidPayloads) {
    const result = await loadTrend("owner/repo", history, { ...options, fetcher: async () => response(invalid) });
    assert.equal(result.source, "local");
    assert.ok(result.data.every(point => point.slice(1).every(value => Number.isFinite(value) && value >= 0)));
  }
});

test("a stalled fetch times out even if it ignores abort", async () => {
  let apiSignal;
  const result = await loadTrend("owner/repo", history, {
    ...options,
    timeoutMs: 10,
    fetcher: (_url, init) => {
      apiSignal = init.signal;
      return new Promise(() => {});
    },
  });
  assert.equal(result.source, "local");
  assert.ok(apiSignal.aborted);
});

test("a stalled response body also times out", async () => {
  const result = await loadTrend("owner/repo", history, {
    ...options,
    timeoutMs: 10,
    fetcher: async () => ({ ok: true, json: () => new Promise(() => {}) }),
  });
  assert.equal(result.source, "local");
});

test("cancelled repository requests reject instead of returning a stale local trend", async () => {
  const controller = new AbortController();
  const pending = loadTrend("owner/repo", history, {
    ...options,
    signal: controller.signal,
    fetcher: () => new Promise(() => {}),
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("a signal cancelled before loading never calls the API", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadTrend("owner/repo", history, {
    ...options,
    signal: controller.signal,
    fetcher: async () => { assert.fail("API should not run"); },
  }), { name: "AbortError" });
});
