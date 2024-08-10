/* eslint-disable no-case-declarations */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
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
import schema from "./schema";
import EstimatedTimeProgress from "./EstimatedTimeProgress";
import ProgressBar from "./ProgressBar";
import { parseISO, intervalToDuration } from "date-fns";
import { parseGitHubRepoURL } from "./githubUtils";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import UmberTheme from "fusioncharts/themes/fusioncharts.theme.umber";
import CopyToClipboardButton from "./CopyToClipboardButton";
import GitHubButton from "react-github-btn";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  addRunningMedian,
  addRunningAverage,
  addLOESS,
  calculateFirstDerivative,
  calculateSecondDerivative,
  calculatePercentiles,
} from "./utils";

// This needs to be refactored, focus is mostly on functionalities and implementing ideas
// But it has reached a point where it's difficult to go over the code

const HOST = import.meta.env.VITE_HOST;
const PREDICTOR_HOST = "https://emanuelef.dynv6.net:8082";

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

const INCLUDE_DATE_RANGE =
  "When checked the URL to share will include the current time range selected";

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
  let defaultRepo = "helm/helm";
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

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
      yAxis: [
        {
          plot: {
            value: "Daily Stars",
            type: "line",
          },
          title: "Daily Stars",
          aggregation: "average",
          referenceline: [],
          type: "", // can be log
        },
        {
          plot: {
            value: "Total Stars",
            type: "line",
          },
          title: "Total Stars",
        },
      ],
      xAxis: {
        plot: "Time",
        timemarker: [],
        binning: {},
      },
      //      datamarker: [],
      chart: {
        animation: "0",
        theme: "candy",
        exportEnabled: "1",
        exportMode: "client",
        exportFormats: "PNG=Export as PNG|PDF=Export as PDF",
      },
      extensions: {
        prediction: {
          date: "", // 22-09-2023
          style: {
            plot: "line",
          },
        },
      },
    },
    events: {
      selectionChange: function (ev) {
        if (ev && ev.data) {
          setSelectedTimeRange({
            start: ev.data.start,
            end: ev.data.end,
          });
        }
      },
      rendered: function (e) {
        setTimeout(() => {
          e.sender.setTimeSelection(selectedTimeRange);
        }, 1000);
      },
      timeMarkerClick: function (eventObj, dataObj) {
        //console.log(eventObj);
        //console.log(dataObj);
        console.log(dataObj["startText"]);
        console.log(currentHNnews.current[dataObj["startText"]]);
        window.open(currentHNnews.current[dataObj["startText"]]["HNURL"], "_blank");
      },
    },
  };

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const [ds, setds] = useState(chart_props);

  const [estimatedTime, setEstimatedTime] = useState(0);
  const [totalStars, setTotalStars] = useState(0);
  const [creationDate, setCreationDate] = useState("2021-01-01");
  const [age, setAge] = useState("");
  const [currentStarsHistory, setCurrentStarsHistory] = useState([]);
  const [starsLast10d, setStarsLast10d] = useState("");
  const [progressValue, setProgressValue] = useState(0);
  const [maxProgress, setMaxProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForceRefetch, setShowForceRefetch] = useState(false);
  const [forceRefetch, setForceRefetch] = useState(false);
  const [checkedYAxisType, setCheckedYAxisType] = useState(false);

  const currentHNnews = useRef({});
  const currentPeaks = useRef([]);

  const [feed, setFeed] = useState("none");
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

  const handleFeedChange = (event) => {
    setFeed(event.target.value);
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
    updateGraph(currentStarsHistory);
  }, [transformation, feed]);

  const handleForceRefetchChange = (event) => {
    setForceRefetch(event.target.checked);
  };

  const fetchHNFeed = async (options) => {
    const repoParsedTmp = parseGitHubRepoURL(selectedRepo);

    let parts = repoParsedTmp.split("/");
    let repoName = parts[1];

    const [hackernewsRepoName, hackernewsWithUser] = await Promise.all([
      fetchHN(repoName),
      fetchHN(repoParsedTmp),
    ]);

    const hackernews = filterHNResults([
      ...hackernewsRepoName,
      ...hackernewsWithUser,
    ], repoName)

    const mapHN = {};

    hackernews.forEach(item => {
      const date = new Date(item.CreatedAt);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
      const year = date.getFullYear();
      const formattedDate = `${day}-${month}-${year}`;

      mapHN[formattedDate] = {
        URL: item.URL,
        HNURL: item.HNURL
      };
    });

    currentHNnews.current = mapHN;

    console.log(mapHN)

    let news = hackernews.slice(0, 20).map(item => {
      // Parse the date from the CreatedAt field
      let date = new Date(item.CreatedAt);
      // Format the date to "dd-mm-yyyy"
      let formattedDate = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;

      return {
        start: formattedDate,
        label: item.Title + "<br>" + "Points: " + item.Points + "<br>" + "Comments:" + item.NumComments,
        timeformat: "%d-%m-%Y",
        style: {
          marker: {
            fill: "#FF6600",
          },
        },
      };
    });

    options.dataSource.xAxis.timemarker = [...news, ...currentPeaks.current];
  }

  const fetchRedditFeed = async (options) => {
    const redditPosts = await fetchReddit(parseGitHubRepoURL(selectedRepo).split("/")[1]);
    const mapReddit = {};

    redditPosts.forEach(item => {
      const date = new Date(item.created);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
      const year = date.getFullYear();
      const formattedDate = `${day}-${month}-${year}`;

      mapReddit[formattedDate] = {
        HNURL: item.url
      };
    });

    currentHNnews.current = mapReddit;

    let reddit = redditPosts.slice(0, 20).map(item => {
      let date = new Date(item.created);
      let formattedDate = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;

      return {
        start: formattedDate,
        label: item.title + "<br>" + "Ups: " + item.ups + "<br>" + "Comments:" + item.num_comments,
        timeformat: "%d-%m-%Y",
        style: {
          marker: {
            fill: "#FF6600",
          },
        },
      };
    });

    options.dataSource.xAxis.timemarker = [...reddit, ...currentPeaks.current];
  }

  const fetchPredictions = async (repo) => {
    try {
      setLoading(true);
      const response = await fetch(`${PREDICTOR_HOST}/predict?repo=${repo}`);

      if (!response.ok) {
        setLoading(false);
        toast.error("Internal Server Error. Please try again later.", {
          position: toast.POSITION.BOTTOM_CENTER,
        });
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      setLoading(false);

      const data = await response.json();

      const starsForecast = data.forecast_data.map((entry) => [
        formatDate(entry.ds),
        Math.round(entry.yhat),
        Math.round(entry.yhat_lower),
      ]);

      const starsTrend = data.forecast_trend.map((entry) => [
        formatDate(entry.ds),
        Math.max(entry.trend, 0),
        0,
      ]);

      return starsTrend;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
    }
  };

  const fetchHN = async (repo) => {
    try {
      setLoading(true);
      const response = await fetch(`${HOST}/hackernews?query=${repo}`);

      if (!response.ok) {
        setLoading(false);
        toast.error("Internal Server Error. Please try again later.", {
          position: toast.POSITION.BOTTOM_CENTER,
        });
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      setLoading(false);

      const data = await response.json();

      return data;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
    }
  };

  const fetchReddit = async (repo) => {
    try {
      setLoading(true);
      const response = await fetch(`${HOST}/reddit?query=${repo}`);

      if (!response.ok) {
        setLoading(false);
        toast.error("Internal Server Error. Please try again later.", {
          position: toast.POSITION.BOTTOM_CENTER,
        });
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      setLoading(false);

      const data = await response.json();

      return data;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
    }
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

  const filterHNResults = (results, repoName) => {
    const uniqueUrls = new Set(); // To track URLs that have already been added
    const filteredResults = [];
    const repoNameLower = repoName.toLowerCase();
    const hasSpecialSeparator = repoName.includes('-') || repoName.includes('_');

    results.forEach(result => {
      const url = result.URL.toLowerCase();
      const title = result.Title.toLowerCase();

      // Check if the URL is unique
      if (!uniqueUrls.has(url)) {
        // If there are no hyphens in the repoName, check if the title contains repoName
        if (hasSpecialSeparator || title.includes(repoNameLower)) {
          uniqueUrls.add(url); // Add the URL to the set
          filteredResults.push(result); // Add the result to the filtered list
        }
      }
    });

    return filteredResults;
  };

  const updateGraph = async (starHistory) => {
    // check if last element is today
    if (starHistory.length > 1) {
      const lastElement = starHistory[starHistory.length - 1];
      console.log(lastElement[0]);
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

    const res = calculatePercentiles(
      starHistory
        .filter((subArray) => subArray[1] > 0)
        .map((subArray) => subArray[1]),
      0.5,
      0.98
    );

    console.log("percentiles");
    console.log(res);
    console.log(starHistory.length);

    // Remove spike on first day if higher or equal than 98 percentile
    if (starHistory.length > 2) {
      console.log(starHistory[0][1], res[2]);
      if (starHistory[0][1] >= res[2]) {
        // remove first element
        console.log(starHistory[0]);
        starHistory.shift();
      }
    }

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
          "Daily Stars";
        options.dataSource.yAxis[0].plot.type = "line";
        if (res && res.length == 3) {
          options.dataSource.subcaption = {
            text:
              res[2] > res[1] + 1000 ? "Zoom in or try normalize option" : "",
          };
        } else {
          options.dataSource.subcaption = "";
        }
        break;
      case "trend":
        const repoParsed = parseGitHubRepoURL(selectedRepo);
        const predictions = await fetchPredictions(repoParsed);

        for (let index = 0; index < starHistory.length; index++) {
          predictions[index][2] = starHistory[index][2];
        }

        let lastSum = starHistory[starHistory.length - 1][2];

        for (
          let index = starHistory.length;
          index < predictions.length;
          index++
        ) {
          predictions[index][2] = lastSum;
          lastSum += predictions[index][1];
        }

        appliedTransformationResult = predictions;
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Trend";
        options.dataSource.yAxis[0].plot.type = "line";
        options.dataSource.subcaption = "Trend";
        break;
      case "yearlyBinning":
        textBinning = `Daily Stars ${aggregation} by Year`;
        if (aggregation == "sum") {
          textBinning = "Total Stars by Year";
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
        textBinning = `Daily Stars ${aggregation} by Month`;
        if (aggregation == "sum") {
          textBinning = "Total Stars by Year";
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
        textBinning = `Daily Stars ${aggregation} by Week`;
        if (aggregation == "sum") {
          ("Total Stars by Year");
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
      case "firstOrderDerivative":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Derivative";
        appliedTransformationResult = calculateFirstDerivative(starHistory);
        options.dataSource.yAxis[0].plot.type = "line";
        break;
      case "secondOrderDerivative":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Second Derivative";
        appliedTransformationResult = calculateSecondDerivative(starHistory);
        options.dataSource.yAxis[0].plot.type = "line";
        break;

      default:
        break;
    }

    switch (feed) {
      case "hacker":
        await fetchHNFeed(options);
        break;
      case "reddit":
        await fetchRedditFeed(options);
        break;
      case "none":
        options.dataSource.xAxis.timemarker = currentPeaks.current;
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

    /*
    options.dataSource.yAxis[0].referenceline = [
      {
        label: "CCC Temperature",
        value: 14,
      },
    ];
    */

    // console.log(options.dataSource.yAxis[0].referenceline);
    console.log(options.dataSource.yAxis);
    console.log(res);

    setds(options);
  };

  const fetchAllStars = async (repo, ignoreForceRefetch = false) => {
    console.log(repo);

    setCurrentStarsHistory([]);
    setStarsLast10d("");

    let fetchUrl = `${HOST}/allStars?repo=${repo}`;

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
        const starHistory = data.stars;

        setCurrentStarsHistory(starHistory);
        setStarsLast10d(data.newLast10Days);

        updateGraph(starHistory);

        const maxPeriods = data.maxPeriods.map((period) => ({
          start: period.StartDay,
          end: period.EndDay,
          label: `${period.TotalStars} is the highest number of new stars in a 10 day period`,
          timeformat: "%d-%m-%Y",
          type: "full",
        }));

        const maxPeaks = data.maxPeaks.map((peak) => ({
          start: peak.Day,
          timeformat: "%d-%m-%Y",
          label: `${peak.Stars} is the maximum number of new stars in one day`,
          style: {
            marker: {
              fill: "#30EE47",
            },
          },
        }));

        currentPeaks.current = maxPeriods.concat(maxPeaks);

        const options = { ...ds };
        options.dataSource.caption = { text: `Stars ${repo}` };

        options.dataSource.xAxis.timemarker = currentPeaks.current;

        /*         options.dataSource.datamarker = [{
                  value: "Daily Stars",
                  time: "11-11-2023",
                  identifier: "H",
                  timeformat: "%d-%m-%Y",
                  tooltext:
                    "Test"
                }] */

        setds(options);
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
      .then((response) => response.json())
      .then((data) => {
        const starsContent = JSON.stringify(data.stars);
        const blob = new Blob([starsContent], { type: "application/json" });
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
      setProgressValue(currentValue);

      // console.log("currentValue", currentValue, callsNeeded);

      if (currentValue === callsNeeded) {
        console.log("CLOSE SSE");
        closeSSE();
        //if (onGoing) {
        setTimeout(() => {
          fetchAllStars(repo, true);
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

    navigate(`/${repoParsed}`, {
      replace: false,
    });

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
            width: "400px",
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

        <FormControl style={{
          marginTop: "20px",
          marginRight: "10px",
          marginLeft: "0px",
          width: "100px",
        }}>
          <InputLabel id="style-select-drop">Feeds</InputLabel>
          <Select
            labelId="feed"
            id="feed"
            value={feed}
            size="small"
            label="Feed"
            onChange={handleFeedChange}
          >
            <MenuItem value={"hacker"}>HNews</MenuItem>
            <MenuItem value={"reddit"}>Reddit</MenuItem>
            <MenuItem value={"none"}>None</MenuItem>
          </Select>
        </FormControl>

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
              label="Update"
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
            width: "100px",
          }}
          size="small"
          id="age"
          label="⭐ Last 10 d"
          value={starsLast10d}
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

        <FormControl
          style={{
            width: "180px",
            marginRight: "10px",
          }}
        >
          <InputLabel id="transformation-select-drop">Transform</InputLabel>
          <Select
            labelId="transformation"
            id="transformation"
            value={transformation}
            size="small"
            label="Transform"
            onChange={handleTransformationChange}
          >
            <MenuItem value={"none"}>None</MenuItem>
            <MenuItem value={"trend"}>Trend</MenuItem>
            <MenuItem value={"yearlyBinning"}>Yearly Binning</MenuItem>
            <MenuItem value={"monthlyBinning"}>Monthly Binning</MenuItem>
            <MenuItem value={"weeklyBinning"}>Weekly Binning</MenuItem>
            <MenuItem value={"normalize"}>Normalize</MenuItem>
            <MenuItem value={"loess"}>LOESS</MenuItem>
            <MenuItem value={"runningAverage"}>Running Average</MenuItem>
            <MenuItem value={"runningMedian"}>Running Median</MenuItem>
            <MenuItem value={"firstOrderDerivative"}>Derivative</MenuItem>
            <MenuItem value={"secondOrderDerivative"}>
              Second Derivative
            </MenuItem>
          </Select>
        </FormControl>
        {transformation.includes("Binning") && (
          <FormControl
            style={{
              width: "100px",
              marginRight: "2px",
            }}
          >
            <InputLabel id="aggregation-select-drop">Aggregate</InputLabel>
            <Select
              labelId="aggregation"
              id="aggregation"
              value={aggregation}
              size="small"
              label="Aggregate"
              onChange={handleAggregationChange}
            >
              <MenuItem value={"average"}>Mean</MenuItem>
              <MenuItem value={"sum"}>Total</MenuItem>
              <MenuItem value={"max"}>Max</MenuItem>
              <MenuItem value={"min"}>Min</MenuItem>
            </Select>
          </FormControl>
        )}
        {
          <Checkbox
            checked={checkedYAxisType}
            onChange={handleYAxisTypeCheckChange}
            inputProps={{ "aria-label": "controlled" }}
          />
        }
        <Typography variant="body2">Log Y-Axis</Typography>

        <Button
          style={{
            marginLeft: "10px",
          }}
          size="small"
          variant="contained"
          onClick={downloadCSV}
        >
          Download CSV
        </Button>
        <br />
        <Button
          style={{
            marginLeft: "10px",
            marginRight: "10px",
          }}
          size="small"
          variant="contained"
          onClick={downloadJSON}
        >
          Download Json
        </Button>
        <CopyToClipboardButton
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
        <Typography variant="body2">With Date Range</Typography>
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
      <EstimatedTimeProgress
        text="Estimated Time Left"
        totalTime={estimatedTime}
      />
      <ProgressBar value={progressValue} max={maxProgress} />
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

export default TimeSeriesChart;

// https://img.shields.io/github/stars/emanuelef/daily-stars-explorer
