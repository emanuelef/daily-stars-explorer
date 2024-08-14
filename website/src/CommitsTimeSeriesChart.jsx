/* eslint-disable no-case-declarations */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tooltip from "@mui/material/Tooltip";
import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import LoadingButton from "@mui/lab/LoadingButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SendIcon from "@mui/icons-material/Send";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema-commits";
import { parseISO, intervalToDuration } from "date-fns";
import { parseGitHubRepoURL } from "./githubUtils";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import UmberTheme from "fusioncharts/themes/fusioncharts.theme.umber";
import GitHubButton from "react-github-btn";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  addRunningMedian,
  addRunningAverage,
  addLOESS,
  calculatePercentiles,
} from "./utils";

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
  "Stars are fetched until UTC midnight of the previous day. \
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

function CommitsTimeSeriesChart() {
  let defaultRepo = "helm/helm";
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

  const chart_props = {
    type: "timeseries",
    width: "100%",
    height: "88%",
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
            "background-color": "#75748D",
          },
          text: {
            color: "#FFFFFF",
          },
        },
      },
      yAxis: [
        {
          plot: {
            value: "Daily Commits",
            type: "line",
          },
          title: "Daily Commits",
          aggregation: "average",
          referenceline: [],
          type: "", // can be log
        },
        {
          plot: {
            value: "Total Commits",
            type: "line",
          },
          title: "Total Commits",
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

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const [ds, setds] = useState(chart_props);

  const [totalStars, setTotalStars] = useState(0);
  const [creationDate, setCreationDate] = useState("2021-01-01");
  const [age, setAge] = useState("");
  const [branch, setBranch] = useState("");
  const [currentCommitsHistory, setCurrentCommitsHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForceRefetch, setShowForceRefetch] = useState(false);
  const [forceRefetch, setForceRefetch] = useState(false);

  const [theme, setTheme] = useState("candy");

  const [transformation, setTransformation] = useState(
    queryParams.get("transformation") || "none"
  );

  const [aggregation, setAggregation] = useState("average");

  const [selectedTimeRange, setSelectedTimeRange] = useState({
    start: queryParams.get("start"),
    end: queryParams.get("end"),
  });

  const navigate = useNavigate();

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [checkedDateRange, setCheckedDateRange] = useState(false);

  const currentSSE = useRef(null);

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
    updateGraph(currentCommitsHistory);
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
          "Daily Commits";
        options.dataSource.yAxis[0].plot.type = "line";
        options.dataSource.subcaption = "";
        break;
      case "yearlyBinning":
        textBinning = `Daily Commits ${aggregation} by Year`;
        if (aggregation == "sum") {
          textBinning = "Total Commits by Year";
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

  const fetchAllCommits = async (repo, ignoreForceRefetch = false) => {
    console.log(repo);

    setCurrentCommitsHistory([]);

    let fetchUrl = `${HOST}/allCommits?repo=${repo}`;

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
        const starHistory = data.commits;
        setBranch(data.defaultBranch)
        setCurrentCommitsHistory(starHistory);
        updateGraph(starHistory);
        const options = { ...ds };
        options.dataSource.caption = { text: `Commits ${repo} on branch ${data.defaultBranch}` };

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
          fetchAllCommits(repo, true);
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
      setCreationDate(res.createdAt);

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
      fetchAllCommits(repoParsed);
    }

    const callsNeeded = Math.floor(res.stars / 100);
    startSSEUpates(repoParsed, callsNeeded, status.onGoing);
  };

  const handleInputChange = async (event, setStateFunction) => {
    const inputText = event.target.value;
    setStateFunction(inputText);
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
      <div style={{ display: "flex", alignItems: "center" }}>
        <TextField
          style={{
            marginTop: "20px",
            marginRight: "20px",
            marginLeft: "10px",
            width: "500px",
          }}
          label="Enter a GitHub repository"
          variant="outlined"
          size="small"
          value={selectedRepo}
          onChange={(e) => handleInputChange(e, setSelectedRepo)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleClick();
            }
          }}
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
        {showForceRefetch && (
          <Tooltip title={FORCE_REFETCH_TOOLTIP}>
            <FormControlLabel
              style={{
                marginTop: "20px",
              }}
              control={
                <Checkbox
                  checked={forceRefetch}
                  onChange={handleForceRefetchChange}
                  name="forceRefetch"
                />
              }
              label="Force Refetch"
            />
          </Tooltip>
        )}
        <Tooltip title={INFO_TOOLTIP}>
          <InfoOutlinedIcon
            style={{ marginTop: "20px", marginRight: "10px", color: "grey" }}
          />
        </Tooltip>
        <TextField
          style={{
            marginTop: "20px",
            marginRight: "10px",
            marginLeft: "10px",
            width: "90px",
          }}
          size="small"
          id="total-stars"
          label="⭐ Total"
          value={totalStars}
          InputProps={{
            readOnly: true,
          }}
        />
        <TextField
          style={{
            marginTop: "20px",
            marginRight: "10px",
            marginLeft: "10px",
            width: "210px",
          }}
          size="small"
          id="creation-date"
          label="Creation Date"
          value={creationDate}
          InputProps={{
            readOnly: true,
          }}
        />
        <TextField
          style={{
            marginTop: "20px",
            marginRight: "10px",
            marginLeft: "10px",
            width: "120px",
          }}
          size="small"
          id="age"
          label="Age"
          value={age}
          InputProps={{
            readOnly: true,
          }}
        />
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

        {/*      <CopyToClipboardButton
          style={{
            marginLeft: "10px",
            marginRight: "30px",
          }}
          dateRange={checkedDateRange ? selectedTimeRange : null}
          transformation={transformation}
        />
        <Tooltip title={INCLUDE_DATE_RANGE}>
          {
            <Checkbox
              checked={checkedDateRange}
              onChange={handleDateRangeCheckChange}
              inputProps={{ "aria-label": "controlled" }}
            />
          }
        </Tooltip>
        <Typography variant="body2">With Date Range</Typography> */}
        <Button
          style={{
            marginLeft: "10px",
          }}
          size="small"
          variant="contained"
          onClick={openCurrentRepoPage}
        >
          Open GH repo
        </Button>
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
      {/*       <EstimatedTimeProgress
        text="Estimated Time Left"
        totalTime={estimatedTime}
      />
      <ProgressBar value={progressValue} max={maxProgress} /> */}
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

export default CommitsTimeSeriesChart;
