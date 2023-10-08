import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import LoadingButton from "@mui/lab/LoadingButton";
import SendIcon from "@mui/icons-material/Send";
import { Link } from "@mui/material";
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
        setLoading(false);

        // remove last element as the current day is not complete
        if (data.length > 0) {
          data.pop();
          console.log(data);
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
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
        setLoading(false);
      });
  };

  const downloadCSV = () => {
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

  const downloadJSON = () => {
    const downloadUrl = `${HOST}/allStars?repo=${selectedRepo}`;

    fetch(downloadUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedRepo.replace("/", "_")}-stars-history.json`;
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
      let timeEstimate = res.stars / 339;
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
            marginTop: "30px",
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
            marginTop: "20px",
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
        <Link
          component="button" // Use a button style
          variant="body2" // Choose a style variant
          onClick={downloadCSV} // Call the downloadCSV function on click
        >
          Download CSV
        </Link>
        <br />
        <Link
          style={{
            marginTop: "2px",
            marginLeft: "10px",
          }}
          component="button" // Use a button style
          variant="body2" // Choose a style variant
          onClick={downloadJSON} // Call the downloadJSON function on click
        >
          Download Json
        </Link>
        <CopyToClipboardButton />
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
