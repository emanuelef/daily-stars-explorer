/* eslint-disable no-case-declarations */
import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tooltip from "@mui/material/Tooltip";
import Autocomplete from "@mui/material/Autocomplete";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import LoadingButton from "@mui/lab/LoadingButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SendIcon from "@mui/icons-material/Send";
import Box from "@mui/material/Box";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema-contributors";
import { parseISO, intervalToDuration } from "date-fns";
import { parseGitHubRepoURL } from "./githubUtils";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import UmberTheme from "fusioncharts/themes/fusioncharts.theme.umber";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  addRunningMedian,
  addRunningAverage,
  addLOESS,
  calculatePercentiles,
} from "./utils";
import { useAppTheme } from "./ThemeContext";

const HOST = import.meta.env.VITE_HOST;

const YEARLY_BINNING = {
  year: [1],
  month: [],
  day: [],
  week: [],
  hour: [],
  minute: [],
  second: [],
};

const MONTHLY_BINNING = {
  year: [],
  month: [1],
  day: [],
  week: [],
  hour: [],
  minute: [],
  second: [],
};

const WEEKLY_BINNING = {
  year: [],
  month: [],
  day: [],
  week: [1],
  hour: [],
  minute: [],
  second: [],
};

ReactFC.fcRoot(
  FusionCharts,
  TimeSeries,
  GammelTheme,
  CandyTheme,
  ZuneTheme,
  UmberTheme
);

