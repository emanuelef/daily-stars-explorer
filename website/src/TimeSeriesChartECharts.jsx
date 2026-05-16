import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { useAppTheme } from "./ThemeContext";
import { useLastRepo } from "./RepoContext";
import { parseGitHubRepoURL } from "./githubUtils";

const HOST = import.meta.env.VITE_HOST;

const parseDDMMYYYY = (s) => {
  const [d, m, y] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

export default function TimeSeriesChartECharts() {
  const { user, repository } = useParams();
  const navigate = useNavigate();
  const { theme } = useAppTheme();
  const { lastRepo, setLastRepo } = useLastRepo();

  const initialRepo = user && repository ? `${user}/${repository}` : lastRepo;
  const [repoInput, setRepoInput] = useState(initialRepo);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const lastSmoothRef = useRef(null);

  const SMOOTH_THRESHOLD = 300;

  useEffect(() => {
    if (!user || !repository) return;
    const repo = `${user}/${repository}`;
    setRepoInput(repo);
    setLastRepo(repo);
    setLoading(true);
    setError(null);
    fetch(`${HOST}/allStars?repo=${repo}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((payload) => {
        const stars = Array.isArray(payload) ? payload : payload.stars;
        if (!stars) throw new Error("No star data");
        setData({
          stars,
          maxPeaks: payload.maxPeaks ?? [],
          maxPeriods: payload.maxPeriods ?? [],
        });
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [user, repository, setLastRepo]);

  const onSubmit = () => {
    const parsed = parseGitHubRepoURL(repoInput) || repoInput;
    if (parsed && parsed.includes("/")) navigate(`/echarts/${parsed}`);
  };

  const isDark = theme === "dark";

  const option = useMemo(() => {
    if (!data) return null;
    const dailyData = data.stars.map((d) => [parseDDMMYYYY(d[0]), d[1]]);
    const totalData = data.stars.map((d) => [parseDDMMYYYY(d[0]), d[2]]);

    const peakMarkers = (data.maxPeaks ?? []).map((p) => ({
      name: `Best day: ${p.Stars.toLocaleString()} ⭐`,
      coord: [parseDDMMYYYY(p.Day), p.Stars],
      value: p.Stars.toLocaleString(),
    }));

    const periodMarkAreas = (data.maxPeriods ?? []).map((p) => [
      {
        name: `Best 10d: ${p.TotalStars.toLocaleString()} ⭐`,
        xAxis: parseDDMMYYYY(p.StartDay),
        itemStyle: { color: "rgba(139, 92, 246, 0.18)" },
        label: {
          show: true,
          position: "top",
          color: "#a78bfa",
          fontSize: 11,
          fontWeight: 600,
        },
      },
      { xAxis: parseDDMMYYYY(p.EndDay) },
    ]);

    const textColor = isDark ? "#e5e7eb" : "#1e293b";
    const mutedText = isDark ? "#94a3b8" : "#64748b";
    const axisColor = isDark ? "#374151" : "#cbd5e1";
    const splitColor = isDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.25)";
    const dailyColor = "#3b82f6";
    const totalColor = "#10b981";

    return {
      backgroundColor: "transparent",
      animation: false,
      title: [
        { text: "Daily Stars", left: 60, top: 10, textStyle: { color: textColor, fontSize: 13, fontWeight: 600 } },
        { text: "Total Stars", left: 60, top: "52%", textStyle: { color: textColor, fontSize: 13, fontWeight: 600 } },
      ],
      toolbox: {
        right: 20,
        top: 6,
        iconStyle: { borderColor: mutedText },
        emphasis: { iconStyle: { borderColor: dailyColor } },
        feature: {
          dataZoom: {
            yAxisIndex: "none",
            title: { zoom: "Drag area to zoom", back: "Undo zoom" },
            brushStyle: {
              color: "rgba(59,130,246,0.15)",
              borderColor: dailyColor,
            },
          },
          restore: { title: "Reset" },
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", lineStyle: { color: dailyColor } },
        backgroundColor: isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.95)",
        borderColor: isDark ? "#334155" : "#cbd5e1",
        textStyle: { color: textColor },
        valueFormatter: (v) => (typeof v === "number" ? v.toLocaleString() : v),
      },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: [
        { left: 60, right: 60, top: 40, height: "38%" },
        { left: 60, right: 60, top: "57%", height: "28%" },
      ],
      xAxis: [
        {
          type: "time",
          gridIndex: 0,
          axisLine: { lineStyle: { color: axisColor } },
          axisLabel: { show: false },
          splitLine: { show: false },
        },
        {
          type: "time",
          gridIndex: 1,
          axisLine: { lineStyle: { color: axisColor } },
          axisLabel: { color: mutedText, hideOverlap: true },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          type: "value",
          gridIndex: 0,
          axisLine: { show: false },
          axisLabel: { color: mutedText, formatter: (v) => v.toLocaleString() },
          splitLine: { lineStyle: { color: splitColor } },
        },
        {
          type: "value",
          gridIndex: 1,
          axisLine: { show: false },
          axisLabel: { color: mutedText, formatter: (v) => v.toLocaleString() },
          splitLine: { lineStyle: { color: splitColor } },
        },
      ],
      dataZoom: [
        {
          type: "slider",
          xAxisIndex: [0, 1],
          height: 48,
          bottom: 14,
          borderColor: axisColor,
          backgroundColor: isDark ? "rgba(15,23,42,0.4)" : "rgba(241,245,249,0.6)",
          fillerColor: isDark ? "rgba(59,130,246,0.16)" : "rgba(59,130,246,0.1)",
          dataBackground: {
            lineStyle: { color: dailyColor, opacity: 0.5 },
            areaStyle: { color: dailyColor, opacity: 0.2 },
          },
          selectedDataBackground: {
            lineStyle: { color: dailyColor },
            areaStyle: { color: dailyColor, opacity: 0.4 },
          },
          handleStyle: { color: dailyColor },
          moveHandleStyle: { color: dailyColor },
          textStyle: { color: mutedText },
        },
        { type: "inside", xAxisIndex: [0, 1] },
      ],
      series: [
        {
          name: "Daily Stars",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          showSymbol: false,
          smooth: 0.4,
          sampling: "average",
          data: dailyData,
          itemStyle: { color: dailyColor },
          lineStyle: { width: 1.5, color: dailyColor },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(59,130,246,0.45)" },
                { offset: 1, color: "rgba(59,130,246,0.02)" },
              ],
            },
          },
          markPoint: peakMarkers.length
            ? {
                data: peakMarkers,
                symbol: "pin",
                symbolSize: 44,
                itemStyle: { color: totalColor },
                label: { color: "#fff", fontSize: 10, fontWeight: 600 },
              }
            : undefined,
          markArea: periodMarkAreas.length
            ? { silent: true, data: periodMarkAreas }
            : undefined,
        },
        {
          name: "Total Stars",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          smooth: true,
          sampling: "lttb",
          data: totalData,
          itemStyle: { color: totalColor },
          lineStyle: { width: 2, color: totalColor },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(16,185,129,0.35)" },
                { offset: 1, color: "rgba(16,185,129,0.02)" },
              ],
            },
          },
        },
      ],
    };
  }, [data, isDark]);

  return (
    <div
      style={{
        padding: 16,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          size="small"
          label="Repo (user/repo or GitHub URL)"
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          sx={{ minWidth: 320 }}
        />
        <Button variant="contained" onClick={onSubmit} disabled={loading}>
          {loading ? <CircularProgress size={18} color="inherit" /> : "Load"}
        </Button>
        <span style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: 13 }}>
          ECharts prototype — dataZoom slider shows the peaks navigator
        </span>
      </div>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <div style={{ flex: 1, minHeight: 400 }}>
        {option && (
          <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: "100%", width: "100%" }}
            notMerge={true}
            theme={isDark ? "dark" : undefined}
            onChartReady={(chart) => {
              chart.dispatchAction({
                type: "takeGlobalCursor",
                key: "dataZoomSelect",
                dataZoomSelectActive: true,
              });
              chart.on("restore", () => {
                chart.dispatchAction({
                  type: "takeGlobalCursor",
                  key: "dataZoomSelect",
                  dataZoomSelectActive: true,
                });
              });
            }}
            onEvents={{
              dataZoom: () => {
                const chart = chartRef.current?.getEchartsInstance();
                if (!chart || !data) return;
                const opt = chart.getOption();
                const dz = opt.dataZoom?.[0];
                const start = dz?.start ?? 0;
                const end = dz?.end ?? 100;
                const visible = ((end - start) / 100) * data.stars.length;
                const wantSmooth = visible > SMOOTH_THRESHOLD ? 0.4 : false;
                if (lastSmoothRef.current === wantSmooth) return;
                lastSmoothRef.current = wantSmooth;
                chart.setOption({
                  series: [{ smooth: wantSmooth }],
                });
              },
            }}
          />
        )}
      </div>
    </div>
  );
}
