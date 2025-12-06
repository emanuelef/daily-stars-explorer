
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import Tooltip from "@mui/material/Tooltip";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
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
  const [lastDays, setLastDays] = useState(7);
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
            color: 'rgba(100,180,255,0.5)', // subtle blue
            width: 1,
            dash: 'dot',
          },
          layer: 'above',
        }))
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
    <div>
      <div style={{
        width: "100%",
        background: "#b0bec5",
        color: "#222",
        padding: "4px 0",
        textAlign: "center",
        fontWeight: 500,
        fontSize: "0.95rem",
        letterSpacing: "0.5px",
        marginBottom: "10px",
        borderRadius: "3px"
      }}>
        This is an experimental view
      </div>
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
      <div style={{ display: "flex", alignItems: "center" }}>
        <Autocomplete
          freeSolo
          disablePortal
          id="combo-box-repo"
          size="small"
          options={starsRepos.map((el) => ({ label: el }))}
          renderInput={(params) => (
            <TextField
              {...params}
              style={{ marginTop: "20px", marginRight: "20px", marginLeft: "10px", width: "400px" }}
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
        <FormControl style={{ marginTop: "20px", marginRight: "10px", marginLeft: "10px", width: "120px" }}>
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
          style={{ marginTop: "20px", marginRight: "20px", marginLeft: "10px" }}
          size="small"
          onClick={handleClick}
          variant="contained"
          disabled={loading}
          endIcon={<SendIcon />}
        >
          {loading ? "Loading..." : "Fetch"}
        </Button>
        <Tooltip title={INFO_TOOLTIP}>
          <InfoOutlinedIcon style={{ marginTop: "20px", marginRight: "10px", color: "grey" }} />
        </Tooltip>
        <TextField
          style={{ marginTop: "20px", marginRight: "5px", marginLeft: "10px", width: "120px" }}
          size="small"
          id="total-stars"
          label="⭐ Total"
          value={totalStars}
          InputProps={{ readOnly: true }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: "10px", marginLeft: "10px", marginBottom: "10px" }}>
        <Button style={{ marginLeft: "10px" }} size="small" variant="contained" onClick={goToDailyView}>
          Daily View
        </Button>
        <Button style={{ marginLeft: "10px" }} size="small" variant="contained" onClick={openCurrentRepoPage}>
          Open GH repo
        </Button>
      </div>
      <div id="chart-container" style={{ marginLeft: "10px", marginTop: "20px", width: "98%", height: "600px" }}>
        {chartData && (
          <Plot
            data={[
              {
                x: chartData.hours,
                y: chartData.stars,
                type: 'bar',
                name: 'Hourly Stars',
                marker: { color: '#3b82f6' },
                hovertemplate: '<b>%{x}</b><br>Stars: %{y}<extra></extra>',
              },
              {
                x: chartData.hours,
                y: chartData.totalStarsData,
                type: 'scatter',
                mode: 'lines',
                name: 'Total Stars',
                line: { color: '#10b981', width: 2 },
                yaxis: 'y2',
                hovertemplate: '<b>%{x}</b><br>Total: %{y}<extra></extra>',
              },
            ]}
            layout={{
              title: `Hourly Stars - ${selectedRepo} (Last ${lastDays} days)`,
              xaxis: {
                title: 'Time',
                type: 'date',
                tickformat: '%Y-%m-%d %H:%M',
              },
              yaxis: {
                title: 'Hourly Stars',
                side: 'left',
              },
              yaxis2: {
                title: 'Total Stars',
                overlaying: 'y',
                side: 'right',
              },
              hovermode: 'x unified',
              showlegend: true,
              legend: { x: 0, y: 1 },
              paper_bgcolor: '#1a1a1a',
              plot_bgcolor: '#2d2d2d',
              font: { color: '#ffffff' },
              margin: { l: 60, r: 60, t: 60, b: 60 },
              shapes: [
                ...((chartData.weekendBands) || []),
                ...((chartData.dayStartShapes) || [])
              ],
            }}
            config={{
              responsive: true,
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            }}
            style={{ width: '100%', height: '100%' }}
          />
        )}
        {!chartData && !loading && (
          <div style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>
            Click "Fetch" to load hourly stars data
          </div>
        )}
      </div>
    </div>
  );
}
export default HourlyStarsChart;
