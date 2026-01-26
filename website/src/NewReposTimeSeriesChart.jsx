import { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import LoadingButton from "@mui/lab/LoadingButton";
import SendIcon from "@mui/icons-material/Send";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema-newrepos";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import UmberTheme from "fusioncharts/themes/fusioncharts.theme.umber";
import GitHubButton from "react-github-btn";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

const HOST = import.meta.env.VITE_HOST;

ReactFC.fcRoot(
  FusionCharts,
  TimeSeries,
  GammelTheme,
  CandyTheme,
  ZuneTheme,
  UmberTheme
);

function NewReposTimeSeriesChart() {
  const chart_props = {
    type: "timeseries",
    width: "100%",
    height: "88%",
    dataEmptyMessage: "Fetching data...",
    dataSource: {
      tooltip: {
        style: {
          container: {
            "border-color": "#000000",
            "background-color": "#75748D",
          },
          text: {
            color: "#FFFFFF",
          },
        },
      },
      caption: { text: "New GitHub Repositories Created Daily" },
      data: null,
      yAxis: [
        {
          plot: {
            value: "Daily Count",
            type: "line",
          },
          title: "Daily Count",
        },
        {
          plot: {
            value: "Total Seen",
            type: "line",
          },
          title: "Cumulative Total",
        },
      ],
      xAxis: {
        plot: "Time",
        timemarker: [],
        binning: {},
      },
      chart: {
        animation: "0",
        theme: "candy",
        exportEnabled: "1",
        exportMode: "client",
        exportFormats: "PNG=Export as PNG|PDF=Export as PDF",
      },
    },
  };

  const [ds, setds] = useState(chart_props);
  const [currentNewReposHistory, setCurrentNewReposHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("candy");
  const [includeForks, setIncludeForks] = useState(false);
  
  // Default to last 30 days
  const getDefaultEndDate = () => {
    const today = new Date();
    today.setDate(today.getDate() - 1); // Yesterday since today isn't complete
    return today.toISOString().split('T')[0];
  };
  
  const getDefaultStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 60);
    return date.toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    const options = { ...ds };
    options.dataSource.chart.theme = event.target.value;
    setds(options);
  };

  const handleIncludeForksChange = (event) => {
    setIncludeForks(event.target.checked);
  };

  const updateGraph = async (newReposHistory) => {
    const options = { ...ds };

    console.log("Data points:", newReposHistory.length);
    console.log("First item:", newReposHistory[0]);

    // Data is already in the correct format: [dateString, count, totalSeen]
    // Just pass it directly to FusionCharts
    const fusionTable = new FusionCharts.DataStore().createDataTable(
      newReposHistory,
      schema
    );

    options.dataSource.data = fusionTable;
    options.dataSource.chart.theme = theme;
    options.dataSource.chart.exportFileName = `github-new-repos-${startDate}-to-${endDate}`;

    setds(options);
  };

  const fetchNewRepos = async () => {
    console.log("Fetching new repos data");

    setCurrentNewReposHistory([]);
    setLoading(true);

    const fetchUrl = `${HOST}/newRepos?startDate=${startDate}&endDate=${endDate}&includeForks=${includeForks}`;

    fetch(fetchUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setLoading(false);
        console.log(data);
        console.log("Raw newRepos data:", JSON.stringify(data.newRepos[0], null, 2));
        const newReposHistory = data.newRepos;
        setCurrentNewReposHistory(newReposHistory);
        updateGraph(newReposHistory);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
        setLoading(false);
        toast.error("Error fetching data. Please try again later.", {
          position: toast.POSITION.BOTTOM_CENTER,
        });
      });
  };

  useEffect(() => {
    fetchNewRepos();
  }, []);

  const handleClick = async () => {
    // Validate dates
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("Start date must be before end date", {
        position: toast.POSITION.BOTTOM_CENTER,
      });
      return;
    }
    
    fetchNewRepos();
  };

  return (
    <div>
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          style={{
            marginTop: "20px",
            marginRight: "20px",
            marginLeft: "10px",
            width: "200px",
          }}
          label="Start Date"
          type="date"
          variant="outlined"
          size="small"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{
            shrink: true,
          }}
        />
        <TextField
          style={{
            marginTop: "20px",
            marginRight: "20px",
            marginLeft: "10px",
            width: "200px",
          }}
          label="End Date"
          type="date"
          variant="outlined"
          size="small"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{
            shrink: true,
          }}
        />
        <FormControlLabel
          style={{
            marginTop: "20px",
            marginRight: "20px",
          }}
          control={
            <Checkbox
              checked={includeForks}
              onChange={handleIncludeForksChange}
              name="includeForks"
            />
          }
          label="Include Forks"
        />
        <LoadingButton
          style={{
            marginTop: "20px",
            marginRight: "20px",
            marginLeft: "10px",
          }}
          size="small"
          onClick={handleClick}
          endIcon={<SendIcon />}
          loading={loading}
          loadingPosition="end"
          variant="contained"
        >
          <span>Fetch</span>
        </LoadingButton>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: "10px",
          marginLeft: "10px",
          marginBottom: "10px",
        }}
      >
        <div
          style={{
            width: "110px",
          }}
        >
          <FormControl>
            <InputLabel id="style-select-drop">Theme</InputLabel>
            <Select
              labelId="theme"
              id="theme"
              value={theme}
              size="small"
              label="Theme"
              onChange={handleThemeChange}
            >
              <MenuItem value={"fusion"}>Fusion</MenuItem>
              <MenuItem value={"candy"}>Candy</MenuItem>
              <MenuItem value={"gammel"}>Gammel</MenuItem>
              <MenuItem value={"zune"}>Zune</MenuItem>
              <MenuItem value={"umber"}>Umber</MenuItem>
            </Select>
          </FormControl>
        </div>
        <div
          style={{
            marginTop: "5px",
            marginLeft: "10px",
          }}
        >
          <GitHubButton
            href="https://github.com/emanuelef/daily-stars-explorer"
            data-color-scheme="no-preference: dark; light: dark_dimmed; dark: dark_high_contrast;"
            data-size="large"
            data-show-count="true"
            aria-label="Star emanuelef/daily-stars-explorer on GitHub"
          >
            Star Me
          </GitHubButton>
        </div>
      </div>
      <div
        id="chart-container"
        style={{
          marginLeft: "10px",
        }}
      >
        {ds != null && ds != chart_props && ds && ds.dataSource.data && (
          <ReactFC {...ds} />
        )}
      </div>
    </div>
  );
}

export default NewReposTimeSeriesChart;
