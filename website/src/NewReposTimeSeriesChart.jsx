import { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import LoadingButton from "@mui/lab/LoadingButton";
import SendIcon from "@mui/icons-material/Send";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import newReposSchema from "./schema-newrepos";
import newPRsSchema from "./schema-newprs";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import UmberTheme from "fusioncharts/themes/fusioncharts.theme.umber";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import { useAppTheme } from "./ThemeContext";

const HOST = import.meta.env.VITE_HOST;

ReactFC.fcRoot(
  FusionCharts,
  TimeSeries,
  GammelTheme,
  CandyTheme,
  ZuneTheme,
  UmberTheme
);

const DATA_SOURCES = {
  repos: {
    caption: "New GitHub Repositories Created Daily",
    endpoint: "newRepos",
    responseKey: "newRepos",
    exportPrefix: "github-new-repos",
    schema: newReposSchema,
    description: "Track the number of new public repositories created on GitHub per day",
    showIncludeForks: true,
  },
  prs: {
    caption: "New GitHub Pull Requests Created Daily",
    endpoint: "newPRs",
    responseKey: "newPRs",
    exportPrefix: "github-new-prs",
    schema: newPRsSchema,
    description: "Track the number of new public pull requests created on GitHub per day",
    showIncludeForks: false,
  },
};

function NewReposTimeSeriesChart() {
  const { theme: appTheme, currentTheme } = useAppTheme();
  const isDark = appTheme === "dark";
  const defaultChartTheme = isDark ? "candy" : "fusion";

  const buildChartProps = (chartTheme, caption) => ({
    type: "timeseries",
    width: "100%",
    height: "80%",
    dataEmptyMessage: "Fetching data...",
    styleDefinition: {
      colorstyle: {
        fill: "#ffff00",
      },
    },
    dataSource: {
      tooltip: {
        style: {
          container: {
            "border-color": "#000000",
            "background-color": "#1a1a1a",
            boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
          },
          text: {
            color: "#FFFFFF",
          },
        },
      },
      plotconfig: {
        line: {
          style: {
            plot: {
              "stroke-width": "2.5",
            },
          },
        },
      },
      caption: { text: caption },
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
        theme: chartTheme,
        paletteColors: "#3b82f6, #f59e0b, #10b981, #ec4899, #8b5cf6",
        exportEnabled: "1",
        exportMode: "client",
        exportFormats: "PNG=Export as PNG|PDF=Export as PDF",
      },
    },
  });

  const [dataSource, setDataSource] = useState("repos");
  const [ds, setds] = useState(buildChartProps(defaultChartTheme, DATA_SOURCES.repos.caption));
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(defaultChartTheme);
  const [includeForks, setIncludeForks] = useState(false);

  const getDefaultEndDate = () => {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    return today.toISOString().split("T")[0];
  };

  const getDefaultStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 60);
    return date.toISOString().split("T")[0];
  };

  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());

  // Sync chart theme with app theme
  useEffect(() => {
    setTheme(defaultChartTheme);
    setds((prevDs) => ({
      ...prevDs,
      dataSource: {
        ...prevDs.dataSource,
        chart: {
          ...prevDs.dataSource.chart,
          theme: defaultChartTheme,
        },
      },
    }));
  }, [appTheme]);

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    const options = { ...ds };
    options.dataSource.chart.theme = event.target.value;
    setds(options);
  };

  const handleIncludeForksChange = (event) => {
    setIncludeForks(event.target.checked);
  };

  const handleDataSourceChange = (_event, newValue) => {
    if (newValue !== null) {
      setDataSource(newValue);
    }
  };

  const updateGraph = (history, source) => {
    const cfg = DATA_SOURCES[source];
    const options = buildChartProps(theme, cfg.caption);

    const fusionTable = new FusionCharts.DataStore().createDataTable(
      history,
      cfg.schema
    );

    options.dataSource.data = fusionTable;
    options.dataSource.chart.exportFileName = `${cfg.exportPrefix}-${startDate}-to-${endDate}`;

    setds(options);
  };

  const fetchData = async (source) => {
    const cfg = DATA_SOURCES[source];
    setLoading(true);

    let fetchUrl = `${HOST}/${cfg.endpoint}?startDate=${startDate}&endDate=${endDate}`;
    if (source === "repos") {
      fetchUrl += `&includeForks=${includeForks}`;
    }

    fetch(fetchUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setLoading(false);
        const history = data[cfg.responseKey];
        updateGraph(history, source);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
        setLoading(false);
        toast.error("Error fetching data. Please try again later.", {
          position: toast.POSITION.BOTTOM_CENTER,
        });
      });
  };

  // Fetch on initial mount
  useEffect(() => {
    fetchData(dataSource);
  }, []);

  // Re-fetch when data source changes
  useEffect(() => {
    fetchData(dataSource);
  }, [dataSource]);

  const handleClick = async () => {
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("Start date must be before end date", {
        position: toast.POSITION.BOTTOM_CENTER,
      });
      return;
    }

    fetchData(dataSource);
  };

  const cfg = DATA_SOURCES[dataSource];

  return (
    <div style={{ background: currentTheme.background, minHeight: "100vh", padding: "20px" }}>
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
        theme={appTheme}
      />

      {/* Header Card */}
      <div
        style={{
          background: currentTheme.cardGradient,
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "24px",
          border: `1px solid ${currentTheme.cardBorder}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: "700",
                color: currentTheme.textPrimary,
              }}
            >
              GitHub Global Activity
            </h1>
            <p
              style={{
                margin: "8px 0 0 0",
                fontSize: "14px",
                color: currentTheme.textMuted,
              }}
            >
              {cfg.description}
            </p>
          </div>
          <ToggleButtonGroup
            value={dataSource}
            exclusive
            onChange={handleDataSourceChange}
            size="small"
          >
            <ToggleButton value="repos">New Repos</ToggleButton>
            <ToggleButton value="prs">New PRs</ToggleButton>
          </ToggleButtonGroup>
        </div>
      </div>

      {/* Controls Card */}
      <div
        style={{
          background: currentTheme.cardGradient,
          borderRadius: "16px",
          padding: "20px 24px",
          marginBottom: "24px",
          border: `1px solid ${currentTheme.cardBorder}`,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <TextField
          style={{ width: "200px" }}
          label="Start Date"
          type="date"
          variant="outlined"
          size="small"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          style={{ width: "200px" }}
          label="End Date"
          type="date"
          variant="outlined"
          size="small"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        {cfg.showIncludeForks && (
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
        )}
        <LoadingButton
          size="small"
          onClick={handleClick}
          endIcon={<SendIcon />}
          loading={loading}
          loadingPosition="end"
          variant="contained"
        >
          <span>Fetch</span>
        </LoadingButton>
        <FormControl size="small" style={{ minWidth: "110px" }}>
          <InputLabel id="theme-select-label">Theme</InputLabel>
          <Select
            labelId="theme-select-label"
            id="theme-select"
            value={theme}
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

      {/* Chart Card */}
      <div
        style={{
          background: currentTheme.cardGradient,
          borderRadius: "16px",
          padding: "24px",
          border: `1px solid ${currentTheme.cardBorder}`,
          minHeight: "500px",
        }}
      >
        {ds != null && ds.dataSource.data && (
          <ReactFC {...ds} />
        )}
      </div>
    </div>
  );
}

export default NewReposTimeSeriesChart;
