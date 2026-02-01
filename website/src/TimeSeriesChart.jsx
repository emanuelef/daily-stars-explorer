/* eslint-disable no-case-declarations */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
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
import SmartphoneIcon from "@mui/icons-material/Smartphone";
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
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import {
  addRunningMedian,
  addRunningAverage,
  addLOESS,
  calculateFirstDerivative,
  calculateSecondDerivative,
  calculatePercentiles,
  formatNumber,
} from "./utils";
import { useAppTheme } from "./ThemeContext";

// This needs to be refactored, focus is mostly on functionalities and implementing ideas
// But it has reached a point where it's difficult to go over the code

const HOST = import.meta.env.VITE_HOST;
const PREDICTOR_HOST = "https://emafuma.mywire.org:8082";

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
  "Using cached data, force refetching the data from GitHub by checking and press on Fetch again. This will take a while if the repo has a lot of stars.";

const INFO_TOOLTIP =
  "Stars are fetched until UTC midnight of the previous day. \
   You can zoom inside the graph by scrolling up and down or dragging the selectors in the underline graph. \
   Once fetched the history is kept for 7 days but it's possible to refetch again by checking the Update checkbox and press on Fetch again."; const INCLUDE_DATE_RANGE =
  "When checked the URL to share will include the current time range selected";

const MOBILE_VERSION_INFO =
  "There's also a mobile-optimized version of this tool available at emanuelef.github.io/daily-stars-mobile";

const isToday = (dateString) => {
  const today = new Date();
  const [day, month, year] = dateString.split("-").map(Number);
  return (
    today.getDate() === day &&
    today.getMonth() + 1 === month && // Adding 1 to month because JavaScript months are 0-indexed
    today.getFullYear() === year
  );
};

const isYesterday = (dateString) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [day, month, year] = dateString.split("-").map(Number);
  return (
    yesterday.getDate() === day &&
    yesterday.getMonth() + 1 === month && // Adding 1 to month because JavaScript months are 0-indexed
    yesterday.getFullYear() === year
  );
};

// Helper function to calculate stars in the last 10 days from star history
const calculateStarsLast10Days = (starHistory) => {
  if (!starHistory || starHistory.length === 0) return 0;

  // Take up to the last 10 days of data
  const daysToConsider = Math.min(10, starHistory.length);
  const last10Days = starHistory.slice(-daysToConsider);

  // Sum the daily stars (index 1 contains daily stars count)
  return last10Days.reduce((sum, day) => sum + day[1], 0);
};

