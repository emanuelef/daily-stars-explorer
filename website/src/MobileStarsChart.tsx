import { useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import './MobileStarsChart.css';

type ChartRange = '30d' | '90d' | 'all';

interface StarDay {
  date: string;
  daily: number;
  total: number;
}

interface MobileStarsChartProps {
  history: StarDay[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  theme?: 'dark' | 'light';
}

interface Bucket {
  start: number;
  end: number;
  stars: number;
}

const DAY = 24 * 60 * 60 * 1000;
const numberFormat = new Intl.NumberFormat('en-US');
const compactFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const formatSpan = (bucket: Bucket) => bucket.start === bucket.end
  ? dateFormat.format(bucket.start)
  : `${new Date(bucket.start).getUTCFullYear() === new Date(bucket.end).getUTCFullYear()
    ? shortDateFormat.format(bucket.start) : dateFormat.format(bucket.start)} – ${dateFormat.format(bucket.end)}`;

function prepareChart(history: StarDay[], range: ChartRange) {
  const days = history.map(day => {
    const [date, month, year] = day.date.split('-').map(Number);
    const timestamp = Date.UTC(year, month - 1, date);
    const parsed = new Date(timestamp);
    const valid = parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date;
    return {
      timestamp: valid ? timestamp : NaN,
      stars: Number.isFinite(day.daily) ? Math.max(0, day.daily) : 0,
    };
  }).filter(day => Number.isFinite(day.timestamp)).sort((a, b) => a.timestamp - b.timestamp);

  const last = days[days.length - 1]?.timestamp;
  const cutoff = last === undefined || range === 'all'
    ? -Infinity : last - ((range === '30d' ? 30 : 90) - 1) * DAY;
  const visibleDays = days.filter(day => day.timestamp >= cutoff);
  if (!visibleDays.length) return null;

  const start = visibleDays[0].timestamp;
  const end = visibleDays[visibleDays.length - 1].timestamp;
  const spanDays = Math.round((end - start) / DAY) + 1;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const firstMonth = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();
  const monthCount = endDate.getUTCFullYear() * 12 + endDate.getUTCMonth() - firstMonth + 1;
  const monthsPerBucket = Math.ceil(monthCount / 60);
  const mode = spanDays <= 60 ? 'daily' : spanDays <= 420 ? 'weekly' : 'monthly';
  const bucketCount = mode === 'monthly'
    ? Math.ceil(monthCount / monthsPerBucket) : Math.ceil(spanDays / (mode === 'weekly' ? 7 : 1));

  const buckets: Bucket[] = Array.from({ length: bucketCount }, (_, index) => {
    if (mode === 'monthly') {
      const month = firstMonth + index * monthsPerBucket;
      return {
        start: Math.max(start, Date.UTC(Math.floor(month / 12), month % 12, 1)),
        end: Math.min(end, Date.UTC(Math.floor(month / 12), month % 12 + monthsPerBucket, 1) - DAY),
        stars: 0,
      };
    }
    const daysPerBucket = mode === 'weekly' ? 7 : 1;
    const bucketStart = start + index * daysPerBucket * DAY;
    return { start: bucketStart, end: Math.min(end, bucketStart + (daysPerBucket - 1) * DAY), stars: 0 };
  });

  let total = 0;
  let peak = visibleDays[0];
  visibleDays.forEach(day => {
    const dayDate = new Date(day.timestamp);
    const index = mode === 'monthly'
      ? Math.floor((dayDate.getUTCFullYear() * 12 + dayDate.getUTCMonth() - firstMonth) / monthsPerBucket)
      : Math.floor((day.timestamp - start) / DAY / (mode === 'weekly' ? 7 : 1));
    buckets[index].stars += day.stars;
    total += day.stars;
    if (day.stars > peak.stars) peak = day;
  });

  const maximum = Math.max(...buckets.map(bucket => bucket.stars), 1);
  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const scale = Math.ceil(maximum / magnitude) * magnitude;
  const unit = mode === 'daily' ? 'Daily stars'
    : mode === 'weekly' ? '7-day totals'
      : monthsPerBucket === 1 ? 'Monthly totals' : `${monthsPerBucket}-month totals`;

  return { buckets, start, end, total, peak, scale, unit, aggregated: mode !== 'daily' };
}

export default function MobileStarsChart({ history, range, onRangeChange, theme = 'dark' }: MobileStarsChartProps) {
  const id = useId();
  const chart = useMemo(() => prepareChart(history, range), [history, range]);
  const [selection, setSelection] = useState<{ range: ChartRange; start: number } | null>(null);
  const activePointer = useRef<number | null>(null);

  const selectedIndex = chart && selection?.range === range
    ? chart.buckets.findIndex(bucket => bucket.start === selection.start) : -1;
  const index = selectedIndex >= 0 ? selectedIndex : (chart?.buckets.length ?? 1) - 1;
  const selected = chart?.buckets[index];

  const selectBucket = (nextIndex: number) => {
    if (chart) setSelection({ range, start: chart.buckets[nextIndex].start });
  };

  const selectFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!chart) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const position = (event.clientX - bounds.left) / bounds.width;
    selectBucket(Math.max(0, Math.min(chart.buckets.length - 1, Math.floor(position * chart.buckets.length))));
  };

  return (
    <section className="mobile-stars-chart" data-theme={theme} aria-labelledby={`${id}-title`}>
      <div className="mobile-stars-chart__heading">
        <h2 id={`${id}-title`}>Star history</h2>
        <span>{chart?.unit ?? 'Daily stars'}</span>
      </div>
      <div className="mobile-stars-chart__ranges" role="group" aria-label="Star history period">
        {([['30d', '30 days'], ['90d', '90 days'], ['all', 'All time']] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={range === value} onClick={() => onRangeChange(value)}>
            {label}
          </button>
        ))}
      </div>

      {chart && selected ? (
        <>
          <div className="mobile-stars-chart__readout" id={`${id}-selection`}>
            <span>{formatSpan(selected)}</span>
            <strong>{numberFormat.format(selected.stars)} <small>stars{chart.aggregated ? ' total' : ''}</small></strong>
          </div>

          <div className="mobile-stars-chart__plot" aria-hidden="true">
            <div className="mobile-stars-chart__axis">
              <span>{compactFormat.format(chart.scale)}</span>
              <span>{compactFormat.format(chart.scale / 2)}</span>
              <span>0</span>
            </div>
            <svg
              viewBox="0 0 600 180"
              preserveAspectRatio="none"
              onPointerDown={event => {
                activePointer.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                selectFromPointer(event);
              }}
              onPointerMove={event => {
                if (activePointer.current === event.pointerId) selectFromPointer(event);
              }}
              onPointerUp={() => { activePointer.current = null; }}
              onPointerCancel={() => { activePointer.current = null; }}
              onLostPointerCapture={() => { activePointer.current = null; }}
            >
              {[0, 90, 180].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} className="mobile-stars-chart__grid" />)}
              {chart.buckets.map((bucket, bucketIndex) => {
                const step = 600 / chart.buckets.length;
                const height = bucket.stars / chart.scale * 180;
                const width = Math.min(step * 0.76, 42);
                return (
                  <g key={bucket.start}>
                    {bucketIndex === index && <rect x={bucketIndex * step} y="0" width={step} height="180" className="mobile-stars-chart__highlight" />}
                    <rect
                      x={bucketIndex * step + (step - width) / 2}
                      y={180 - height}
                      width={width}
                      height={height}
                      rx="1.5"
                      className={bucketIndex === index ? 'mobile-stars-chart__bar is-selected' : 'mobile-stars-chart__bar'}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mobile-stars-chart__dates">
            <span>{dateFormat.format(chart.start)}</span>
            <span>{dateFormat.format(chart.end)}</span>
          </div>
          <div className="mobile-stars-chart__explore">
            <label htmlFor={`${id}-slider`}>Explore {chart.aggregated ? 'intervals' : 'days'}</label>
            <span>Tap the chart or move the slider</span>
          </div>
          <input
            id={`${id}-slider`}
            className="mobile-stars-chart__slider"
            type="range"
            min={0}
            max={Math.max(1, chart.buckets.length - 1)}
            step={1}
            value={index}
            disabled={chart.buckets.length === 1}
            aria-valuetext={`${formatSpan(selected)}: ${numberFormat.format(selected.stars)} stars`}
            onChange={event => selectBucket(Number(event.target.value))}
          />
          <div className="mobile-stars-chart__summary">
            <div>
              <span>Stars in this period</span>
              <strong>{numberFormat.format(chart.total)}</strong>
            </div>
            <div>
              <span>Best day in period</span>
              <strong>{numberFormat.format(chart.peak.stars)} <small>stars</small></strong>
              <span>{dateFormat.format(chart.peak.timestamp)}</span>
            </div>
          </div>
          <p className="mobile-stars-chart__note">
            {chart.aggregated
              ? `Each bar sums stars for its date interval. ${chart.unit}; the first or last interval may be partial.`
              : 'Each bar shows stars received on that day.'}
          </p>
        </>
      ) : <p className="mobile-stars-chart__empty">No star history is available yet.</p>}
    </section>
  );
}
