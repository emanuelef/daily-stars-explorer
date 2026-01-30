import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import Tooltip from "@mui/material/Tooltip";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Plot from "react-plotly.js";
import { parseGitHubRepoURL } from "./githubUtils";
import { formatNumber } from "./utils";

const HOST = import.meta.env.VITE_HOST;

const INFO_TOOLTIP =
  "Shows completed hourly data. Click 'Fetch' to retrieve real-time updates including the current hour. You can zoom and pan the chart.";

const browserTimeZone =
  (typeof Intl !== "undefined" &&
    Intl.DateTimeFormat().resolvedOptions().timeZone) ||
  "UTC";

// Comprehensive timezone list grouped by region
const TIMEZONES = [
  // Americas
  { city: 'Honolulu', offset: 'UTC-10:00', value: 'Pacific/Honolulu', region: 'Americas' },
  { city: 'Anchorage', offset: 'UTC-09:00', value: 'America/Anchorage', region: 'Americas' },
  { city: 'Los Angeles', offset: 'UTC-08:00', value: 'America/Los_Angeles', region: 'Americas' },
  { city: 'Denver', offset: 'UTC-07:00', value: 'America/Denver', region: 'Americas' },
  { city: 'Mexico City', offset: 'UTC-06:00', value: 'America/Mexico_City', region: 'Americas' },
  { city: 'Chicago', offset: 'UTC-06:00', value: 'America/Chicago', region: 'Americas' },
  { city: 'New York', offset: 'UTC-05:00', value: 'America/New_York', region: 'Americas' },
  { city: 'Toronto', offset: 'UTC-05:00', value: 'America/Toronto', region: 'Americas' },
  { city: 'Caracas', offset: 'UTC-04:00', value: 'America/Caracas', region: 'Americas' },
  { city: 'Santiago', offset: 'UTC-03:00', value: 'America/Santiago', region: 'Americas' },
  { city: 'São Paulo', offset: 'UTC-03:00', value: 'America/Sao_Paulo', region: 'Americas' },
  { city: 'Buenos Aires', offset: 'UTC-03:00', value: 'America/Argentina/Buenos_Aires', region: 'Americas' },
  
  // Europe & Africa
  { city: 'London', offset: 'UTC+00:00', value: 'Europe/London', region: 'Europe' },
  { city: 'Dublin', offset: 'UTC+00:00', value: 'Europe/Dublin', region: 'Europe' },
  { city: 'Lisbon', offset: 'UTC+00:00', value: 'Europe/Lisbon', region: 'Europe' },
  { city: 'Paris', offset: 'UTC+01:00', value: 'Europe/Paris', region: 'Europe' },
  { city: 'Berlin', offset: 'UTC+01:00', value: 'Europe/Berlin', region: 'Europe' },
  { city: 'Rome', offset: 'UTC+01:00', value: 'Europe/Rome', region: 'Europe' },
  { city: 'Madrid', offset: 'UTC+01:00', value: 'Europe/Madrid', region: 'Europe' },
  { city: 'Amsterdam', offset: 'UTC+01:00', value: 'Europe/Amsterdam', region: 'Europe' },
  { city: 'Stockholm', offset: 'UTC+01:00', value: 'Europe/Stockholm', region: 'Europe' },
  { city: 'Cairo', offset: 'UTC+02:00', value: 'Africa/Cairo', region: 'Africa' },
  { city: 'Athens', offset: 'UTC+02:00', value: 'Europe/Athens', region: 'Europe' },
  { city: 'Helsinki', offset: 'UTC+02:00', value: 'Europe/Helsinki', region: 'Europe' },
  { city: 'Istanbul', offset: 'UTC+03:00', value: 'Europe/Istanbul', region: 'Europe' },
  { city: 'Moscow', offset: 'UTC+03:00', value: 'Europe/Moscow', region: 'Europe' },
  { city: 'Nairobi', offset: 'UTC+03:00', value: 'Africa/Nairobi', region: 'Africa' },
  { city: 'Dubai', offset: 'UTC+04:00', value: 'Asia/Dubai', region: 'Middle East' },
  
  // Asia & Pacific
  { city: 'Karachi', offset: 'UTC+05:00', value: 'Asia/Karachi', region: 'Asia' },
  { city: 'Kolkata', offset: 'UTC+05:30', value: 'Asia/Kolkata', region: 'Asia' },
  { city: 'Mumbai', offset: 'UTC+05:30', value: 'Asia/Kolkata', region: 'Asia' },
  { city: 'Dhaka', offset: 'UTC+06:00', value: 'Asia/Dhaka', region: 'Asia' },
  { city: 'Bangkok', offset: 'UTC+07:00', value: 'Asia/Bangkok', region: 'Asia' },
  { city: 'Singapore', offset: 'UTC+08:00', value: 'Asia/Singapore', region: 'Asia' },
  { city: 'Hong Kong', offset: 'UTC+08:00', value: 'Asia/Hong_Kong', region: 'Asia' },
  { city: 'Beijing', offset: 'UTC+08:00', value: 'Asia/Shanghai', region: 'Asia' },
  { city: 'Manila', offset: 'UTC+08:00', value: 'Asia/Manila', region: 'Asia' },
  { city: 'Tokyo', offset: 'UTC+09:00', value: 'Asia/Tokyo', region: 'Asia' },
  { city: 'Seoul', offset: 'UTC+09:00', value: 'Asia/Seoul', region: 'Asia' },
  { city: 'Sydney', offset: 'UTC+11:00', value: 'Australia/Sydney', region: 'Pacific' },
  { city: 'Melbourne', offset: 'UTC+11:00', value: 'Australia/Melbourne', region: 'Pacific' },
  { city: 'Auckland', offset: 'UTC+13:00', value: 'Pacific/Auckland', region: 'Pacific' },
  
  // UTC
  { city: 'UTC', offset: 'UTC+00:00', value: 'UTC', region: 'UTC' },
];

