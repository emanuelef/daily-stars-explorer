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
import GitHubCorners from "@uiw/react-github-corners";
import { ResponsiveCalendar } from "@nivo/calendar";

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

const calculateMedian = (arr) => {
  // Sort the array in ascending order
  arr.sort(function (a, b) {
    return a - b;
  });

  const middle = Math.floor(arr.length / 2);

  if (arr.length % 2 === 0) {
    // If the array has an even number of elements, calculate the average of the two middle elements
    return (arr[middle - 1] + arr[middle]) / 2;
  } else {
    // If the array has an odd number of elements, the median is the middle element
    return arr[middle];
  }
};

const calculatePercentile = (arr, percentile) => {
  // Sort the array in ascending order
  arr.sort(function (a, b) {
    return a - b;
  });

  const n = arr.length;

  if (n === 0 || percentile < 0 || percentile > 1) {
    return undefined; // Invalid input
  }

  const index = (n - 1) * percentile;

  if (Number.isInteger(index)) {
    // If the index is an integer, return the element at that index
    return arr[index];
  } else {
    // If the index is a fraction, interpolate between the elements
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    const lowerValue = arr[lowerIndex];
    const upperValue = arr[upperIndex];
    const fraction = index - lowerIndex;
    return lowerValue + fraction * (upperValue - lowerValue);
  }
};

function TimeSeriesChart() {
  let defaultRepo = "helm/helm-mapkubeapis";
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

  const [dataCalendar, setDataCalendar] = useState([]);

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

        let testCalendarData = data.map((el) => {
          let parts = el[0].split("-");
          return {
            value: el[1],
            day: parts[2] + "-" + parts[1] + "-" + parts[0],
          };
        });

        setDataCalendar(testCalendarData);
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

    const status = await fetchStatus(repoParsed);
    console.log(status);

    setProgressValue(0);
    setMaxProgress(0);

    if (!status.onGoing) {
      fetchAllStars(repoParsed);
    }

    if (!status.cached) {
      let timeEstimate = res.stars / 610;
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
      <GitHubCorners
        position="right"
        href="https://github.com/emanuelef/gh-repo-stats-server"
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
            marginRight: "20px",
            marginLeft: "10px",
            width: "100px",
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
            marginRight: "20px",
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
            width: "150px",
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
            Star
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
      <div style={{ display: "flex", height: "200vh" }}>
        <ResponsiveCalendar
          theme={{
            background: "#ffffff",
            text: {
              fontSize: 18,
              fill: "#333333",
              outlineWidth: 0,
              outlineColor: "transparent",
            },
            tooltip: {
              container: {
                background: "#000000",
                fontSize: 12,
              },
              basic: {
                // Set the text color to black for the tooltip
                fontSize: 12,
                fill: "#ff0000",
              },
              chip: {},
              table: {},
              tableCell: {},
              tableCellValue: {},
            },
          }}
          data={dataCalendar}
          from={dataCalendar.length ? dataCalendar[0].day : ""}
          to={
            dataCalendar.length ? dataCalendar[dataCalendar.length - 1].day : ""
          }
          emptyColor="#dddddd"
          colors={["#61cdbb", "#97e3d5", "#e8c1a0", "#f47560"]}
          minValue={0}
          maxValue={calculatePercentile(
            dataCalendar.map((el) => el.value),
            0.95
          )}
          margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
          yearSpacing={40}
          monthBorderColor="#000000"
          dayBorderWidth={2}
          dayBorderColor="#ffffff"
          legends={[
            {
              anchor: "bottom-right",
              direction: "row",
              translateY: 36,
              itemCount: 4,
              itemWidth: 42,
              itemHeight: 36,
              itemsSpacing: 14,
              itemDirection: "right-to-left",
            },
          ]}
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
}

export default TimeSeriesChart;

// https://img.shields.io/github/stars/emanuelef/gh-repo-stats-server
