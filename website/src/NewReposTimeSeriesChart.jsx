import { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import SendIcon from "@mui/icons-material/Send";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Plot from "react-plotly.js";
import { formatNumber } from "./utils";

const HOST = import.meta.env.VITE_HOST;

// Stat Card Component for dashboard-style metrics
const StatCard = ({ icon, label, value, color = "#3b82f6" }) => (
  <div style={{
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
    border: `1px solid ${color}33`,
    borderRadius: '12px',
    padding: '12px 16px',
    minWidth: '180px',
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

function NewReposTimeSeriesChart() {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);
  const [includeForks, setIncludeForks] = useState(false);
  
  // Default to last 90 days
  const getDefaultEndDate = () => {
    const today = new Date();
    today.setDate(today.getDate() - 1); // Yesterday since today isn't complete
    return today.toISOString().split('T')[0];
  };
  
  const getDefaultStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    return date.toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());

  const handleIncludeForksChange = (event) => {
    setIncludeForks(event.target.checked);
  };

  const fetchNewRepos = async () => {
    try {
      setLoading(true);
      setChartData(null);
      setShowError(false);
      
      const fetchUrl = `${HOST}/newRepos?startDate=${startDate}&endDate=${endDate}&includeForks=${includeForks}`;
      console.log('Fetching:', fetchUrl);
      
      const response = await fetch(fetchUrl);
      
      if (!response.ok) {
        setLoading(false);
        setError(`Failed to fetch data. Status: ${response.status}`);
        setShowError(true);
        return;
      }
      
      const text = await response.text();
      console.log('Response text:', text.substring(0, 200));
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('JSON parse error:', e);
        setLoading(false);
        setError("Invalid response from server. Please try again.");
        setShowError(true);
        return;
      }
      
      setLoading(false);
      
      if (!data || !data.newRepos || !Array.isArray(data.newRepos) || data.newRepos.length === 0) {
        setError("No data available for this period.");
        setShowError(true);
        console.log('Data structure:', data);
        return;
      }

      const newRepos = data.newRepos;
      console.log('newRepos sample:', newRepos[0]);
      
      // Parse dates properly from DD-MM-YYYY format
      const parseDate = (dateStr) => {
        const [day, month, year] = dateStr.split('-');
        return `${year}-${month}-${day}`; // Convert to YYYY-MM-DD
      };
      
      // Calculate statistics
      const dates = newRepos.map(item => parseDate(item[0]));
      const dailyCounts = newRepos.map(item => item[1]);
      const totalSeen = newRepos.map(item => item[2]);
      
      const totalRepos = totalSeen[totalSeen.length - 1] - totalSeen[0];
      const avgPerDay = (totalRepos / dailyCounts.length).toFixed(1);
      
      // Peak day
      const maxCount = Math.max(...dailyCounts);
      const maxIndex = dailyCounts.indexOf(maxCount);
      const peakDay = dates[maxIndex]; // Already in YYYY-MM-DD format
      
      // Growth trend: compare first half vs second half
      const midPoint = Math.floor(dailyCounts.length / 2);
      const firstHalfAvg = dailyCounts.slice(0, midPoint).reduce((a, b) => a + b, 0) / midPoint;
      const secondHalfAvg = dailyCounts.slice(midPoint).reduce((a, b) => a + b, 0) / (dailyCounts.length - midPoint);
      const growthRate = (((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100).toFixed(1);
      
      // Recent acceleration: last 7 days vs previous 7 days
      const last7Days = dailyCounts.slice(-7);
      const prev7Days = dailyCounts.slice(-14, -7);
      const last7Avg = last7Days.reduce((a, b) => a + b, 0) / last7Days.length;
      const prev7Avg = prev7Days.length > 0 ? prev7Days.reduce((a, b) => a + b, 0) / prev7Days.length : last7Avg;
      const recentAcceleration = prev7Avg > 0 ? (((last7Avg - prev7Avg) / prev7Avg) * 100).toFixed(1) : '0';
      
      // Day of week analysis
      const dayOfWeekCounts = {0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
      dates.forEach((dateStr, idx) => {
        const date = new Date(dateStr); // Now in YYYY-MM-DD format
        const dayOfWeek = date.getUTCDay();
        if (dayOfWeek >= 0 && dayOfWeek <= 6) {
          dayOfWeekCounts[dayOfWeek].push(dailyCounts[idx]);
        }
      });
      
      const dayOfWeekAvgs = {};
      Object.keys(dayOfWeekCounts).forEach(day => {
        const counts = dayOfWeekCounts[day];
        dayOfWeekAvgs[day] = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
      });
      
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const bestDayNum = Object.keys(dayOfWeekAvgs).reduce((a, b) => 
        dayOfWeekAvgs[a] > dayOfWeekAvgs[b] ? a : b
      );
      const bestDay = dayNames[bestDayNum];
      const bestDayAvg = dayOfWeekAvgs[bestDayNum].toFixed(0);

      setChartData({
        dates,
        dailyCounts,
        totalSeen,
        totalRepos,
        avgPerDay,
        peakDay,
        maxCount,
        growthRate,
        recentAcceleration,
        last7Avg: last7Avg.toFixed(0),
        bestDay,
        bestDayAvg,
      });
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
      setError(`Error: ${error.message}`);
      setShowError(true);
    }
  };

  useEffect(() => {
    fetchNewRepos();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => {
        setShowError(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  const handleClick = async () => {
    // Validate dates
    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date must be before end date");
      setShowError(true);
      return;
    }
    
    setShowError(false);
    await fetchNewRepos();
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
          <TextField
            style={{ width: "180px" }}
            label="Start Date"
            type="date"
            variant="outlined"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            style={{ width: "180px" }}
            label="End Date"
            type="date"
            variant="outlined"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={includeForks}
                onChange={handleIncludeForksChange}
                name="includeForks"
              />
            }
            label="Include Forks"
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
        </div>
      </div>

      {/* Stats Dashboard - Showcasing AI/LLM Era Growth */}
      {chartData && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px"
        }}>
          <StatCard
            icon="📊"
            label="Total Repos Created"
            value={formatNumber(chartData.totalRepos)}
            color="#3b82f6"
          />
          <StatCard
            icon="📈"
            label="Daily Average"
            value={`${formatNumber(chartData.avgPerDay)}/day`}
            color="#10b981"
          />
          <StatCard
            icon="🚀"
            label="Peak Day"
            value={`${new Date(chartData.peakDay).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} (${formatNumber(chartData.maxCount)})`}
            color="#ef4444"
          />
          <StatCard
            icon="📊"
            label="Period Growth"
            value={`${chartData.growthRate > 0 ? '+' : ''}${chartData.growthRate}%`}
            color={chartData.growthRate > 0 ? "#10b981" : "#ef4444"}
          />
          <StatCard
            icon="⚡"
            label="Recent Trend (7d)"
            value={`${chartData.recentAcceleration > 0 ? '+' : ''}${chartData.recentAcceleration}%`}
            color={chartData.recentAcceleration > 0 ? "#10b981" : "#ef4444"}
          />
          <StatCard
            icon="🤖"
            label="AI Era Impact"
            value={`${chartData.last7Avg}/day now`}
            color="#8b5cf6"
          />
          <StatCard
            icon="📅"
            label="Best Day"
            value={`${chartData.bestDay} (avg ${chartData.bestDayAvg})`}
            color="#f59e0b"
          />
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
                x: chartData.dates,
                y: chartData.dailyCounts,
                type: 'bar',
                name: 'Daily New Repos',
                marker: {
                  color: chartData.dailyCounts.map((val, idx) =>
                    `rgba(59, 130, 246, ${0.4 + (val / Math.max(...chartData.dailyCounts)) * 0.6})`
                  ),
                  line: { width: 0 }
                },
                hovertemplate: '<b>%{x}</b><br>New Repos: %{y}<extra></extra>',
              },
              {
                x: chartData.dates,
                y: chartData.totalSeen,
                type: 'scatter',
                mode: 'lines',
                name: 'Cumulative Total',
                line: {
                  color: '#10b981',
                  width: 3,
                  shape: 'spline',
                },
                fill: 'tozeroy',
                fillcolor: 'rgba(16, 185, 129, 0.05)',
                yaxis: 'y2',
                hovertemplate: '<b>%{x}</b><br>Total: %{y}<extra></extra>',
              },
            ]}
            layout={{
              title: {
                text: `New GitHub Repositories - Daily Creation Trends${includeForks ? ' (incl. Forks)' : ''}`,
                font: { size: 24, color: '#ffffff', family: 'Inter, system-ui, sans-serif', weight: 700 },
                x: 0.5,
                xanchor: 'center',
              },
              xaxis: {
                title: { text: '', font: { color: '#9ca3af' } },
                type: 'date',
                tickformat: '%b %d',
                tickfont: { color: '#9ca3af', size: 11 },
                gridcolor: 'rgba(255,255,255,0.05)',
                showgrid: false,
              },
              yaxis: {
                title: { text: 'Daily New Repos', font: { color: '#3b82f6', size: 13, weight: 600 } },
                side: 'left',
                tickfont: { color: '#9ca3af', size: 11 },
                gridcolor: 'rgba(255,255,255,0.08)',
                zeroline: false,
              },
              yaxis2: {
                title: { text: 'Cumulative Total', font: { color: '#10b981', size: 13, weight: 600 } },
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
              margin: { l: 60, r: 60, t: 80, b: 60 },
              bargap: 0.1,
            }}
            config={{
              responsive: true,
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d'],
              toImageButtonOptions: {
                format: 'png',
                filename: `github-new-repos-${startDate}-to-${endDate}`,
                height: 1080,
                width: 1920,
                scale: 2
              }
            }}
            style={{ width: '100%', height: '500px' }}
          />
        )}
        {!chartData && !loading && (
          <div style={{
            color: '#9ca3af',
            textAlign: 'center',
            padding: '100px 20px',
            fontSize: '18px',
          }}>
            👆 Click "Fetch" to load repository creation trends
          </div>
        )}
      </div>

      {/* Insights Section */}
      {chartData && chartData.growthRate > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
          borderRadius: '16px',
          padding: '24px',
          marginTop: '24px',
          border: '1px solid rgba(139, 92, 246, 0.3)',
        }}>
          <h3 style={{ color: '#fff', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🤖</span> AI/LLM Era Impact Analysis
          </h3>
          <p style={{ color: '#9ca3af', lineHeight: '1.6', marginBottom: 0 }}>
            Repository creation is showing a <strong style={{ color: '#10b981' }}>
            {Math.abs(chartData.growthRate)}% {chartData.growthRate > 0 ? 'increase' : 'decrease'}</strong> trend 
            over the selected period. The last 7 days averaged <strong style={{ color: '#3b82f6' }}>
            {chartData.last7Avg} new repositories per day</strong>, representing a <strong style={{ 
              color: chartData.recentAcceleration > 0 ? '#10b981' : '#ef4444' 
            }}>{Math.abs(chartData.recentAcceleration)}% {chartData.recentAcceleration > 0 ? 'acceleration' : 'slowdown'}</strong> compared 
            to the previous week. This {chartData.growthRate > 10 ? 'significant growth' : 'trend'} likely reflects 
            the widespread adoption of AI-powered coding assistants (GitHub Copilot, ChatGPT, Claude, etc.), 
            enabling developers to create and experiment with new projects more rapidly than ever before.
          </p>
        </div>
      )}
    </div>
  );
}

export default NewReposTimeSeriesChart;