const detectUserTimezone = () => {
  const userTz = browserTimeZone;
  return TIMEZONES.find(t => t.value === userTz) || TIMEZONES.find(t => t.value === 'UTC');
};

// Stat Card Component for clean visual hierarchy
const StatCard = ({ icon, label, value, color = "#3b82f6" }) => (
  <div style={{
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
    border: `1px solid ${color}33`,
    borderRadius: '12px',
    padding: '12px 16px',
    minWidth: '160px',
    backdropFilter: 'blur(10px)',
  }}>
    <div style={{
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: '#9ca3af',
      marginBottom: '4px',
      fontWeight: '500',
    }}>
      {icon} {label}
    </div>
    <div style={{
      fontSize: '18px',
      fontWeight: '700',
      color: '#fff',
      lineHeight: '1.2',
    }}>
      {value}
    </div>
  </div>
);

function HourlyStarsChart() {
  let defaultRepo = "helm/helm";
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

  const [chartData, setChartData] = useState(null);
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);
  const [starsRepos, setStarsRepos] = useState([]);
  const [lastDays, setLastDays] = useState(3);
  const [displayedLastDays, setDisplayedLastDays] = useState(3);
  const [totalStars, setTotalStars] = useState(0);
  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [displayedRepo, setDisplayedRepo] = useState(defaultRepo);
  const [timeZone, setTimeZone] = useState(() => {
    const detected = detectUserTimezone();
    return detected ? detected.value : 'UTC';
  });
  const navigate = useNavigate();

  const getTimeZoneOffset = (date, tz) => {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const parts = formatter.formatToParts(date).reduce((acc, p) => {
        if (p.type !== "literal") acc[p.type] = p.value;
        return acc;
      }, {});
      const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );
      const offsetMinutes = Math.round((asUtc - date.getTime()) / 60000);
      return offsetMinutes * 60000;
    } catch (e) {
      return 0;
    }
  };

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const response = await fetch(`${HOST}/allStarsKeys`);
        if (!response.ok) throw new Error("Failed to fetch repos");
        const data = await response.json();
        setStarsRepos(data.sort());
      } catch (e) {
        console.error(e);
      }
    };
    fetchRepos();
  }, []);

  // Re-apply timezone when user changes it without refetching
  useEffect(() => {
    if (rawData.length === 0) return;
    const zoned = applyTimeZone(rawData, timeZone);
    const processed = processChartData(zoned);
    setChartData(processed);
    setTotalStars(processed.periodTotal);
  }, [timeZone, rawData]);

  const handleLastDaysChange = (event) => {
    setLastDays(event.target.value);
  };

  const applyTimeZone = (data, tz) =>
    data.map((item) => {
      const utcDate = new Date(item.hour);
      const shifted = new Date(utcDate.getTime() + getTimeZoneOffset(utcDate, tz));
      return { ...item, hour: shifted.toISOString() };
    });

  const processChartData = (data) => {
    // Calculate total stars for THIS period only (sum of hourly stars)
    const periodTotal = data.reduce((sum, item) => sum + item.stars, 0);

    // Prepare data for Plotly
    const hours = data.map(item => item.hour);
    const stars = data.map(item => item.stars);
    const totalStarsData = data.map(item => item.totalStars);

    // Find all hours that are the start of a day (midnight at 00:00 UTC)
    const dayStartHours = data
      .filter(item => {
        const hourPart = item.hour.includes('T') ? item.hour.split('T')[1] : item.hour.split(' ')[1];
        return hourPart?.startsWith('00:00:00');
      })
      .map(item => item.hour);

    // Find all weekends for background bands (cool effect)
    const weekendBands = [];
    for (let i = 0; i < data.length; i++) {
      const d = new Date(data[i].hour);
      if (d.getUTCDay() === 6) { // Saturday (relative to selected TZ, already shifted)
        const start = data[i].hour;
        // Find next Monday or end of data
        let j = i + 1;
        while (j < data.length) {
          const dj = new Date(data[j].hour);
          if (dj.getUTCDay() === 1 && dj.getUTCHours() === 0) break;
          j++;
        }
        const end = j < data.length ? data[j].hour : data[data.length - 1].hour;
        weekendBands.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: start,
          x1: end,
          y0: 0,
          y1: 1,
          fillcolor: 'rgba(200,200,255,0.08)',
          line: { width: 0 },
          layer: 'below',
        });
        i = j - 1;
      }
    }

    // Calculate top hour and top day for stars
    let topHour = null, topHourCount = 0;
    let dayCounts = {};
    data.forEach(item => {
      if (item.stars > topHourCount) {
        topHour = item.hour;
        topHourCount = item.stars;
      }
      const day = item.hour.split('T')[0];
      dayCounts[day] = (dayCounts[day] || 0) + item.stars;
    });
    let topDay = null, topDayCount = 0;
    Object.entries(dayCounts).forEach(([day, count]) => {
      if (count > topDayCount) {
        topDay = day;
        topDayCount = count;
      }
    });

    // Calculate best hour(s) of the day for stars
    const hourCounts = {};
    const hourOccurrences = {};
    data.forEach(item => {
      // item.hour: "YYYY-MM-DDTHH:MM:SSZ"
      const hour = item.hour.split('T')[1].slice(0, 2);
      hourCounts[hour] = (hourCounts[hour] || 0) + item.stars;
      hourOccurrences[hour] = (hourOccurrences[hour] || 0) + 1;
    });
    const maxHourCount = Math.max(...Object.values(hourCounts));
    const bestHours = Object.entries(hourCounts)
      .filter(([h, count]) => count === maxHourCount)
      .map(([h]) => h.padStart(2, '0'));
    const bestHourLabel = bestHours.length > 1 ? bestHours.join(', ') : bestHours[0];
    // Calculate average for best hour(s)
    const avgStars = bestHours.map(h => {
      const total = hourCounts[h];
      const occ = hourOccurrences[h];
      return occ ? (total / occ) : 0;
    });
    const avgStarsLabel = avgStars.length > 1 ? avgStars.map(a => a.toFixed(2)).join(', ') : avgStars[0].toFixed(2);

    return {
      hours,
      stars,
      totalStarsData,
      dayStartHours,
      weekendBands,
      dayStartShapes: dayStartHours.map(xVal => ({
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: xVal,
        x1: xVal,
        y0: 0,
        y1: 1,
        line: {
          color: 'rgba(100,180,255,0.3)', // more subtle
          width: 1,
          dash: 'dot',
        },
        layer: 'below',
      })),
      topHour,
      topHourCount,
      topDay,
      topDayCount,
      bestHourLabel,
      avgStarsLabel,
      periodTotal
    };
  };

  const fetchHourlyStars = async (repo, days, complete = false) => {
    try {
      setLoading(true);

      let url = `${HOST}/recentStarsByHour?repo=${repo}&lastDays=${days}`;
      if (complete) {
        url += '&complete=true';
      }
      
      let isIncremental = false;
      let sinceHour = null;

      // Check if we can do an incremental update
      // Only do incremental if we are NOT asking for complete-only data (i.e. we want latest)
      // and we have data
      if (!complete && repo === displayedRepo && days === displayedLastDays && rawData.length > 0) {
        const lastEntry = rawData[rawData.length - 1];
        if (lastEntry && lastEntry.hour) {
          sinceHour = lastEntry.hour;
          url += `&since=${sinceHour}`;
          isIncremental = true;
          console.log(`Incremental fetch for ${repo} since ${sinceHour}`);
        }
      }

      const response = await fetch(url);
      if (!response.ok) {
        setLoading(false);
        if (response.status === 404) {
          setError(`Repository '${repo}' not found. Please check if the repository exists on GitHub.`);
          setShowError(true);
        } else {
          setError("Internal Server Error. Please try again later.");
          setShowError(true);
        }
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      setShowError(false);
      
      let newData = await response.json();
      if (!newData) newData = [];
      setLoading(false);

      let mergedData = newData;

      if (isIncremental) {
        if (newData.length === 0) {
           mergedData = rawData; 
        } else {
           // Merge: use a Map to ensure uniqueness by hour
           // New data overwrites old data for the same hour Key
           const dataMap = new Map();
           rawData.forEach(d => dataMap.set(d.hour, d));
           newData.forEach(d => dataMap.set(d.hour, d));
           
           mergedData = Array.from(dataMap.values()).sort((a, b) => a.hour.localeCompare(b.hour));
        }
      } else {
        if (mergedData.length === 0) {
           setError("No hourly data available for this repository.");
           setShowError(true);
           return;
        }
      }

      const zonedData = applyTimeZone(mergedData, timeZone);
      const processed = processChartData(zonedData);
      
      setChartData(processed);
      setTotalStars(processed.periodTotal); // Use processed total
      setRawData(mergedData);
      setDisplayedRepo(repo);
      setDisplayedLastDays(days);
      
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch requests only "complete" data (up to previous hour)
    // allowing server to return cached data without hitting GitHub for partial hour
    fetchHourlyStars(selectedRepo, lastDays, true);
    // eslint-disable-next-line
  }, [selectedRepo, lastDays]);

  const handleClick = async () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    if (repoParsed === null) {
      setError("Invalid GitHub repository format. Please use owner/repo format or a valid GitHub URL.");
      setShowError(true);
      setLoading(false);
      return;
    }
    setShowError(false);
    navigate(`/hourly/${repoParsed}`, { replace: false });
    // Manual fetch requests LATEST data (complete=false)
    await fetchHourlyStars(repoParsed, lastDays, false);
  };

  const handleClickWithRepo = async (repo) => {
    const repoParsed = parseGitHubRepoURL(repo);
    if (repoParsed === null) {
      setError("Invalid GitHub repository format. Please use owner/repo format or a valid GitHub URL.");
      setShowError(true);
      setLoading(false);
      return;
    }
    setShowError(false);
    navigate(`/hourly/${repoParsed}`, { replace: false });
    // Start with complete data
    await fetchHourlyStars(repoParsed, lastDays, true);
  };

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => {
        setShowError(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  const openCurrentRepoPage = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    window.open("https://github.com/" + repoParsed, "_blank");
  };

  const goToDailyView = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    navigate(`/${repoParsed}`);
  };

  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh', padding: '20px' }}>
      {showError && (
        <Alert
          severity="error"
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={() => setShowError(false)}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      {/* Controls Section */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
      }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <Autocomplete
            freeSolo
            disablePortal
            id="combo-box-repo"
            size="small"
            options={starsRepos.map((el) => ({ label: el }))}
            renderInput={(params) => (
              <TextField
                {...params}
                style={{ width: "400px" }}
                label="Enter a GitHub repository"
                variant="outlined"
                size="small"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleClickWithRepo(e.target.value);
                  }
                }}
              />
            )}
            value={starsRepos.includes(selectedRepo) ? { label: selectedRepo } : selectedRepo ? { label: selectedRepo } : null}
            onChange={(e, v, reason) => {
              const repo = typeof v === "string" ? v : v?.label || "";
              setSelectedRepo(repo);
              if (reason === "selectOption" || reason === "createOption") {
                handleClickWithRepo(repo);
              }
            }}
            onInputChange={(e, v, reason) => {
              if (reason === "input") setSelectedRepo(v);
            }}
          />
          <FormControl style={{ width: "120px" }}>
            <InputLabel id="last-days-select">Days</InputLabel>
            <Select
              labelId="last-days"
              id="last-days"
              value={lastDays}
              size="small"
              label="Days"
              onChange={handleLastDaysChange}
            >
              <MenuItem value={1}>1 Day</MenuItem>
              <MenuItem value={3}>3 Days</MenuItem>
              <MenuItem value={7}>7 Days</MenuItem>
              <MenuItem value={14}>14 Days</MenuItem>
              <MenuItem value={30}>30 Days</MenuItem>
              <MenuItem value={60}>60 Days</MenuItem>
            </Select>
          </FormControl>
          <Autocomplete
            disablePortal
            size="small"
            options={TIMEZONES}
            groupBy={(option) => option.region}
            getOptionLabel={(option) => option.city}
            value={TIMEZONES.find((opt) => opt.value === timeZone) || null}
            onChange={(_, v) => v && setTimeZone(v.value)}
            sx={{ width: 240 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Timezone"
                size="small"
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.value}>
                <span style={{ fontWeight: 500 }}>{option.city}</span>
                <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: '0.875rem' }}>
                  {option.offset}
                </span>
              </li>
            )}
          />
          <Button
            size="small"
            onClick={handleClick}
            variant="contained"
            disabled={loading}
            endIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
          >
            {loading ? "Loading..." : "Fetch"}
          </Button>
          <Tooltip title={INFO_TOOLTIP}>
            <InfoOutlinedIcon style={{ color: "grey" }} />
          </Tooltip>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
          <Button size="small" variant="outlined" onClick={goToDailyView}>
            Daily View
          </Button>
          <Button size="small" variant="outlined" onClick={openCurrentRepoPage}>
            Open GH repo
          </Button>
        </div>
      </div>

      {/* Stats Dashboard */}
      {chartData && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "24px"
        }}>
          <StatCard
            icon="⭐"
            label={`Stars (${lastDays}d)`}
            value={formatNumber(totalStars)}
            color="#fbbf24"
          />
          {chartData.topHour && (
            <StatCard
              icon="🏆"
              label="Peak Hour (UTC)"
              value={(() => {
                const iso = chartData.topHour.replace('Z', '');
                const [date, time] = iso.split('T');
                const [year, month, day] = date.split('-');
                const hour = time.slice(0, 2);
                return `${day}-${month} ${hour}:00 (${chartData.topHourCount})`;
              })()}
              color="#ef4444"
            />
          )}
          {chartData.topDay && (
            <StatCard
              icon="📅"
              label="Peak Day"
              value={(() => {
                const [year, month, day] = chartData.topDay.split('-');
                return `${day}-${month}-${year} (${chartData.topDayCount})`;
              })()}
              color="#8b5cf6"
            />
          )}
          {chartData.bestHourLabel && (
            <StatCard
              icon="⏰"
              label="Best Hour(s)"
              value={`${chartData.bestHourLabel}:00 (avg ${chartData.avgStarsLabel})`}
              color="#10b981"
            />
          )}
        </div>
      )}

      {/* Chart Container */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        minHeight: 'clamp(360px, 60vh, 720px)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {chartData && (
          <Plot
            data={[
              {
                x: chartData.hours,
                y: chartData.stars,
                type: 'bar',
                name: 'Hourly Stars',
                marker: {
                  color: chartData.stars.map((val, idx) =>
                    `rgba(59, 130, 246, ${0.4 + (val / Math.max(...chartData.stars)) * 0.6})`
                  ),
                  line: {
                    width: 0
                  }
                },
                hovertemplate: '<b>%{x|%b %d, %H:%M}</b><br>Stars: %{y}<extra></extra>',
              },
              {
                x: chartData.hours,
                y: chartData.totalStarsData,
                type: 'scatter',
                mode: 'lines',
                name: 'Total Stars',
                line: {
                  color: '#10b981',
                  width: 3,
                  shape: 'spline',
                },
                fill: 'tozeroy',
                fillcolor: 'rgba(16, 185, 129, 0.05)',
                yaxis: 'y2',
                hovertemplate: '<b>%{x|%b %d, %H:%M}</b><br>Total: %{y}<extra></extra>',
              },
            ]}
            layout={{
              title: {
                text: `Hourly Stars - ${displayedRepo}`,
                font: { size: 24, color: '#ffffff', family: 'Inter, system-ui, sans-serif', weight: 700 },
                x: 0.5,
                xanchor: 'center',
              },
              xaxis: {
                title: { text: '', font: { color: '#9ca3af' } },
                type: 'date',
                tickformat: lastDays <= 3 ? '%b %d %H:%M' : (lastDays <= 14 ? '%b %d' : '%m-%d'),
                tickfont: { color: '#9ca3af', size: 11 },
                gridcolor: 'rgba(255,255,255,0.05)',
                showgrid: false,
                rangeslider: { visible: lastDays > 7 }, // Add range slider for long periods
              },
              yaxis: {
                title: { text: 'Hourly Stars', font: { color: '#3b82f6', size: 13, weight: 600 } },
                side: 'left',
                tickfont: { color: '#9ca3af', size: 11 },
                gridcolor: 'rgba(255,255,255,0.08)',
                zeroline: false,
              },
              yaxis2: {
                title: { text: 'Total Stars', font: { color: '#10b981', size: 13, weight: 600 } },
                overlaying: 'y',
                side: 'right',
                tickfont: { color: '#9ca3af', size: 11 },
                showgrid: false,
              },
              hovermode: 'x unified',
              showlegend: true,
              legend: {
                x: 0.02,
                y: 0.98,
                bgcolor: 'rgba(0,0,0,0.5)',
                bordercolor: 'rgba(59, 130, 246, 0.3)',
                borderwidth: 1,
                font: { color: '#ffffff', size: 12 }
              },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { color: '#ffffff', family: 'Inter, system-ui, sans-serif' },
              margin: { l: 60, r: 60, t: 80, b: lastDays > 7 ? 120 : 60 },
              shapes: [
                ...((chartData.weekendBands) || []),
                ...((chartData.dayStartShapes) || [])
              ],
              bargap: 0.1,
            }}
            config={{
              responsive: true,
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d'],
              toImageButtonOptions: {
                format: 'png',
                filename: `${displayedRepo.replace('/', '-')}-hourly-stars`,
                height: 1080,
                width: 1920,
                scale: 2
              }
            }}
            style={{
              width: '100%',
              height: 'clamp(320px, 55vh, 640px)',
              flex: 1,
            }}
          />
        )}
        {!chartData && !loading && (
          <div style={{
            color: '#9ca3af',
            textAlign: 'center',
            padding: '100px 20px',
            fontSize: '18px',
          }}>
            👆 Click "Fetch" to load hourly stars data
          </div>
        )}
      </div>
    </div>
  );
}
export default HourlyStarsChart;
