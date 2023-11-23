import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import SendIcon from "@mui/icons-material/Send";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema";
import EstimatedTimeProgress from "./EstimatedTimeProgress";
import ProgressBar from "./ProgressBar";
import { parseISO, intervalToDuration } from "date-fns";
import { parseGitHubRepoURL } from "./githubUtils";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import CopyToClipboardButton from "./CopyToClipboardButton";
import GitHubButton from "react-github-btn";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const HOST = import.meta.env.VITE_HOST;

ReactFC.fcRoot(FusionCharts, TimeSeries, GammelTheme, CandyTheme, ZuneTheme);
const chart_props = {
  timeseriesDs: {
    type: "timeseries",
    width: "100%",
    height: "80%",
    dataEmptyMessage: "Fetching data...",
    dataSource: {
      caption: { text: "Stars" },
      data: null,
      yAxis: [
        {
          plot: [
            {
              value: "New Stars",
            },
          ],
        },
      ],
      chart: {
        animation: "0",
        theme: "candy",
        exportEnabled: "1",
        exportMode: "client",
        exportFormats: "PNG=Export as PNG|PDF=Export as PDF",
      },
    },
  },
};

const FORCE_REFETCH_TOOLTIP =
  "Using cached data, force refetching the data from GitHub. This will take a while if the repo has a lot of stars.";

const isToday = (dateString) => {
  const today = new Date();
  const [day, month, year] = dateString.split("-").map(Number);
  return (
    today.getDate() === day &&
    today.getMonth() + 1 === month && // Adding 1 to month because JavaScript months are 0-indexed
    today.getFullYear() === year
  );
};

function TimeSeriesChart() {
  let defaultRepo = "kubernetes/kubernetes";
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

  const [ds, setds] = useState(chart_props);

  const [estimatedTime, setEstimatedTime] = useState(0);
  const [totalStars, setTotalStars] = useState(0);
  const [creationDate, setCreationDate] = useState("2021-01-01");
  const [age, setAge] = useState("");
  const [progressValue, setProgressValue] = useState(0);
  const [maxProgress, setMaxProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForceRefetch, setShowForceRefetch] = useState(false);
  const [forceRefetch, setForceRefetch] = useState(false);

  const [theme, setTheme] = useState("candy");

  const navigate = useNavigate();

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);

  const currentSSE = useRef(null);

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    const options = { ...ds };
    options.timeseriesDs.dataSource.chart.theme = event.target.value;
    setds(options);
  };

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

  const fetchAllStars = (repo) => {
    console.log(repo);
    let fetchUrl = `${HOST}/allStars?repo=${repo}`;

    if (forceRefetch) {
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

        // check if last element is today
        if (data.length > 1) {
          const lastElement = data[data.length - 1];
          console.log(lastElement[0]);
          console.log(data);
          const isLastElementToday = isToday(lastElement[0]);
          data.pop(); // remove last element as the current day is not complete
          console.log("isLastElementToday", isLastElementToday);
          setShowForceRefetch(!isLastElementToday);
          setForceRefetch(false);
        } else {
          console.log("Array is empty.");
        }

        const fusionTable = new FusionCharts.DataStore().createDataTable(
          data,
          schema
        );
        const options = { ...ds };
        options.timeseriesDs.dataSource.caption = { text: `Stars ${repo}` };
        options.timeseriesDs.dataSource.data = fusionTable;
        options.timeseriesDs.dataSource.yAxis[0].plot[0].value =
          "Cumulative Stars";
        options.timeseriesDs.dataSource.chart.theme = theme;
        options.timeseriesDs.dataSource.chart.exportFileName = `${selectedRepo.replace(
          "/",
          "_"
        )}-stars-history`;
        setds(options);

        console.log(data);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
        setLoading(false);
      });
  };

  const downloadCSV = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    const downloadUrl = `${HOST}/allStarsCsv?repo=${repoParsed}`;

    fetch(downloadUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${repoParsed.replace("/", "_")}-stars-history.csv`;
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
    const downloadUrl = `${HOST}/allStars?repo=${repoParsed}`;

    fetch(downloadUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${repoParsed.replace("/", "_")}-stars-history.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Error downloading JSON:", error);
      });
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
      setProgressValue(currentValue);

      if (currentValue === callsNeeded) {
        console.log("CLOSE SSE");
        closeSSE();
        //if (onGoing) {
        setTimeout(() => {
          fetchAllStars(repo);
        }, 1200);
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

    navigate(`/${repoParsed}`, {
      replace: false,
    });

    if (repoParsed === null) {
      return;
    }

    setLoading(true);

    const res = await fetchTotalStars(repoParsed);
    console.log(res);

    if (res) {
      setTotalStars(res.stars);
      setCreationDate(res.createdAt);

      const { years, months, days } = intervalToDuration({
        start: parseISO(res.createdAt),
        end: Date.now(),
      });
      setAge(
        `${years !== 0 ? `${years}y ` : ""}${
          months !== 0 ? `${months}m ` : ""
        }${days}d`
      );
    }

    const status = await fetchStatus(repoParsed);
    console.log(status);

    setProgressValue(0);
    setMaxProgress(0);

    if (!status.onGoing) {
      fetchAllStars(repoParsed);
    }

    if (!status.cached) {
      let timeEstimate = res ? res.stars / 610 : 0;
      timeEstimate = Math.max(1, Math.ceil(timeEstimate));
      setEstimatedTime(timeEstimate);
    }

    const callsNeeded = Math.floor(res.stars / 100);
    setMaxProgress(callsNeeded);
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
        <TextField
          style={{
            marginTop: "20px",
            marginRight: "10px",
            marginLeft: "10px",
            width: "90px",
          }}
          size="small"
          id="total-stars"
          label="Total Stars"
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
            width: "200px",
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
            marginRight: "20px",
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
            <InputLabel id="demo-simple-select-label">Theme</InputLabel>
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
            </Select>
          </FormControl>
        </div>
        <Button size="small" variant="contained" onClick={downloadCSV}>
          Download CSV
        </Button>
        <br />
        <Button
          style={{
            marginLeft: "10px",
          }}
          size="small"
          variant="contained"
          onClick={downloadJSON}
        >
          Download Json
        </Button>
        <CopyToClipboardButton />
        {showForceRefetch && (
          <Tooltip title={FORCE_REFETCH_TOOLTIP}>
            <FormControlLabel
              style={{
                marginLeft: "10px",
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
        <div
          style={{
            marginTop: "5px",
            marginLeft: "10px",
          }}
        >
          <GitHubButton
            href="https://github.com/emanuelef/gh-repo-stats-server"
            data-color-scheme="no-preference: dark; light: dark_dimmed; dark: dark_high_contrast;"
            data-size="large"
            data-show-count="true"
            aria-label="Star emanuelef/gh-repo-stats-server on GitHub"
          >
            Star Me
          </GitHubButton>
        </div>
      </div>
      <EstimatedTimeProgress
        text="Estimated Time Left"
        totalTime={estimatedTime}
      />
      <ProgressBar value={progressValue} max={maxProgress} />
      <div
        style={{
          marginLeft: "10px",
        }}
      >
        {ds != chart_props && <ReactFC {...ds.timeseriesDs} />}
      </div>
    </div>
  );
}

export default TimeSeriesChart;

// https://img.shields.io/github/stars/emanuelef/gh-repo-stats-server
