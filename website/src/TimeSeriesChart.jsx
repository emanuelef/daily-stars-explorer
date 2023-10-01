import React, { useState, useEffect, useRef } from "react";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import { Link } from "@mui/material";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema";
import EstimatedTimeProgress from "./EstimatedTimeProgress";
import ProgressBar from "./ProgressBar";

const HOST = import.meta.env.VITE_HOST;

const parseGitHubRepoURL = (url) => {
  // Define the regular expression pattern to match GitHub repository URLs
  const repoURLPattern =
    /^(?:https?:\/\/github.com\/)?(?:\/)?([^/]+)\/([^/]+)$/;

  // Use RegExp.exec to match the pattern against the URL
  const match = repoURLPattern.exec(url);

  if (match && match.length === 3) {
    const owner = match[1];
    const repoName = match[2];
    return `${owner}/${repoName}`;
  } else {
    return null; // Invalid URL
  }
};

ReactFC.fcRoot(FusionCharts, TimeSeries);
const chart_props = {
  timeseriesDs: {
    type: "timeseries",
    width: "1200",
    height: "800",
    dataEmptyMessage: "Fetching data...",
    dataSource: {
      caption: { text: "New stars per day" },
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
      },
    },
  },
};

function TimeSeriesChart() {
  const [ds, setds] = useState(chart_props);
  const [selectedRepo, setSelectedRepo] = useState("helm/helm-mapkubeapis");
  const [selectedValue, setSelectedValue] = useState("increment");
  const [result, setResult] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [totalStars, setTotalStars] = useState(0);
  const [creationDate, setCreationDate] = useState("2021-01-01");
  const [progressValue, setProgressValue] = useState(0);
  const [maxProgress, setMaxProgress] = useState(0);

  const currentSSE = useRef(null);

  const fetchTotalStars = async (repo) => {
    try {
      const response = await fetch(`${HOST}/totalStars?repo=${repo}`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
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
    fetch(`${HOST}/allStars?repo=${repo}`)
      .then((response) => {
        // Check if the response status indicates success (e.g., 200 OK)
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        // Attempt to parse the response as JSON
        return response.json();
      })
      .then((data) => {
        console.log(data);
        setResult(data);
        const fusionTable = new FusionCharts.DataStore().createDataTable(
          data,
          schema
        );
        const options = { ...ds };
        options.timeseriesDs.dataSource.data = fusionTable;
        options.timeseriesDs.dataSource.yAxis[0].plot[0].value =
          "Cumulative Stars";
        setds(options);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
      });
  };

  const downloadCSV = () => {
    // Replace 'your-backend-url' with the actual URL of your CSV download endpoint
    const downloadUrl = `${HOST}/allStarsCsv?repo=${selectedRepo}`;

    fetch(downloadUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedRepo.replace("/", "_")}-stars-history.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Error downloading CSV:", error);
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
        if (onGoing) {
          setTimeout(() => {
            fetchAllStars(repo);
          }, 2000);
        }
      }

      //resultElement.innerHTML = currentValue + "<br>";
    });
  };

  useEffect(() => {
    fetchAllStars(selectedRepo);
  }, []);

  const handleInputChange = async (event, setStateFunction) => {
    const inputText = event.target.value;
    setStateFunction(inputText);

    const repoParsed = parseGitHubRepoURL(inputText);

    if (repoParsed === null) {
      return;
    }

    const res = await fetchTotalStars(repoParsed);
    console.log(res);

    setTotalStars(res.stars);
    setCreationDate(res.createdAt);

    const status = await fetchStatus(repoParsed);
    console.log(status);

    setProgressValue(0);
    setMaxProgress(0);

    if (!status.onGoing) {
      fetchAllStars(repoParsed);
    }

    if (!status.cached) {
      let timeEstimate = res.stars / 339;
      timeEstimate = Math.max(1, Math.ceil(timeEstimate));
      setEstimatedTime(timeEstimate);
    }

    const callsNeeded = Math.floor(res.stars / 100);
    setMaxProgress(callsNeeded);
    startSSEUpates(repoParsed, callsNeeded, status.onGoing);
  };

  return (
    <div>
      <TextField
        style={{
          marginTop: "20px",
          marginRight: "20px",
          marginLeft: "20px",
          width: "500px",
        }}
        label="Enter a GitHub repository"
        variant="outlined"
        value={selectedRepo}
        onChange={(e) => handleInputChange(e, setSelectedRepo)}
      />
      <TextField
        style={{
          marginTop: "20px",
          marginRight: "20px",
          marginLeft: "10px",
          width: "100px",
        }}
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
        id="cration-date"
        label="Creation Date"
        value={creationDate}
        InputProps={{
          readOnly: true,
        }}
      />
      <Link
        component="button" // Use a button style
        variant="body2" // Choose a style variant
        onClick={downloadCSV} // Call the downloadCSV function on click
      >
        Download CSV
      </Link>
      <EstimatedTimeProgress
        text="Estimated Time Left"
        totalTime={estimatedTime}
      />
      <ProgressBar value={progressValue} max={maxProgress} />
      <ReactFC {...ds.timeseriesDs} />
    </div>
  );
}

export default TimeSeriesChart;