const formatDate = (originalDate) => {
  const parts = originalDate.split("-");
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const FORCE_REFETCH_TOOLTIP =
  "Using cached data, force refetching the data from GitHub. This will take a while if the repo has a lot of stars.";

const INFO_TOOLTIP =
  "Data is fetched until UTC midnight of the previous day. \
   You can zoom inside the graph by scrolling up and down or dragging the selectors in the underline graph. \
   Once fetched the history is kept for 7 days but it's possible to refetch again by checking the Force Refetch checkbox.";


const isToday = (dateString) => {
  const today = new Date();
  const [day, month, year] = dateString.split("-").map(Number);
  return (
    today.getDate() === day &&
    today.getMonth() + 1 === month && // Adding 1 to month because JavaScript months are 0-indexed
    today.getFullYear() === year
  );
};

function ContributorsTimeSeriesChart() {
  let defaultRepo = "helm/helm";
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

  const { theme: appTheme, currentTheme } = useAppTheme();
  const defaultChartTheme = appTheme === 'dark' ? 'candy' : 'fusion';

  const chart_props = {
    type: "timeseries",
    width: "100%",
    height: "80%",
    dataEmptyMessage: "Fetching data...",
    styleDefinition: {
      colorstyle: {
        fill: "#ffff00", //color of the reference line
      },
    },
    dataSource: {
      tooltip: {
        style: {
          container: {
            "border-color": "#000000",
            "background-color": "#1a1a1a",
            boxShadow: "0 4px 8px rgba(0,0,0,0.2)"
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
              "stroke-width": "2.5"
            }
          }
        }
      },
      yAxis: [
        {
          plot: {
            value: "Daily New Contributors",
            type: "line",
          },
          title: "Daily New Contributors",
          aggregation: "average",
          referenceline: [],
          type: "", // can be log
        },
        {
          plot: {
            value: "Total Contributors",
            type: "line",
          },
          title: "Total Contributors",
        },
      ],
      xAxis: {
        plot: "Time",
        timemarker: [],
        binning: {},
      },
      chart: {
        animation: "0",
        theme: defaultChartTheme,
        paletteColors: "#3b82f6, #f59e0b, #10b981, #ec4899, #8b5cf6",
        exportEnabled: "1",
        exportMode: "client",
        exportFormats: "PNG=Export as PNG|PDF=Export as PDF",
      },
    },
  };

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const [ds, setds] = useState(chart_props);

  const [totalStars, setTotalStars] = useState(0);
  const [creationDate, setCreationDate] = useState("2021-01-01");
  const [age, setAge] = useState("");
  const [currentContributorsHistory, setCurrentContributorsHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForceRefetch, setShowForceRefetch] = useState(false);
  const [forceRefetch, setForceRefetch] = useState(false);

  const [theme, setTheme] = useState(defaultChartTheme);

  // Sync chart theme with app theme
  useEffect(() => {
    setTheme(defaultChartTheme);
    setds(prevDs => ({
      ...prevDs,
      dataSource: {
        ...prevDs.dataSource,
        chart: {
          ...prevDs.dataSource.chart,
          theme: defaultChartTheme
        }
      }
    }));
  }, [appTheme]);

  const [transformation, setTransformation] = useState(
    queryParams.get("transformation") || "none"
  );

  const [aggregation, setAggregation] = useState("average");

  const [selectedTimeRange, setSelectedTimeRange] = useState({
    start: queryParams.get("start"),
    end: queryParams.get("end"),
  });

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [checkedDateRange, setCheckedDateRange] = useState(false);
  const [starsRepos, setStarsRepos] = useState([]);

  const currentSSE = useRef(null);

  // Fetch available repos for autocomplete
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

  const downloadCSV = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    const downloadUrl = `${HOST}/allContributors?repo=${repoParsed}`;

    fetch(downloadUrl)
      .then((response) => response.json())
      .then((data) => {
        if (!data.contributors || !Array.isArray(data.contributors)) {
          throw new Error("Invalid contributors data format");
        }

        // Convert data to CSV format
        let csvContent = "date,day-contributors,total-contributors\n";
        data.contributors.forEach(contributor => {
          csvContent += `${contributor[0]},${contributor[1]},${contributor[2]}\n`;
        });

        // Create and download CSV file
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${repoParsed.replace("/", "_")}-contributors-history.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Error downloading CSV:", error);
      });
  };

  const downloadJSON = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    const downloadUrl = `${HOST}/allContributors?repo=${repoParsed}`;

    fetch(downloadUrl)
      .then((response) => response.json())
      .then((data) => {
        const contributorsContent = JSON.stringify(data.contributors);
        const blob = new Blob([contributorsContent], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${repoParsed.replace("/", "_")}-contributors-history.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Error downloading JSON:", error);
      });
  };

  const handleDateRangeCheckChange = (event) => {
    setCheckedDateRange(event.target.checked);
  };

  const handleYAxisTypeCheckChange = (event) => {
    setCheckedYAxisType(event.target.checked);
    const options = { ...ds };
    options.dataSource.yAxis[0].type = event.target.checked ? "log" : "";
    setds(options);
  };

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    const options = { ...ds };
    options.dataSource.chart.theme = event.target.value;
    setds(options);
  };

  const handleTransformationChange = (event) => {
    setTransformation(event.target.value);
  };

  const handleAggregationChange = (event) => {
    setAggregation(event.target.value);
    const options = { ...ds };
    options.dataSource.yAxis[0].aggregation = event.target.value;

    let text = `${event.target.value} Stars`;

    options.dataSource.yAxis[0].plot.value =
      schema[1].name =
      options.dataSource.yAxis[0].title =
      text;

    setds(options);
  };

  useEffect(() => {
    updateGraph(currentContributorsHistory);
  }, [transformation]);

  const handleForceRefetchChange = (event) => {
    setForceRefetch(event.target.checked);
  };

  const fetchTotalStars = async (repo) => {
    try {
      const response = await fetch(`${HOST}/totalStars?repo=${repo}`);

      if (!response.ok) {
        setLoading(false);
        toast.error("Internal Server Error. Please try again later.", {
          position: toast.POSITION.BOTTOM_CENTER,
        });
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
    }
  };

  const fetchStatus = async (repo) => {
    try {
      const response = await fetch(`${HOST}/status?repo=${repo}`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
    }
  };

  const updateGraph = async (starHistory) => {
    // check if last element is today
    if (starHistory.length > 1) {
      const lastElement = starHistory[starHistory.length - 1];
      console.log(lastElement);
      console.log(starHistory);
      const isLastElementToday = isToday(lastElement[0]);
      starHistory.pop(); // remove last element as the current day is not complete
      console.log("isLastElementToday", isLastElementToday);
      setShowForceRefetch(!isLastElementToday);
      setForceRefetch(false);
    } else {
      console.log("Array is empty.");
    }

    let appliedTransformationResult = starHistory;
    let binning = {};

    const options = { ...ds };

    console.log(starHistory.length);

    options.dataSource.subcaption = "";
    options.dataSource.yAxis[0].referenceline = [];
    options.dataSource.yAxis[0].aggregation = "average";

    let textBinning = "";

    //console.log(res);
    switch (transformation) {
      case "none":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Daily New Contributors";
        options.dataSource.yAxis[0].plot.type = "line";
        options.dataSource.subcaption = "";
        break;
      case "yearlyBinning":
        textBinning = `Daily New Contributors ${aggregation} by Year`;
        if (aggregation == "sum") {
          textBinning = "Total Contributors by Year";
        }

        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          textBinning;

        binning = YEARLY_BINNING;
        options.dataSource.yAxis[0].plot.type = "column";
        options.dataSource.yAxis[0].aggregation = aggregation;
        break;
      case "monthlyBinning":
        textBinning = `Daily Opened ${aggregation} by Month`;
        if (aggregation == "sum") {
          textBinning = "Total Opened by Year";
        }

        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          textBinning;
        binning = MONTHLY_BINNING;
        options.dataSource.yAxis[0].plot.type = "column";
        options.dataSource.yAxis[0].aggregation = aggregation;
        break;
      case "weeklyBinning":
        textBinning = `Daily Opened ${aggregation} by Week`;
        if (aggregation == "sum") {
          ("Total Opened by Year");
        }
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          textBinning;
        binning = WEEKLY_BINNING;
        options.dataSource.yAxis[0].plot.type = "column";
        options.dataSource.yAxis[0].aggregation = aggregation;
        break;
      case "normalize":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Normalized";

        const [median, highPercentile] = calculatePercentiles(
          starHistory
            .filter((subArray) => subArray[1] > 0)
            .map((subArray) => subArray[1]),
          0.5,
          0.98
        );

        console.log(median, highPercentile);

        appliedTransformationResult = starHistory.map((subArray) => {
          if (subArray[1] > highPercentile) {
            return [subArray[0], highPercentile, subArray[2]];
          }
          return subArray;
        });
        options.dataSource.yAxis[0].plot.type = "line";

        options.dataSource.yAxis[0].referenceline = [
          {
            label: "Median",
            value: median,
          },
        ];

        break;
      case "loess":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "LOESS";
        appliedTransformationResult = addLOESS(starHistory, 0.08);
        options.dataSource.yAxis[0].plot.type = "line";

        /*         options.dataSource.xAxis.initialinterval = {
          from: "01-01-2022",
          to: "01-01-2023",
        }; */

        break;
      case "runningAverage":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Running Average";
        appliedTransformationResult = addRunningAverage(starHistory, 120);
        options.dataSource.yAxis[0].plot.type = "line";
        break;
      case "runningMedian":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Running Median";
        appliedTransformationResult = addRunningMedian(starHistory, 120);
        options.dataSource.yAxis[0].plot.type = "line";
        break;
      default:
        break;
    }

    const fusionTable = new FusionCharts.DataStore().createDataTable(
      appliedTransformationResult,
      schema
    );

    options.dataSource.data = fusionTable;

    options.dataSource.xAxis.binning = binning;
    options.dataSource.chart.theme = theme;
    options.dataSource.chart.exportFileName = `${selectedRepo.replace(
      "/",
      "_"
    )}-stars-history`;

    console.log(options.dataSource.yAxis);

    setds(options);
  };

  const fetchAllContributors = async (repo, ignoreForceRefetch = false) => {
    console.log(repo);

    setCurrentContributorsHistory([]);

    let fetchUrl = `${HOST}/allContributors?repo=${repo}`;

    if (forceRefetch && !ignoreForceRefetch) {
      fetchUrl += "&forceRefetch=true";
    }

    fetch(fetchUrl)
      .then((response) => {
        // Check if the response status indicates success (e.g., 200 OK)
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        // Attempt to parse the response as JSON
        return response.json();
      })
      .then((data) => {
        setLoading(false);
        console.log(data);
        const starHistory = data.contributors;
        setCurrentContributorsHistory(starHistory);
        updateGraph(starHistory);
        const options = { ...ds };
        options.dataSource.caption = { text: `Contributors ${repo}` };

        setds(options);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
        setLoading(false);
      });
  };

  const openCurrentRepoPage = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    window.open("https://github.com/" + repoParsed, "_blank");
  };

  const closeSSE = () => {
    if (currentSSE.current) {
      console.log("STOP SSE");
      currentSSE.current.close();
    }
  };

  const startSSEUpates = (repo, callsNeeded, onGoing) => {
    console.log(repo, callsNeeded, onGoing);
    const sse = new EventSource(`${HOST}/sse?repo=${repo}`);
    closeSSE();
    currentSSE.current = sse;

    sse.onerror = (err) => {
      console.log("on error", err);
    };

    // The onmessage handler is called if no event name is specified for a message.
    sse.onmessage = (msg) => {
      console.log("on message", msg);
    };

    sse.onopen = (...args) => {
      console.log("on open", args);
    };

    sse.addEventListener("current-value", (event) => {
      const parsedData = JSON.parse(event.data);
      const currentValue = parsedData.data;

      // console.log("currentValue", currentValue, callsNeeded);

      if (currentValue === callsNeeded) {
        console.log("CLOSE SSE");
        closeSSE();
        //if (onGoing) {
        setTimeout(() => {
          fetchAllContributors(repo, true);
        }, 1600);
        //}
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    handleClick();
  }, []);

  const handleClick = async () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);

    if (repoParsed === null) {
      return;
    }

    setLoading(true);

    const res = await fetchTotalStars(repoParsed);
    // console.log(res);

    if (res) {
      setTotalStars(res.stars);
      setCreationDate(res.createdAt.split('T')[0]);

      const { years, months, days } = intervalToDuration({
        start: parseISO(res.createdAt),
        end: Date.now(),
      });
      setAge(
        `${years && years !== 0 ? `${years}y ` : ""}${months && months !== 0 ? `${months}m ` : ""
        }${days && days !== 0 ? `${days}d ` : ""}`
      );
    }

    const status = await fetchStatus(repoParsed);
    console.log(status);

    if (!status.onGoing) {
      fetchAllContributors(repoParsed);
    }

    const callsNeeded = Math.floor(res.stars / 100);
    startSSEUpates(repoParsed, callsNeeded, status.onGoing);
  };

  const handleClickWithRepo = async (repo) => {
    const repoParsed = parseGitHubRepoURL(repo);
    if (repoParsed === null) return;
    setSelectedRepo(repo);

    setLoading(true);
    const res = await fetchTotalStars(repoParsed);
    if (res) {
      setTotalStars(res.stars);
      setCreationDate(res.createdAt.split('T')[0]);
      const { years, months, days } = intervalToDuration({
        start: parseISO(res.createdAt),
        end: Date.now(),
      });
      setAge(`${years && years !== 0 ? `${years}y ` : ""}${months && months !== 0 ? `${months}m ` : ""}${days && days !== 0 ? `${days}d ` : ""}`);
    }
    const status = await fetchStatus(repoParsed);
    if (!status.onGoing) {
      fetchAllContributors(repoParsed);
    }
    const callsNeeded = Math.floor(res.stars / 100);
    startSSEUpates(repoParsed, callsNeeded, status.onGoing);
  };

  return (
    <div style={{ background: currentTheme.background, minHeight: '100vh', padding: '10px' }}>
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

      {/* Main Controls */}
      <div style={{
        background: currentTheme.cardGradient,
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '10px',
        border: `1px solid ${currentTheme.cardBorder}`,
      }}>
        <Box sx={{ display: "flex", gap: 1.2, flexWrap: "wrap", alignItems: "center" }}>
          <Autocomplete
            freeSolo
            disablePortal
            id="combo-box-repo"
            size="small"
            options={starsRepos.map((el) => ({ label: el }))}
            renderInput={(params) => (
              <TextField
                {...params}
                sx={{ width: 400 }}
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
          {showForceRefetch && (
            <Tooltip title={FORCE_REFETCH_TOOLTIP}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={forceRefetch}
                    onChange={handleForceRefetchChange}
                    name="forceRefetch"
                  />
                }
                label="Update"
              />
            </Tooltip>
          )}
          <Tooltip title={INFO_TOOLTIP}>
            <InfoOutlinedIcon sx={{ color: "grey" }} />
          </Tooltip>
          <TextField
            sx={{ width: 100 }}
            size="small"
            label="⭐ Total"
            value={totalStars.toLocaleString()}
            InputProps={{ readOnly: true }}
          />
          <TextField
            sx={{ width: 130 }}
            size="small"
            label="Creation Date"
            value={creationDate}
            InputProps={{ readOnly: true }}
          />
          <TextField
            sx={{ width: 120 }}
            size="small"
            label="Age"
            value={age}
            InputProps={{ readOnly: true }}
          />
        </Box>
      </div>

      {/* Controls & Actions */}
      <div style={{
        background: currentTheme.cardGradient,
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '10px',
        border: `1px solid ${currentTheme.cardBorder}`,
      }}>
        <Box sx={{ display: "flex", gap: 1.2, flexWrap: "wrap", alignItems: "center" }}>
          <FormControl sx={{ width: 110 }} size="small">
            <InputLabel>Theme</InputLabel>
            <Select value={theme} label="Theme" onChange={handleThemeChange}>
              <MenuItem value={"fusion"}>Fusion</MenuItem>
              <MenuItem value={"candy"}>Candy</MenuItem>
              <MenuItem value={"gammel"}>Gammel</MenuItem>
              <MenuItem value={"zune"}>Zune</MenuItem>
              <MenuItem value={"umber"}>Umber</MenuItem>
            </Select>
          </FormControl>
          <Button size="small" variant="outlined" onClick={downloadCSV}>CSV</Button>
          <Button size="small" variant="outlined" onClick={downloadJSON}>JSON</Button>
          <Button size="small" variant="outlined" onClick={openCurrentRepoPage}>Open Repo</Button>
        </Box>
      </div>

      {/* Chart Container */}
      <div style={{
        background: currentTheme.cardGradient,
        borderRadius: '12px',
        padding: '12px 16px',
        border: `1px solid ${currentTheme.cardBorder}`,
      }}>
        <Box id="chart-container">
          {ds != null && ds != chart_props && ds && ds.dataSource.data && (
            <ReactFC {...ds} />
          )}
        </Box>
      </div>
    </div>
  );
}

export default ContributorsTimeSeriesChart;
