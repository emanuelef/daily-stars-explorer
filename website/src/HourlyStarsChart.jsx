import { useState, useEffect } from "react";
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
  "Hourly star data for the selected time period. You can zoom and pan the chart.";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);
  const [starsRepos, setStarsRepos] = useState([]);
  const [lastDays, setLastDays] = useState(3);
  const [totalStars, setTotalStars] = useState(0);
  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const navigate = useNavigate();

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

  const handleLastDaysChange = (event) => {
    setLastDays(event.target.value);
  };

  const fetchHourlyStars = async (repo, days) => {
    try {
      setLoading(true);
      const response = await fetch(`${HOST}/recentStarsByHour?repo=${repo}&lastDays=${days}`);
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
      const data = await response.json();
      setLoading(false);
      if (!data || data.length === 0) {
        setError("No hourly data available for this repository.");
        setShowError(true);
        return;
      }
      if (data.length > 0) {
        setTotalStars(data[data.length - 1].totalStars);
      }

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

      console.log('Day start hours:', dayStartHours);
      console.log('Sample data hour format:', data[0]?.hour);

      // Find all weekends for background bands (cool effect)
      const weekendBands = [];
      for (let i = 0; i < data.length; i++) {
        const d = new Date(data[i].hour);
        if (d.getUTCDay() === 6) { // Saturday
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

      setChartData({
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
      });

      console.log('Day start shapes count:', dayStartHours.length);
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHourlyStars(selectedRepo, lastDays);
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
    await fetchHourlyStars(repoParsed, lastDays);
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
    await fetchHourlyStars(repoParsed, lastDays);
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
            label="Total Stars"
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
                text: `Hourly Stars - ${selectedRepo}`,
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
                filename: `${selectedRepo.replace('/', '-')}-hourly-stars`,
                height: 1080,
                width: 1920,
                scale: 2
              }
            }}
            style={{ width: '100%', height: '600px' }}
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
