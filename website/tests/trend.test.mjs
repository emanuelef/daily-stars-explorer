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

test("local trend uses seven calendar days and preserves actual cumulative totals", () => {
  const input = Array.from({ length: 9 }, (_, index) => [
    `${String(index + 1).padStart(2, "0")}-01-2026`, index + 1, 100 + index,
  ]);
  const result = calculateLocalTrend(input);
  assert.deepEqual(result.map(point => point[1]), [2.5, 3, 3.5, 4, 5, 6, 6.5, 7, 7.5]);
  assert.deepEqual(result.map(point => [point[0], point[2]]), input.map(point => [point[0], point[2]]));
  assert.equal(input[0][1], 1);
});

test("local trend handles empty, single-day, short, constant and zero histories", () => {
  assert.deepEqual(calculateLocalTrend([]), []);
  assert.deepEqual(calculateLocalTrend([["1-3-2024", 3, 9]]), [["01-03-2024", 3, 9]]);
  assert.deepEqual(calculateLocalTrend(history).map(point => point[1]), [4, 4, 4]);
  for (const value of [0, 5, Number.MAX_VALUE]) {
    const result = calculateLocalTrend(history.map(([date, , total]) => [date, value, total]));
    assert.ok(result.every(point => point[1] === value && Number.isFinite(point[1])));
  }
});

test("local smoothing respects date gaps and sanitizes unusable observations", () => {
  assert.deepEqual(calculateLocalTrend([
    ["08-03-2024", 8, 8],
    ["31-02-2024", 100, 100],
    ["01-03-2024", -1, NaN],
    ["02-03-2024", Infinity, NaN],
  ]), [
    ["01-03-2024", 0, 0],
    ["02-03-2024", 0, 0],
    ["08-03-2024", 8, 8],
  ]);
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