function TimeSeriesChart() {
  let defaultRepo = "helm/helm";
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

  const { theme: appTheme } = useAppTheme();
  const defaultChartTheme = appTheme === 'dark' ? 'candy' : 'fusion';

  const [zoomedStars, setZoomedStars] = useState(0);
  const [zoomedStarsPercentageTotal, setZoomedStarsPercentageTotal] = useState(0);

  const handleZoom = (start, end) => {
    if (ds && ds.dataSource && ds.dataSource.data && ds.dataSource.data._data && ds.dataSource.data._data.length > 0) {
      const zoomedData = ds.dataSource.data._data.filter(
        (dataPoint) => dataPoint[0] >= start && dataPoint[0] <= end
      );
      const totalStarsSelection = zoomedData.reduce((sum, dataPoint) => sum + dataPoint[1], 0);
      setZoomedStars(totalStarsSelection);
      
      const lastDataPoint = ds.dataSource.data._data[ds.dataSource.data._data.length - 1];
      if (lastDataPoint && lastDataPoint[2] !== undefined) {
        setZoomedStarsPercentageTotal(
          ((totalStarsSelection / lastDataPoint[2]) * 100).toFixed(2)
        );
      }
    }
  };


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
        theme: defaultChartTheme,
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
          console.log("Selection changed:", ev.data);
          setSelectedTimeRange({
            start: ev.data.start,
            end: ev.data.end,
          });
          handleZoom(ev.data.start, ev.data.end);
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
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);
  const [starsRepos, setStarsRepos] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showFeedbackBanner, setShowFeedbackBanner] = useState(true);
  const [keepLast30Zoom, setKeepLast30Zoom] = useState(false);
  const [last30Active, setLast30Active] = useState(false); // false: button applies last 30; true: button restores full timeline

  const currentHNnews = useRef({});
  const currentPeaks = useRef([]);
  const chartRef = useRef(null);

  const [feed, setFeed] = useState("none");
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

  const navigate = useNavigate();

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [checkedDateRange, setCheckedDateRange] = useState(false);

  const currentSSE = useRef(null);
  const isMountedRef = useRef(true);

  // Cleanup SSE on unmount and mark component as unmounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (currentSSE.current) {
        console.log("Cleanup: Closing SSE connection");
        currentSSE.current.close();
        currentSSE.current = null;
      }
    };
  }, []);

  // Check if user is on a mobile device
  useEffect(() => {
    const checkIfMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      setIsMobile(mobileRegex.test(userAgent) || window.innerWidth <= 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);

  // Fetch available repos on mount (like in CompareChart)
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

    let news = hackernews.slice(0, 40).map(item => {
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

    let reddit = redditPosts.slice(0, 40).map(item => {
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

  const fetchYoutubeFeed = async (options) => {
    let ytPosts = await fetchYT(parseGitHubRepoURL(selectedRepo).split("/")[1]);
    const mapYT = {};

    const repoParsedTmp = parseGitHubRepoURL(selectedRepo);
    let parts = repoParsedTmp.split("/");
    let repoName = parts[1];

    ytPosts = ytPosts.filter(item => item.title.toLowerCase().includes(repoName.toLowerCase()));

    ytPosts.forEach(item => {
      const date = new Date(item.published_at);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
      const year = date.getFullYear();
      const formattedDate = `${day}-${month}-${year}`;

      mapYT[formattedDate] = {
        HNURL: item.video_url
      };
    });

    currentHNnews.current = mapYT;

    let youtube = ytPosts.slice(0, 100).map(item => {
      let date = new Date(item.published_at);
      let formattedDate = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;

      return {
        start: formattedDate,
        label: item.title + "<br>" + "Views: " + formatNumber(item.view_count),
        timeformat: "%d-%m-%Y",
        style: {
          marker: {
            fill: "#FF6600",
          },
        },
      };
    });

    options.dataSource.xAxis.timemarker = [...youtube, ...currentPeaks.current];
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

  const fetchYT = async (repo) => {
    try {
      setLoading(true);
      const response = await fetch(`${HOST}/youtube?query=${repo}`);

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

  const fetchReleasesFeed = async (options) => {
    try {
      setLoading(true);
      const repo = parseGitHubRepoURL(selectedRepo);
      const response = await fetch(`${HOST}/allReleases?repo=${repo}`);

      if (!response.ok) {
        setLoading(false);
        toast.error("Error fetching releases. Please try again later.", {
          position: toast.POSITION.BOTTOM_CENTER,
        });
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      setLoading(false);

      const releases = await response.json();
      const mapReleases = {};

      // Create a map of releases by date
      releases.forEach(release => {
        // Format the date from PublishedAt field as DD-MM-YYYY
        const date = new Date(release.publishedAt);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}-${month}-${year}`;

        mapReleases[formattedDate] = {
          HNURL: release.url, // Using HNURL as it's the field used for opening links
          name: release.name,
          tagName: release.tagName,
          isPrerelease: release.isPrerelease,
          isDraft: release.isDraft
        };
      });

      currentHNnews.current = mapReleases;

      // Create timeline markers for releases
      const releaseMarkers = releases.map(release => {
        const date = new Date(release.publishedAt);
        const formattedDate = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;

        let label = `Release: ${release.tagName}`;
        if (release.name && release.name.trim() !== "") {
          label += `<br>${release.name}`;
        }

        // Add status information to the label
        if (release.isPrerelease) {
          label += "<br>(Pre-release)";
        } else if (release.isDraft) {
          label += "<br>(Draft)";
        }

        // Choose marker color based on release type
        let markerColor = "#1976d2"; // Default blue for regular releases
        if (release.isPrerelease) {
          markerColor = "#ff9800"; // Orange for pre-releases
        } else if (release.isDraft) {
          markerColor = "#9e9e9e"; // Gray for drafts
        }

        return {
          start: formattedDate,
          label: label,
          timeformat: "%d-%m-%Y",
          type: "full", // Make it a full line instead of just a marker
          style: {
            marker: {
              fill: markerColor,
              stroke: markerColor,
            },
            line: {
              stroke: markerColor,
              "stroke-width": "1",
              "stroke-opacity": "0.6",
            }
          },
        };
      });

      options.dataSource.xAxis.timemarker = [...releaseMarkers, ...currentPeaks.current];
    } catch (error) {
      console.error(`Error fetching releases: ${error}`);
      setLoading(false);
      options.dataSource.xAxis.timemarker = currentPeaks.current;
    }
  };

  const fetchTotalStars = async (repo) => {
    try {
      const response = await fetch(`${HOST}/totalStars?repo=${repo}`);

      if (!response.ok) {
        setLoading(false);
        if (response.status === 404) {
          setError(`Repository '${repo}' not found. Please check if the repository exists on GitHub.`);
          setShowError(true);
        } else if (response.status === 429) {
          setError("GitHub API rate limit exceeded. Please wait a few minutes and try again.");
          setShowError(true);
        } else {
          setError("Internal Server Error. Please try again later.");
          setShowError(true);
        }
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      // Clear any existing errors on successful API call
      setShowError(false);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
      return null;
    }
  };

  const fetchStatus = async (repo) => {
    try {
      const response = await fetch(`${HOST}/status?repo=${repo}`);

      if (!response.ok) {
        setLoading(false);
        if (response.status === 404) {
          setError(`Repository '${repo}' not found. Please check if the repository exists on GitHub.`);
          setShowError(true);
        } else if (response.status === 429) {
          setError("GitHub API rate limit exceeded. Please wait a few minutes and try again.");
          setShowError(true);
        } else {
          setError("Error checking repository status. Please try again later.");
          setShowError(true);
        }
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      // Clear any existing errors on successful API call
      setShowError(false);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      setLoading(false);
      return { cached: false, onGoing: false };
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
        if (hasSpecialSeparator || title.includes(repoNameLower) || url.includes(repoNameLower)) {
          uniqueUrls.add(url); // Add the URL to the set
          filteredResults.push(result); // Add the result to the filtered list
        }
      }
    });

    return filteredResults;
  };

  const updateGraph = async (starHistory, currentTotalStars = 0) => {
    // check if last element is today
    if (starHistory.length > 1) {
      const lastElement = starHistory[starHistory.length - 1];
      const isLastElementToday = isToday(lastElement[0]);
      if (isLastElementToday) {
        starHistory.pop(); // remove last element only if it's today
      }
      // ---  ---
      let showUpdate = false;
      if (starHistory.length > 0) {
        const lastDate = starHistory[starHistory.length - 1][0];
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const [d, m, y] = lastDate.split("-").map(Number);
        const lastDateObj = new Date(y, m - 1, d);
        // If last date is before yesterday (i.e., < yesterday at 00:00), show Update
        if (lastDateObj < new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())) {
          showUpdate = true;
        }
      }
      setShowForceRefetch(showUpdate);
      setForceRefetch(false);
    } else {
      setShowForceRefetch(false);
      setForceRefetch(false);
      console.log("Array is empty.");
    }

    // Use the passed currentTotalStars value instead of relying on the totalStars state
    const effectiveTotalStars = currentTotalStars || totalStars;

    // Add the current total stars count as the latest point ONLY if the history is complete until yesterday
    if (starHistory.length > 0 && effectiveTotalStars > 0) {
      // Check if the last date in the star history is yesterday
      const lastDateInHistory = starHistory[starHistory.length - 1][0];
      const isHistoryCompleteUntilYesterday = isYesterday(lastDateInHistory);

      if (isHistoryCompleteUntilYesterday) {
        // Create today's date in the format DD-MM-YYYY
        const today = new Date();
        const formattedToday = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

        // Get the previous day's total stars (if available)
        const prevTotalStars = starHistory[starHistory.length - 1][2];

        // Calculate daily stars (difference between current total and previous total)
        const todayDailyStars = Math.max(0, effectiveTotalStars - prevTotalStars);

        // Add the new data point with today's date, calculated daily stars, and current total stars
        starHistory.push([formattedToday, todayDailyStars, effectiveTotalStars]);
        console.log("Added today's data point:", formattedToday, todayDailyStars, effectiveTotalStars);

        // Update the starsLast10d value to include today's stars
        const updatedLast10DaysStars = calculateStarsLast10Days(starHistory);
        setStarsLast10d(updatedLast10DaysStars.toString());
        console.log("Updated last 10 days stars count:", updatedLast10DaysStars);
      } else {
        console.log("Star history is not complete until yesterday. Not adding current day's data point.");
      }
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
    if (res && starHistory.length > 2) {
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
      case "youtube":
        await fetchYoutubeFeed(options);
        break;
      case "releases":
        await fetchReleasesFeed(options);
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

  const fetchAllStars = async (repo, ignoreForceRefetch = false, currentTotalStars = 0) => {
    setCurrentStarsHistory([]);
    setStarsLast10d("");

    // 1. Check status first
    const status = await fetchStatus(repo);

    // If status fetch failed, exit early
    if (!status) {
      setLoading(false);
      return;
    }

    if (status.onGoing) {
      // If fetching is ongoing, do NOT call recentStars, just wait for SSE
      return;
    }

    let fetchUrl = `${HOST}/allStars?repo=${repo}`;
    if (forceRefetch && !ignoreForceRefetch) {
      fetchUrl += "&forceRefetch=true";
    }

    fetch(fetchUrl)
      .then((response) => {
        if (!isMountedRef.current) return null; // Component unmounted
        if (!response.ok) {
          setLoading(false);
          // Don't show errors for allStars API call - it will be retried automatically
          // Silent fail - the data will be fetched again later if needed
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        // Clear any existing errors on successful API call
        setShowError(false);
        return response.json();
      })
      .then((data) => {
        if (!data || !isMountedRef.current) return; // Component unmounted or no data
        setLoading(false);
        const starHistory = data.stars;
        setCurrentStarsHistory(starHistory);

        // Set starsLast10d from server response
        setStarsLast10d(data.newLast10Days);

        // Process max periods and peaks data for the chart markers
        const maxPeriods = data.maxPeriods ? data.maxPeriods.map((period) => ({
          start: period.StartDay,
          end: period.EndDay,
          label: `${period.TotalStars} is the highest number of new stars in a 10 day period`,
          timeformat: "%d-%m-%Y",
          type: "full",
        })) : [];
        const maxPeaks = data.maxPeaks ? data.maxPeaks.map((peak) => ({
          start: peak.Day,
          timeformat: "%d-%m-%Y",
          label: `${peak.Stars} is the maximum number of new stars in one day`,
          style: {
            marker: {
              fill: "#30EE47",
            },
          },
        })) : [];
        currentPeaks.current = maxPeriods.concat(maxPeaks);

        const totalStarsToUse = currentTotalStars || (data.stars && data.stars.length > 0 ? data.stars[data.stars.length - 1][2] : 0);

        // Check if yesterday is present
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const formattedYesterday = `${String(yesterday.getDate()).padStart(2, '0')}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${yesterday.getFullYear()}`;
        const hasYesterday = starHistory.some(d => d[0] === formattedYesterday);

        if (status.cached && !hasYesterday) {
          // Find the last date in the cached history
          let lastCachedDate = null;
          if (starHistory.length > 0) {
            lastCachedDate = starHistory[starHistory.length - 1][0]; // format: dd-mm-yyyy
          }

          // Calculate days missing from last cached date to yesterday
          let daysMissing = 7; // fallback
          if (lastCachedDate) {
            const [d, m, y] = lastCachedDate.split("-").map(Number);
            const lastDateObj = new Date(y, m - 1, d);
            const diffMs = yesterday - lastDateObj;
            daysMissing = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          }

          setLoading(true); // <--- Show spinner while fetching recentStars

          fetch(`${HOST}/recentStars?repo=${repo}&lastDays=${daysMissing}`)
            .then(res => {
              if (res.ok) {
                // Clear any existing errors on successful API call
                setShowError(false);
              }
              return res.json();
            })
            .then(recentData => {
              const existingDays = new Set(starHistory.map(d => d[0]));
              const merged = [
                ...starHistory,
                ...recentData.stars.filter(d => !existingDays.has(d[0]))
              ];
              setCurrentStarsHistory(merged);

              // Important change here: Update the graph with data AND title together
              updateGraphWithTitle(merged, repo, totalStarsToUse);

              setLoading(false); // <--- Hide spinner after fetch
            })
            .catch((error) => {
              console.error("Error fetching recent stars:", error);
              setLoading(false); // <--- Hide spinner on error
              setError("Failed to fetch recent star data. Using cached data instead.");
              setShowError(true);
              // Fall back to using the cached data we already have

              // Important change here: Update the graph with data AND title together
              updateGraphWithTitle(starHistory, repo, totalStarsToUse);
            });
        } else {
          // Important change here: Update the graph with data AND title together
          updateGraphWithTitle(starHistory, repo, totalStarsToUse);
        }
      })
      .catch((e) => {
        console.error(`An error occurred in fetchAllStars: ${e}`);
        setLoading(false);
        // Don't show errors for allStars API call - it will be retried automatically
        // if this is part of the automatic retry process
      });
  };

  // New function that combines updating graph data and title
  const updateGraphWithTitle = (starHistory, repo, currentTotalStars = 0) => {
    // First update the graph data
    updateGraph(starHistory, currentTotalStars);

    // Then update the title
    const options = { ...ds };
    options.dataSource.caption = { text: `Stars ${repo}` };
    options.dataSource.xAxis.timemarker = currentPeaks.current;
    setds(options);
  };

  // Re-apply last 30 days zoom immediately when data updates and flag is set
  useEffect(() => {
    if (
      keepLast30Zoom &&
      ds &&
      ds.dataSource &&
      ds.dataSource.data &&
      ds.dataSource.data._data &&
      ds.dataSource.data._data.length > 0 &&
      chartRef.current && chartRef.current.chartObj
    ) {
      const dataArr = ds.dataSource.data._data;
      const lastIdx = dataArr.length - 1;
      const end = dataArr[lastIdx][0];
      const start = dataArr[Math.max(0, lastIdx - 29)][0];

      chartRef.current.chartObj.setTimeSelection({ start, end });
      setSelectedTimeRange({ start, end });
    }
  }, [ds, keepLast30Zoom]);

  const downloadCSV = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    const downloadUrl = `${HOST}/allStarsCsv?repo=${repoParsed}`;

    fetch(downloadUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.blob();
      })
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
        setError("Failed to download CSV. Please try again later.");
        setShowError(true);
      });
  };

  const downloadJSON = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    const downloadUrl = `${HOST}/allStars?repo=${repoParsed}`;

    fetch(downloadUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
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
        setError("Failed to download JSON. Please try again later.");
        setShowError(true);
      });
  };

  const openCurrentRepoPage = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    window.open("https://github.com/" + repoParsed, "_blank");
  };

  const openMobileVersion = () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    window.open(`https://emanuelef.github.io/daily-stars-mobile/#/${repoParsed}`, "_blank");
  };

  const closeSSE = () => {
    if (currentSSE.current) {
      console.log("STOP SSE");
      currentSSE.current.close();
    }
  };

  const startSSEUpates = (repo, callsNeeded, onGoing) => {
    console.log(repo, callsNeeded, onGoing);
    // If callsNeeded is 0, immediately fetch and update the graph (no SSE needed)
    if (callsNeeded === 0) {
      // Get the current star history and update it with today's data if needed
      const repoParsed = parseGitHubRepoURL(selectedRepo);
      setTimeout(async () => {
        if (!isMountedRef.current) return; // Component unmounted
        const res = await fetchTotalStars(repoParsed);
        if (res && isMountedRef.current) {
          const freshTotalStars = res.stars;
          fetchAllStars(repoParsed, false, freshTotalStars);
        } else if (isMountedRef.current) {
          handleClick();
        }
      }, 1000); // Short delay for consistency
      setLoading(false);
      return;
    }
    try {
      const sse = new EventSource(`${HOST}/sse?repo=${repo}`);
      closeSSE();
      currentSSE.current = sse;

      sse.onerror = (err) => {
        if (!isMountedRef.current) return; // Component unmounted
        console.log("on error", err);
        // Only show error if the SSE connection fails after some time (not on initial load)
        // This prevents showing errors that are part of the normal retry process
        if (currentSSE.current && currentSSE.current.readyState === 2) { // CLOSED state
          setError("Error connecting to the server for live updates. Data updates may be delayed.");
          setShowError(true);
        }
        setLoading(false);
      };

      // The onmessage handler is called if no event name is specified for a message.
      sse.onmessage = (msg) => {
        console.log("on message", msg);
      };

      sse.onopen = (...args) => {
        console.log("on open", args);
      };

      sse.addEventListener("current-value", (event) => {
        if (!isMountedRef.current) return; // Component unmounted
        const parsedData = JSON.parse(event.data);
        const currentValue = parsedData.data;
        setProgressValue(currentValue);

        // console.log("currentValue", currentValue, callsNeeded);

        if (currentValue === callsNeeded) {
          console.log("CLOSE SSE");
          closeSSE();

          // Get the current star history and update it with today's data if needed
          const repo = parseGitHubRepoURL(selectedRepo);
          setTimeout(async () => {
            if (!isMountedRef.current) return; // Component unmounted
            // Fetch the current total stars
            const res = await fetchTotalStars(repo);
            if (res && isMountedRef.current) {
              const freshTotalStars = res.stars;
              // Use fetchAllStars with the current total stars to ensure it's properly updated
              fetchAllStars(repo, false, freshTotalStars);
            } else if (isMountedRef.current) {
              // Fallback to handleClick if we couldn't fetch total stars
              handleClick();
            }
          }, 2000);

          setLoading(false);
        }
      });
    } catch (error) {
      console.error("Error setting up SSE connection:", error);
      // Only show an error for SSE connection issues when it's not part of the initial load/retry process
      if (!onGoing) {
        setError("Failed to establish connection for live updates.");
        setShowError(true);
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    handleClick();
  }, []);

  const handleClick = async () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);

    if (repoParsed === null) {
      setError("Invalid GitHub repository format. Please use owner/repo format or a valid GitHub URL.");
      setShowError(true);
      setLoading(false);
      return;
    }

    // Clear any previous errors when starting a valid fetch
    setShowError(false);

    navigate(`/${repoParsed}`, {
      replace: false,
    });

    setLoading(true);

    const res = await fetchTotalStars(repoParsed);
    // console.log(res);

    let freshTotalStars = 0;
    if (res) {
      setTotalStars(res.stars);
      setCreationDate(res.createdAt);

      const { years, months, days } = intervalToDuration({
        start: parseISO(res.createdAt),
        end: Date.now(),
      });
      setAge(
        `${years && years !== 0 ? `${years}y ` : ""}${months && months !== 0 ? `${months}m ` : ""}${days && days !== 0 ? `${days}d ` : ""}`
      );
      freshTotalStars = res.stars;
    } else {
      // If we couldn't fetch total stars, stop the loading process
      setLoading(false);
      return;
    }

    const status = await fetchStatus(repoParsed);
    console.log(status);

    // If status is undefined or couldn't be fetched properly, exit early
    if (!status) {
      setLoading(false);
      return;
    }

    setProgressValue(0);
    setMaxProgress(0);

    if (!status.onGoing) {
      // Always pass the freshly fetched total stars value
      fetchAllStars(repoParsed, false, freshTotalStars);
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

  const handleClickWithRepo = async (repo) => {
    const repoParsed = parseGitHubRepoURL(repo);

    if (repoParsed === null) {
      setError("Invalid GitHub repository format. Please use owner/repo format or a valid GitHub URL.");
      setShowError(true);
      setLoading(false);
      return;
    }

    // Clear any previous errors when starting a valid fetch
    setShowError(false);

    navigate(`/${repoParsed}`, {
      replace: false,
    });

    setLoading(true);

    const res = await fetchTotalStars(repoParsed);

    let freshTotalStars = 0;
    if (res) {
      setTotalStars(res.stars);
      setCreationDate(res.createdAt);

      const { years, months, days } = intervalToDuration({
        start: parseISO(res.createdAt),
        end: Date.now(),
      });
      setAge(
        `${years && years !== 0 ? `${years}y ` : ""}${months && months !== 0 ? `${months}m ` : ""}${days && days !== 0 ? `${days}d ` : ""}`
      );
      freshTotalStars = res.stars;
    } else {
      // If we couldn't fetch total stars, stop the loading process
      setLoading(false);
      return;
    }

    const status = await fetchStatus(repoParsed);

    // If status is undefined or couldn't be fetched properly, exit early
    if (!status) {
      setLoading(false);
      return;
    }

    setProgressValue(0);
    setMaxProgress(0);

    if (!status.onGoing) {
      // Always pass the freshly fetched total stars value
      fetchAllStars(repoParsed, false, freshTotalStars);
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

  useEffect(() => {
    if (showError) {
      // Auto-dismiss error after 6 seconds
      const timer = setTimeout(() => {
        setShowError(false);
      }, 6000);

      // Clean up the timer when the component unmounts or showError changes
      return () => clearTimeout(timer);
    }
  }, [showError]);

  // Auto-hide feedback banner after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFeedbackBanner(false);
    }, 15000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Box sx={{ p: 1.5 }}>
      {showError && (
        <Alert
          severity="error"
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={() => {
                setShowError(false);
              }}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
          sx={{ mb: 1.5 }}
        >
          {error}
        </Alert>
      )}

      {showFeedbackBanner && (
        <Alert
          severity="info"
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={() => {
                setShowFeedbackBanner(false);
              }}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
          sx={{ mb: 1.5 }}
        >
          If you have a moment, please share your feedback or suggestions in the <a href="https://github.com/emanuelef/daily-stars-explorer/discussions/218" target="_blank" rel="noopener noreferrer" style={{ color: '#2196f3', textDecoration: 'underline' }}>GitHub Discussion</a>. Your input helps improve the tool!
        </Alert>
      )}

      {/* Main Controls */}
      <Paper elevation={2} sx={{ p: 1.5, mb: 1.5 }}>
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
          value={
            starsRepos.includes(selectedRepo)
              ? { label: selectedRepo }
              : selectedRepo
                ? { label: selectedRepo }
                : null
          }
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
        <FormControl sx={{ width: 120 }} size="small">
          <InputLabel id="style-select-drop">Feeds</InputLabel>
          <Select
            labelId="feed"
            id="feed"
            value={feed}
            label="Feed"
            onChange={handleFeedChange}
          >
            <MenuItem value={"none"}>None</MenuItem>
            <MenuItem value={"releases"}>Releases</MenuItem>
            <MenuItem value={"hacker"}>HNews</MenuItem>
            <MenuItem value={"reddit"}>Reddit</MenuItem>
            <MenuItem value={"youtube"}>YouTube</MenuItem>
          </Select>
        </FormControl>

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
          sx={{ width: 120 }}
          size="small"
          id="total-stars"
          label="⭐ Total"
          value={totalStars.toLocaleString()}
          InputProps={{
            readOnly: true,
          }}
        />
        <TextField
          sx={{ width: 120 }}
          size="small"
          id="last-10d"
          label="⭐ Last 10 d"
          value={typeof starsLast10d === 'number' ? starsLast10d.toLocaleString() : starsLast10d}
          InputProps={{
            readOnly: true,
          }}
        />
        <TextField
          sx={{ width: 220 }}
          size="small"
          id="creation-date"
          label="Creation Date"
          value={creationDate}
          InputProps={{
            readOnly: true,
          }}
        />
        <TextField
          sx={{ width: 145 }}
          size="small"
          id="age"
          label="Age"
          value={age}
          InputProps={{
            readOnly: true,
          }}
        />
        </Box>
      </Paper>

      {/* Controls & Actions */}
      <Paper elevation={2} sx={{ p: 1.5, mb: 1.5 }}>
        <Box sx={{ display: "flex", gap: 1.2, flexWrap: "wrap", alignItems: "center" }}>
        <Tooltip title="Open mobile version">
          <IconButton
            size="small"
            color="primary"
            onClick={openMobileVersion}
          >
            <SmartphoneIcon />
          </IconButton>
        </Tooltip>

        <FormControl sx={{ width: 110 }} size="small">
          <InputLabel>Theme</InputLabel>
          <Select
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

        <FormControl sx={{ width: 160 }} size="small">
          <InputLabel>Transform</InputLabel>
          <Select
            value={transformation}
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
            <MenuItem value={"secondOrderDerivative"}>2nd Derivative</MenuItem>
          </Select>
        </FormControl>
        {transformation.includes("Binning") && (
          <FormControl sx={{ width: 90 }} size="small">
            <InputLabel>Aggregate</InputLabel>
            <Select
              value={aggregation}
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
        <FormControlLabel
          control={
            <Checkbox
              checked={checkedYAxisType}
              onChange={handleYAxisTypeCheckChange}
              size="small"
            />
          }
          label="Log Y"
        />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Button size="small" variant="outlined" onClick={downloadCSV}>
          CSV
        </Button>
        <Button size="small" variant="outlined" onClick={downloadJSON}>
          JSON
        </Button>
        <CopyToClipboardButton
          dateRange={checkedDateRange ? selectedTimeRange : null}
          transformation={transformation}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={checkedDateRange}
              onChange={handleDateRangeCheckChange}
              size="small"
            />
          }
          label="Date Range"
        />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Zoomed:
        </Typography>
        <TextField
          size="small"
          value={`${formatNumber(zoomedStars)} (${zoomedStarsPercentageTotal}%)`}
          InputProps={{
            readOnly: true,
          }}
          sx={{ width: 165 }}
        />
        <Tooltip 
          title={last30Active ? "Restore full timeline" : "Zoom to last 30 days"}
          arrow
        >
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              if (
                ds &&
                ds.dataSource &&
                ds.dataSource.data &&
                ds.dataSource.data._data &&
                ds.dataSource.data._data.length > 0
              ) {
                const dataArr = ds.dataSource.data._data;
                const lastIdx = dataArr.length - 1;
                const lastDate = dataArr[lastIdx][0];
                const firstDateLast30 = dataArr[Math.max(0, lastIdx - 29)][0];
                const firstDateFull = dataArr[0][0];

                if (!last30Active) {
                  setSelectedTimeRange({ start: firstDateLast30, end: lastDate });
                  setKeepLast30Zoom(true);
                  setLast30Active(true);
                  if (chartRef.current && chartRef.current.chartObj) {
                    chartRef.current.chartObj.setTimeSelection({
                      start: firstDateLast30,
                      end: lastDate,
                    });
                  }
                  handleZoom(firstDateLast30, lastDate);
                } else {
                  setKeepLast30Zoom(false);
                  setSelectedTimeRange({ start: firstDateFull, end: lastDate });
                  setLast30Active(false);
                  if (chartRef.current && chartRef.current.chartObj) {
                    chartRef.current.chartObj.setTimeSelection({
                      start: firstDateFull,
                      end: lastDate,
                    });
                  }
                  handleZoom(firstDateFull, lastDate);
                }
              }
            }}
          >
            {last30Active ? "Full" : "Last 30d"}
          </Button>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Button size="small" variant="outlined" onClick={openCurrentRepoPage}>
          Open Repo
        </Button>
        </Box>
      </Paper>

      {/* Progress Indicators - Only show when actively loading */}
      {loading && (
        <Paper elevation={2} sx={{ p: 1.5, mb: 1.5 }}>
          <EstimatedTimeProgress
            text="Estimated Time Left"
            totalTime={estimatedTime}
          />
          <ProgressBar value={progressValue} max={maxProgress} />
        </Paper>
      )}

      {/* Chart Container */}
      <Paper elevation={3} sx={{ p: 1.5 }}>
        <Box id="chart-container">
        {ds != null && ds != chart_props && ds && ds.dataSource.data && (
          <ReactFC ref={chartRef} {...ds} />
        )}
        </Box>
      </Paper>
    </Box>
  );
}

export default TimeSeriesChart;

// https://img.shields.io/github/stars/emanuelef/daily-stars-explorer
