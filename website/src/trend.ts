export type StarPoint = [date: string, daily: number, cumulative: number];

export type TrendResult = {
  data: StarPoint[];
  source: "api" | "local";
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const TREND_TIMEOUT_MS = 5000;
export const LOCAL_FORECAST_DAYS = 30;

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

type TrendSample = { time: number; value: number; count: number };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

/** Pivoted elimination; the trend has at most 13 coefficients. */
function solveTrendSystem(matrix: number[][], rhs: number[]): number[] | null {
  const rows = matrix.map((row, index) => [...row, rhs[index]]);
  const size = rows.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-14) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = column + 1; row < size; row += 1) {
      const factor = rows[row][column] / rows[column][column];
      for (let j = column; j <= size; j += 1) rows[row][j] -= factor * rows[column][j];
    }
  }
  const solution = Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = rows[row][size];
    for (let j = row + 1; j < size; j += 1) value -= rows[row][j] * solution[j];
    solution[row] = value / rows[row][row];
  }
  return solution.every(Number.isFinite) ? solution : null;
}

/**
 * Fit a continuous piecewise-linear rate model, with a penalty on slope changes
 * and Huber residual weights. Weekly observations reduce weekday noise without
 * treating missing dates as zero. This is a local regression model, not Prophet.
 */
function fitLocalTrend(points: StarPoint[], days: number[]): (day: number) => number {
  const firstDay = days[0];
  const span = days[days.length - 1] - firstDay;
  if (points.every(point => point[1] === points[0][1])) return () => points[0][1];

  const weeks = new Map<number, TrendSample>();
  points.forEach((point, index) => {
    // Keep enough independent observations for robust fitting on short histories.
    const key = span < 42 ? days[index] : Math.floor((days[index] + 3) / 7);
    const sample = weeks.get(key) || { time: 0, value: 0, count: 0 };
    sample.count += 1;
    sample.time += (days[index] - firstDay - sample.time) / sample.count;
    sample.value += (point[1] - sample.value) / sample.count;
    weeks.set(key, sample);
  });
  const samples = [...weeks.values()];
  const scale = Math.max(...samples.map(sample => sample.value));
  if (!scale) return () => 0;
  const segments = Math.max(1, Math.min(12, Math.floor(span / 60), Math.floor(samples.length / 6)));
  const knotCount = segments + 1;
  const basis = (time: number): [number, number] => {
    const position = time / span * segments;
    const left = Math.max(0, Math.min(segments - 1, Math.floor(position)));
    return [left, position - left];
  };
  const rows = samples.map(sample => basis(sample.time));
  const values = samples.map(sample => sample.value / scale);
  const baseWeights = samples.map(sample => sample.count / 7);
  const penalty = 0.1 * baseWeights.reduce((sum, weight) => sum + weight, 0) / knotCount;
  // A count-noise floor keeps legitimate sparse activity from becoming an outlier
  // simply because most days/weeks contain zero stars.
  const exposure = median(samples.map(sample => sample.count));
  const noiseFloor = Math.sqrt(Math.max(median(samples.map(sample => sample.value)), 1 / exposure) / exposure) / scale;
  let weights = [...baseWeights];
  let levels = Array<number>(knotCount).fill(median(values));
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const matrix = Array.from({ length: knotCount }, () => Array<number>(knotCount).fill(0));
    const rhs = Array<number>(knotCount).fill(0);
    rows.forEach(([left, fraction], index) => {
      const coefficients = [1 - fraction, fraction];
      for (let a = 0; a < 2; a += 1) {
        rhs[left + a] += weights[index] * coefficients[a] * values[index];
        for (let b = 0; b < 2; b += 1) {
          matrix[left + a][left + b] += weights[index] * coefficients[a] * coefficients[b];
        }
      }
    });
    // Second differences penalize bends, leaving a constant/global linear trend unpenalized.
    for (let knot = 0; knot < knotCount - 2; knot += 1) {
      const coefficients = [1, -2, 1];
      for (let a = 0; a < 3; a += 1) {
        for (let b = 0; b < 3; b += 1) {
          matrix[knot + a][knot + b] += penalty * coefficients[a] * coefficients[b];
        }
      }
    }
    const fitted = solveTrendSystem(matrix, rhs);
    if (!fitted) break;
    levels = fitted;
    const residuals = rows.map(([left, fraction], index) =>
      Math.abs(values[index] - levels[left] * (1 - fraction) - levels[left + 1] * fraction));
    const threshold = 1.345 * Math.max(1.4826 * median(residuals), noiseFloor);
    weights = residuals.map((residual, index) => baseWeights[index]
      * (residual > threshold ? threshold / residual : 1));
  }
  return day => {
    const [left, fraction] = basis(day - firstDay);
    const rate = (levels[left] * (1 - fraction) + levels[left + 1] * fraction) * scale;
    return Math.max(0, Math.min(Number.MAX_VALUE, rate));
  };
}

/** Preserve observed totals; append 30 daily estimates using the fitted terminal slope. */
export function calculateLocalTrend(history: readonly StarPoint[]): StarPoint[] {
  const points = normalizeHistory(history);
  if (!points.length) return [];
  const days = points.map(([date]) => Date.parse(dateKey(date)!) / DAY_MS);
  const estimate = fitLocalTrend(points, days);
  const result: StarPoint[] = points.map(([date, , cumulative], index) => [date, estimate(days[index]), cumulative]);
  const lastDay = days[days.length - 1];
  const supportedSlope = days.filter(day => day > lastDay - 14).length >= 7;
  let cumulative = points[points.length - 1][2];
  for (let ahead = 1; ahead <= LOCAL_FORECAST_DAYS; ahead += 1) {
    const daily = estimate(supportedSlope ? lastDay + ahead : lastDay);
    cumulative = Math.min(Number.MAX_VALUE, cumulative + daily);
    const date = displayDate(new Date((lastDay + ahead) * DAY_MS).toISOString().slice(0, 10));
    result.push([date, daily, cumulative]);
  }
  return result;
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
