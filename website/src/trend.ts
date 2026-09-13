export type StarPoint = [date: string, daily: number, cumulative: number];

export type TrendResult = {
  data: StarPoint[];
  source: "api" | "local";
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const TREND_TIMEOUT_MS = 5000;

function dateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  const display = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(value);
  if (!iso && !display) return null;
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(display![3]), Number(display![2]), Number(display![1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function displayDate(key: string): string {
  const [year, month, day] = key.split("-");
  return `${day}-${month}-${year}`;
}

function normalizeHistory(history: readonly StarPoint[]): StarPoint[] {
  const byDate = new Map<string, StarPoint>();
  for (const point of history) {
    const key = dateKey(point[0]);
    if (!key) continue;
    const daily = Number.isFinite(point[1]) ? Math.max(0, point[1]) : 0;
    byDate.set(key, [displayDate(key), daily, point[2]]);
  }
  let cumulative = 0;
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, point]) => {
    cumulative = Number.isFinite(point[2]) && point[2] >= 0
      ? point[2]
      : Math.min(Number.MAX_VALUE, cumulative + point[1]);
    return [point[0], point[1], cumulative];
  });
}

/** Smooth observed daily stars over the surrounding seven calendar days; never extrapolate. */
export function calculateLocalTrend(history: readonly StarPoint[]): StarPoint[] {
  const points = normalizeHistory(history);
  const times = points.map(([date]) => Date.parse(dateKey(date)!));
  let start = 0;
  let end = 0;
  return points.map(([date, , cumulative], index) => {
    while (times[start] < times[index] - 3 * DAY_MS) start += 1;
    while (end < points.length && times[end] <= times[index] + 3 * DAY_MS) end += 1;
    let mean = 0;
    // Incremental mean avoids overflow even for unusually large valid counts.
    for (let i = start; i < end; i += 1) mean += (points[i][1] - mean) / (i - start + 1);
    return [date, mean, cumulative];
  });
}

/** Align observed totals by date, then integrate future API trend values as projected totals. */
export function parseApiTrend(payload: unknown, history: readonly StarPoint[]): StarPoint[] | null {
  if (!payload || typeof payload !== "object" || !("forecast_trend" in payload)) return null;
  const entries = payload.forecast_trend;
  const points = normalizeHistory(history);
  if (!Array.isArray(entries) || !entries.length || !points.length) return null;
  const observed = new Map(points.map(point => [dateKey(point[0])!, point]));
  const firstDate = dateKey(points[0][0])!;
  const lastDate = dateKey(points[points.length - 1][0])!;
  const trends = new Map<string, number>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") return null;
    const key = dateKey(entry.ds);
    if (!key || typeof entry.trend !== "number" || !Number.isFinite(entry.trend) || trends.has(key)) return null;
    trends.set(key, Math.max(0, entry.trend));
  }
  // Partial or unrelated predictions cannot replace the repository's observed timeline.
  if (points.some(point => !trends.has(dateKey(point[0])!))) return null;
  let cumulative = points[points.length - 1][2];
  const result: StarPoint[] = [];
  for (const [key, daily] of [...trends.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (key < firstDate) continue;
    const actual = observed.get(key);
    if (key <= lastDate) {
      if (actual) result.push([actual[0], daily, actual[2]]);
    } else {
      cumulative += daily;
      if (!Number.isFinite(cumulative)) return null;
      result.push([displayDate(key), daily, cumulative]);
    }
  }
  return result;
}

type TrendOptions = {
  endpoint: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

/** Every API failure falls back locally; explicit cancellation stays cancelled. */
export async function loadTrend(
  repo: string,
  history: readonly StarPoint[],
  { endpoint, signal, timeoutMs = TREND_TIMEOUT_MS, fetcher = fetch }: TrendOptions,
): Promise<TrendResult> {
  if (signal?.aborted) throw signal.reason;
  const local = (): TrendResult => ({ data: calculateLocalTrend(history), source: "local" });
  if (!history.length) return local();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort(signal?.reason);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Trend request timed out"));
    }, timeoutMs);
  });
  try {
    // Race the complete request, including the body, in case either one stalls.
    const request = Promise.resolve().then(async () => {
      const response = await fetcher(`${endpoint}/predict?repo=${encodeURIComponent(repo)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Trend request failed (${response.status})`);
      const data = parseApiTrend(await response.json(), history);
      if (!data) throw new Error("Trend response is incomplete or invalid");
      return { data, source: "api" } as TrendResult;
    });
    return await Promise.race([request, interrupted]);
  } catch (error) {
    if (signal?.aborted) throw error;
    return local();
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}
