/* eslint-disable no-case-declarations */
import { useState, useEffect, useMemo, useRef } from "react";
import { useSSE } from "./hooks/useSSE";
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
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import PushPinIcon from "@mui/icons-material/PushPin";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ExcelExport from "fusioncharts/fusioncharts.excelexport";
import ReactFC from "react-fusioncharts";
import schema from "./schema";
import LinearProgress from "@mui/material/LinearProgress";
import { parseISO, intervalToDuration } from "date-fns";
import { parseGitHubRepoURL } from "./githubUtils";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import UmberTheme from "fusioncharts/themes/fusioncharts.theme.umber";
import CopyToClipboardButton from "./CopyToClipboardButton";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import {
  addRunningMedian,
  addRunningAverage,
  addLOESS,
  calculateFirstDerivative,
  calculateSecondDerivative,
  calculateWeeklyGrowthRate,
  calculatePercentiles,
  formatNumber,
} from "./utils";
import { useAppTheme } from "./ThemeContext";
import { useLastRepo } from "./RepoContext";
import { AXIS_STYLE } from "./chartAxisStyle";
import { loadTrend } from "./trend";
import "./DesktopStarsView.css";

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
  ExcelExport,
  TimeSeries,
  GammelTheme,
  CandyTheme,
  ZuneTheme,
  UmberTheme
);

const FORCE_REFETCH_TOOLTIP =
  "Refresh the stored history from GitHub the next time you load this repository.";

const INFO_TOOLTIP =
  "Scroll over the chart or drag the lower navigator to zoom. History includes completed days; today’s partial count appears when available from GitHub.";

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

const parseTimelineDate = (dateString) => {
  if (!dateString || typeof dateString !== "string") return null;
  const [day, month, year] = dateString.split("-").map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
};

const normalizeTimelineDate = (dateString) => {
  const parsed = parseTimelineDate(dateString);
  if (!parsed) return dateString;
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}-${month}-${year}`;
};

const FEED_LABELS = {
  none: "None",
  releases: "Releases",
  hacker: "HNews",
  reddit: "Reddit",
  redditStrict: "Reddit",
  redditBroad: "Reddit",
  ghmentions: "GitHub",
  youtube: "YouTube",
};

function TimeSeriesChart() {
  const { lastRepo, setLastRepo } = useLastRepo();
  let defaultRepo = lastRepo;
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

  const { theme: appTheme, currentTheme } = useAppTheme();
  const defaultChartTheme = appTheme === 'dark' ? 'candy' : 'fusion';

  const [zoomedStars, setZoomedStars] = useState(0);
  const [zoomedStarsPercentageTotal, setZoomedStarsPercentageTotal] = useState(0);
  const rawStarsRef = useRef([]);

  const handleZoom = (start, end) => {
    if (rawStarsRef.current.length > 0) {
      const utcDay = value => {
        const date = parseTimelineDate(value);
        return date ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) : undefined;
      };
      const timestamp = value => typeof value === "number" || /^\d+$/.test(value)
        ? Number(value) : utcDay(value);
      const startTime = timestamp(start);
      const endTime = timestamp(end);
      const zoomedData = rawStarsRef.current.filter(dataPoint => {
        const day = utcDay(dataPoint[0]);
        return (!Number.isFinite(startTime) || day >= startTime)
          && (!Number.isFinite(endTime) || day <= endTime);
      });
      const totalStarsSelection = zoomedData.reduce((sum, dataPoint) => sum + dataPoint[1], 0);
      setZoomedStars(totalStarsSelection);

      const lastDataPoint = rawStarsRef.current[rawStarsRef.current.length - 1];
      if (lastDataPoint && lastDataPoint[2] !== undefined) {
        setZoomedStarsPercentageTotal(
          (lastDataPoint[2] > 0 ? (totalStarsSelection / lastDataPoint[2]) * 100 : 0).toFixed(2)
        );
      }
    }
  };


  const chart_props = {
    type: "timeseries",
    width: "100%",
    height: "560",
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
            value: "Daily Stars",
            type: "line",
          },
          title: "Daily Stars",
          aggregation: "average",
          referenceline: [],
          type: "", // can be log
          style: AXIS_STYLE,
        },
        {
          plot: {
            value: "Total Stars",
            type: "line",
          },
          title: "Total Stars",
          style: AXIS_STYLE,
        },
      ],
      xAxis: {
        plot: "Time",
        timemarker: [],
        binning: {},
        style: AXIS_STYLE,
      },
      //      datamarker: [],
      chart: {
        animation: "0",
        baseFont: "Arial, sans-serif",
        theme: defaultChartTheme,
        paletteColors: "#3b82f6, #f59e0b, #10b981, #ec4899, #8b5cf6", // Blue-500, Amber-500, Emerald-500, Pink-500, Violet-500
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
          handleZoom(ev.data.start, ev.data.end);
        }
      },
      rendered: function (e) {
        setTimeout(() => {
          if (isMountedRef.current && chartRef.current?.chartObj === e.sender) {
            e.sender.setTimeSelection?.(selectedTimeRange);
          }
        }, 1000);
      },
      timeMarkerClick: function (eventObj, dataObj) {
        //console.log(eventObj);
        //console.log(dataObj);
        const url = currentHNnews.current[dataObj["startText"]]?.HNURL;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      },
    },
  };

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const [ds, setds] = useState(chart_props);

  const [totalStars, setTotalStars] = useState(0);
  const [creationDate, setCreationDate] = useState("");
  const [age, setAge] = useState("");
  const [currentStarsHistory, setCurrentStarsHistory] = useState([]);
  const [starsLast10d, setStarsLast10d] = useState("");
  const [progressValue, setProgressValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForceRefetch, setShowForceRefetch] = useState(false);
  const [forceRefetch, setForceRefetch] = useState(false);
  const [checkedYAxisType, setCheckedYAxisType] = useState(false);
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);
  const [starsRepos, setStarsRepos] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [keepLast30Zoom, setKeepLast30Zoom] = useState(false);
  const [last30Active, setLast30Active] = useState(false); // false: button applies last 30; true: button restores full timeline
  const [pinnedRepos, setPinnedRepos] = useState(() => {
    try {
      const saved = localStorage.getItem('pinned-repos');
      const pins = saved ? JSON.parse(saved) : [];
      return Array.isArray(pins) ? pins.filter(repo => typeof repo === "string") : [];
    } catch {
      return [];
    }
  });

  const currentHNnews = useRef({});
  const currentPeaks = useRef([]);
  const chartRef = useRef(null);
  const chartHostRef = useRef(null);
  const historyRetryRef = useRef(null);
  const pendingRepoRef = useRef(null);
  const requestVersionRef = useRef(0);
  const graphVersionRef = useRef(0);
  const trendRequestRef = useRef(null);
  const currentRepoRef = useRef(defaultRepo); // Track current repo for async operations
  // Today's stars come from /todayStars, which reads the current day out of
  // GitHub's star history endpoint. Using /totalStars (StargazerCount) here
  // causes a phantom +N today, where N is the count of deleted/suspended
  // stargazers excluded from the history aggregate (usually 1).
  const todayStarsRef = useRef({ repo: null, count: 0, started: false });

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

  const [aggregation, setAggregation] = useState(queryParams.get("aggregation") || "average");

  const [selectedTimeRange, setSelectedTimeRange] = useState({
    start: queryParams.get("start"),
    end: queryParams.get("end"),
  });

  const navigate = useNavigate();

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [repoInput, setRepoInput] = useState(defaultRepo);
  const [checkedDateRange, setCheckedDateRange] = useState(false);

  const sseClient = useSSE();
  const isMountedRef = useRef(true);

  // Track mount state so async fetch callbacks can no-op after unmount.
  // (SSE cleanup on unmount is handled inside useSSE.)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimeout(historyRetryRef.current);
      pendingRepoRef.current = null;
      requestVersionRef.current += 1;
      graphVersionRef.current += 1;
      trendRequestRef.current?.controller.abort();
      trendRequestRef.current = null;
    };
  }, []);

  // Sync pinned repos with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pinned-repos', JSON.stringify(pinnedRepos));
    } catch (e) {
      console.error('Failed to save pinned repos:', e);
    }
  }, [pinnedRepos]);

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

  const togglePin = (repo) => {
    setPinnedRepos(prev => {
      if (prev.includes(repo)) {
        return prev.filter(r => r !== repo);
      } else {
        return [...prev, repo];
      }
    });
  };

  const clearPinned = () => {
    if (window.confirm('Clear all pinned repositories?')) {
      setPinnedRepos([]);
    }
  };

  const handleDateRangeCheckChange = (event) => {
    setCheckedDateRange(event.target.checked);
  };

  const handleYAxisTypeCheckChange = (event) => {
    applyYAxisType(event.target.checked);
  };

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    const options = { ...ds };
    options.dataSource.chart.theme = event.target.value;
    setds(options);
  };

  const applyFeedMode = (nextFeed) => {
    currentHNnews.current = {};
    setds((prevDs) => ({
      ...prevDs,
      dataSource: {
        ...prevDs.dataSource,
        xAxis: {
          ...prevDs.dataSource.xAxis,
          timemarker: currentPeaks.current,
        },
      },
    }));
    setFeed(nextFeed);
  };

  const handleFeedChange = (event) => {
    applyFeedMode(event.target.value);
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

  const applyYAxisType = (useLogScale) => {
    setCheckedYAxisType(useLogScale);
    setds((prevDs) => ({
      ...prevDs,
      dataSource: {
        ...prevDs.dataSource,
        yAxis: prevDs.dataSource.yAxis.map((axis, index) =>
          index === 0 ? { ...axis, type: useLogScale ? "log" : "" } : axis
        ),
      },
    }));
  };

  const applyFullTimelineView = () => {
    if (
      ds &&
      ds.dataSource &&
      ds.dataSource.data &&
      ds.dataSource.data._data &&
      ds.dataSource.data._data.length > 0
    ) {
      const dataArr = ds.dataSource.data._data;
      const firstDate = dataArr[0][0];
      const lastDate = dataArr[dataArr.length - 1][0];

      setKeepLast30Zoom(false);
      setLast30Active(false);
      setSelectedTimeRange({ start: firstDate, end: lastDate });

      if (chartRef.current && chartRef.current.chartObj) {
        chartRef.current.chartObj.setTimeSelection({
          start: firstDate,
          end: lastDate,
        });
      }
      handleZoom(firstDate, lastDate);
      return true;
    }
    return false;
  };

  const applyLast30DaysView = () => {
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

      setKeepLast30Zoom(true);
      setLast30Active(true);
      setSelectedTimeRange({ start: firstDateLast30, end: lastDate });

      if (chartRef.current && chartRef.current.chartObj) {
        chartRef.current.chartObj.setTimeSelection({
          start: firstDateLast30,
          end: lastDate,
        });
      }
      handleZoom(firstDateLast30, lastDate);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (currentStarsHistory.length > 0) {
      setShowError(false);
      updateGraphWithTitle(currentStarsHistory, currentRepoRef.current);
    }
  }, [transformation, feed]);

  const handleForceRefetchChange = (event) => {
    setForceRefetch(event.target.checked);
  };

  const fetchHNFeed = async (options) => {
    const repoParsedTmp = parseGitHubRepoURL(currentRepoRef.current);

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

  const fetchRedditFeed = async (options, strict = true) => {
    const parsedRepo = parseGitHubRepoURL(currentRepoRef.current);
    const redditQuery = parsedRepo || currentRepoRef.current;
    const redditPosts = await fetchReddit(redditQuery, strict);

    if (!redditPosts || redditPosts.length === 0) {
      options.dataSource.xAxis.timemarker = [...currentPeaks.current];
      return;
    }

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
    let ytPosts = await fetchYT(parseGitHubRepoURL(currentRepoRef.current).split("/")[1]);
    const mapYT = {};

    const repoParsedTmp = parseGitHubRepoURL(currentRepoRef.current);
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

  const fetchGitHubMentionsFeed = async (options) => {
    try {
      const repo = parseGitHubRepoURL(currentRepoRef.current);
      const response = await fetch(`${HOST}/ghmentions?repo=${repo}&limit=100`);
      
      if (!response.ok) {
        console.error('Failed to fetch GitHub mentions');
        // Clear old mentions and only show peaks
        currentHNnews.current = {};
        options.dataSource.xAxis.timemarker = currentPeaks.current;
        return;
      }

      const data = await response.json();
      
      // Check if mentions exist and are not empty
      if (!data.mentions || data.mentions.length === 0) {
        console.log('No GitHub mentions found for this repository');
        // Clear old mentions and only show peaks
        currentHNnews.current = {};
        options.dataSource.xAxis.timemarker = currentPeaks.current;
        return;
      }

      const mapMentions = {};

      data.mentions.forEach(mention => {
        const date = new Date(mention.CreatedAt);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}-${month}-${year}`;

        mapMentions[formattedDate] = {
          HNURL: mention.URL
        };
      });

      currentHNnews.current = mapMentions;

      let mentions = data.mentions.slice(0, 100).map(mention => {
        let date = new Date(mention.CreatedAt);
        let formattedDate = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;

        const typeEmoji = mention.Type === 'Issue' ? '🐛' : mention.Type === 'PullRequest' ? '🔧' : '💬';
        const repoShort = mention.Repository.split('/')[1] || mention.Repository;

        return {
          start: formattedDate,
          label: `${typeEmoji} ${mention.Title}<br>${repoShort} - ${mention.State}`,
          timeformat: "%d-%m-%Y",
          style: {
            marker: {
              fill: mention.Type === 'Issue' ? '#ff9800' : mention.Type === 'PullRequest' ? '#8250df' : '#0969da',
            },
          },
        };
      });

      options.dataSource.xAxis.timemarker = [...mentions, ...currentPeaks.current];
      console.log(`Found ${mentions.length} GitHub mentions`);
    } catch (error) {
      console.error('Error fetching GitHub mentions:', error);
      // Clear old mentions and only show peaks on error
      currentHNnews.current = {};
      options.dataSource.xAxis.timemarker = currentPeaks.current;
    }
  }

  const fetchPredictions = (repo, history) => {
    const key = JSON.stringify([repo, history]);
    const cached = trendRequestRef.current;
    if (cached?.key === key && cached.expiresAt > Date.now()) return cached.promise;
    cached?.controller.abort();
    const controller = new AbortController();
    const request = { key, controller, expiresAt: Infinity, promise: null };
    request.promise = loadTrend(repo, history, {
      endpoint: PREDICTOR_HOST,
      signal: controller.signal,
    }).then(result => {
      // Retry a temporarily unavailable API after a minute, reusing pending requests
      // and recent results when changing chart controls.
      request.expiresAt = Date.now() + (result.source === "local" ? 60_000 : 300_000);
      return result;
    });
    trendRequestRef.current = request;
    return request.promise;
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

  const fetchReddit = async (repo, strict = true) => {
    try {
      setLoading(true);
      const response = await fetch(`${HOST}/reddit?query=${encodeURIComponent(repo)}&strict=${strict}`);

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
      const repo = parseGitHubRepoURL(currentRepoRef.current);
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

  const fetchTotalStars = async (repo, requestVersion = requestVersionRef.current) => {
    try {
      const response = await fetch(`${HOST}/totalStars?repo=${repo}`);

      if (!isMountedRef.current || requestVersionRef.current !== requestVersion) return null;
      if (!response.ok) {
        setLoading(false);
        if (response.status === 404) {
          setError(`Repository '${repo}' not found. Please check if the repository exists on GitHub.`);
          setShowError(true);
        } else if (response.status === 429) {
          setError("⏱️ Rate limit exceeded. Please wait before trying again.");
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
      if (!isMountedRef.current || requestVersionRef.current !== requestVersion) return null;
      console.error(`An error occurred: ${error}`);
      setLoading(false);
      setError("Couldn’t load repository details. Check the repository name and your connection, then try again.");
      setShowError(true);
      return null;
    }
  };

  const fetchStatus = async (repo, requestVersion = requestVersionRef.current) => {
    try {
      const response = await fetch(`${HOST}/status?repo=${repo}`);

      if (!isMountedRef.current || requestVersionRef.current !== requestVersion) return null;
      if (!response.ok) {
        setLoading(false);
        if (response.status === 404) {
          setError(`Repository '${repo}' not found. Please check if the repository exists on GitHub.`);
          setShowError(true);
        } else if (response.status === 429) {
          setError("⏱️ Rate limit exceeded. Please wait before trying again.");
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
      if (!isMountedRef.current || requestVersionRef.current !== requestVersion) return null;
      console.error(`An error occurred: ${error}`);
      setLoading(false);
      setError("Couldn’t check this repository. Check your connection and try again.");
      setShowError(true);
      return null;
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

  const updateGraph = async (starHistory, currentTotalStars = 0, requestVersion = requestVersionRef.current, graphVersion = graphVersionRef.current) => {
    const isCurrentGraph = () => isMountedRef.current
      && requestVersionRef.current === requestVersion && graphVersionRef.current === graphVersion;
    const graphRepo = currentRepoRef.current;
    starHistory = starHistory.map(day => [...day]);
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

        // Today's daily count comes from /todayStars, which reads the current day
        // out of GitHub's star history endpoint. Do NOT use
        // (StargazerCount - prevTotalStars): StargazerCount can run ahead of the
        // aggregate, and the difference is skew rather than stars, which used to
        // produce a phantom bar on every repo.
        //
        // `started` says whether GitHub has begun counting the current UTC day at
        // all. Its day boundary trails UTC by 7-8 hours, so for those hours
        // "0 stars today" means "this day does not exist yet", not "no stars" —
        // plotting it drew a hard drop to zero that looked like collapsed activity.
        const repo = currentRepoRef.current;
        let todayDailyStars = 0;
        let todayStarted = false;
        if (todayStarsRef.current.repo === repo) {
          todayDailyStars = todayStarsRef.current.count;
          todayStarted = todayStarsRef.current.started;
        } else {
          try {
            const r = await fetch(`${HOST}/todayStars?repo=${repo}`);
            if (r.ok) {
              const todayData = await r.json();
              todayDailyStars = todayData?.stars || 0;
              todayStarted = todayData?.started === true;
            }
          } catch (_e) {
            todayDailyStars = 0;
            todayStarted = false;
          }
          if (!isCurrentGraph()) return;
          todayStarsRef.current = { repo, count: todayDailyStars, started: todayStarted };
        }

        if (todayStarted) {
          // Cumulative for the synthesised today must extend prevTotalStars so
          // the chart stays internally consistent.
          const todayTotalStars = prevTotalStars + todayDailyStars;
          starHistory.push([formattedToday, todayDailyStars, todayTotalStars]);
        }

        // Update the starsLast10d value to include today's stars
        const updatedLast10DaysStars = calculateStarsLast10Days(starHistory);
        setStarsLast10d(updatedLast10DaysStars);
        console.log("Updated last 10 days stars count:", updatedLast10DaysStars);

        // Recalculate peak markers to include today's partial data
        // Period markers have an 'end' property; day peak markers only have 'start'
        const existingPeakMarkers = currentPeaks.current.filter(p => p.end); // keep period markers
        const existingDayMarkers = currentPeaks.current.filter(p => !p.end); // day peak markers

        // Check if today beats the current max day peak
        const currentMaxDayStars = existingDayMarkers.length > 0 ? (existingDayMarkers[0].value || 0) : 0;
        if (todayDailyStars > currentMaxDayStars) {
          const updatedDayMarker = {
            start: formattedToday,
            timeformat: "%d-%m-%Y",
            label: `${todayDailyStars.toLocaleString()} is the maximum number of new stars in one day`,
            value: todayDailyStars,
            style: { marker: { fill: "#10b981" } },
          };
          currentPeaks.current = [...existingPeakMarkers, updatedDayMarker];
        }

        // Recalculate max 10-day period to include today
        if (starHistory.length >= 10) {
          let bestSum = 0, bestStart = 0;
          let windowSum = 0;
          for (let i = 0; i < 10 && i < starHistory.length; i++) windowSum += starHistory[i][1];
          bestSum = windowSum;
          for (let i = 10; i < starHistory.length; i++) {
            windowSum += starHistory[i][1] - starHistory[i - 10][1];
            if (windowSum > bestSum) {
              bestSum = windowSum;
              bestStart = i - 9;
            }
          }
          const currentMaxPeriod = existingPeakMarkers.length > 0 ? (existingPeakMarkers[0].value || 0) : 0;
          if (bestSum > currentMaxPeriod) {
            const updatedPeriodMarker = {
              start: starHistory[bestStart][0],
              end: starHistory[bestStart + 9][0],
              label: `${bestSum.toLocaleString()} is the highest number of new stars in a 10 day period`,
              value: bestSum,
              timeformat: "%d-%m-%Y",
              type: "full",
            };
            const dayMarkers = currentPeaks.current.filter(p => !p.end);
            currentPeaks.current = [updatedPeriodMarker, ...dayMarkers];
          }
        }
      } else {
        console.log("Star history is not complete until yesterday. Not adding current day's data point.");
      }
    }

    if (!isCurrentGraph()) return;
    rawStarsRef.current = starHistory.map(day => [...day]);
    handleZoom(selectedTimeRange.start, selectedTimeRange.end);
    let appliedTransformationResult = starHistory;
    let binning = {};

    // Async trend/feed requests must not mutate the currently displayed chart.
    const options = {
      ...ds,
      dataSource: {
        ...ds.dataSource,
        chart: { ...ds.dataSource.chart },
        xAxis: { ...ds.dataSource.xAxis },
        yAxis: ds.dataSource.yAxis.map(axis => ({ ...axis, plot: { ...axis.plot } })),
      },
    };

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
        const repoParsed = parseGitHubRepoURL(currentRepoRef.current);
        const trendResult = await fetchPredictions(repoParsed, starHistory);
        if (!isCurrentGraph()) return;
        appliedTransformationResult = trendResult.data;
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Trend";
        options.dataSource.yAxis[0].plot.type = "line";
        options.dataSource.subcaption = {
          text: trendResult.source === "local"
            ? "7-day average · calculated locally"
            : "API trend · future dates are estimates",
        };
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
      case "weeklyGrowthRate":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "WoW Growth Rate (%)";
        appliedTransformationResult = calculateWeeklyGrowthRate(starHistory);
        options.dataSource.yAxis[0].plot.type = "column";
        options.dataSource.yAxis[0].referenceline = [
          {
            label: "0%",
            value: 0,
          },
        ];
        break;

      default:
        break;
    }

    switch (feed) {
      case "hacker":
        await fetchHNFeed(options);
        break;
      case "reddit":
      case "redditStrict":
        await fetchRedditFeed(options, true);
        break;
      case "redditBroad":
        await fetchRedditFeed(options, false);
        break;
      case "youtube":
        await fetchYoutubeFeed(options);
        break;
      case "releases":
        await fetchReleasesFeed(options);
        break;
      case "ghmentions":
        await fetchGitHubMentionsFeed(options);
        break;
      case "none":
        options.dataSource.xAxis.timemarker = currentPeaks.current;
        break;
    }

    if (!isCurrentGraph()) return;
    const fusionTable = new FusionCharts.DataStore().createDataTable(
      appliedTransformationResult,
      schema
    );

    options.dataSource.data = fusionTable;

    options.dataSource.xAxis.binning = binning;
    options.dataSource.chart.theme = theme;
    options.dataSource.chart.exportFileName = `${currentRepoRef.current.replace(
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

    if (!isCurrentGraph()) return;
    options.dataSource.caption = { text: `Stars ${graphRepo}` };
    setds(previous => ({
      ...options,
      dataSource: {
        ...options.dataSource,
        chart: { ...options.dataSource.chart, theme: previous.dataSource.chart.theme },
      },
    }));
  };

  const fetchAllStars = async (repo, ignoreForceRefetch = false, currentTotalStars = 0, attempt = 0, requestVersion = requestVersionRef.current) => {
    if (!isMountedRef.current || requestVersionRef.current !== requestVersion) return;

    setCurrentStarsHistory([]);
    setStarsLast10d("");
    // Clear old mentions when fetching new repo data
    currentHNnews.current = {};
    currentPeaks.current = [];
    todayStarsRef.current = { repo: null, count: 0, started: false };

    // 1. Check status first
    const status = await fetchStatus(repo, requestVersion);

    // If status fetch failed, exit early
    if (!isMountedRef.current || requestVersionRef.current !== requestVersion) return;
    if (!status) {
      setLoading(false);
      pendingRepoRef.current = null;
      closeSSE();
      return;
    }

    let fetchUrl = `${HOST}/allStars?repo=${repo}`;
    if (forceRefetch && !ignoreForceRefetch) {
      fetchUrl += "&forceRefetch=true";
    }

    fetch(fetchUrl)
      .then((response) => {
        if (!isMountedRef.current) return null; // Component unmounted
        if (requestVersionRef.current !== requestVersion) return null; // Stale request
        if (response.status === 204) {
          if (attempt >= 60) throw new Error("This repository is still being processed. Please try again shortly.");
          historyRetryRef.current = setTimeout(() => fetchAllStars(repo, true, currentTotalStars, attempt + 1, requestVersion), 2000);
          return null;
        }
        if (!response.ok) {
          throw new Error(response.status === 429
            ? "GitHub’s rate limit has been reached. Please try again later."
            : "Couldn’t load star history. Please try again.");
        }
        // Clear any existing errors on successful API call
        setShowError(false);
        return response.json();
      })
      .then((data) => {
        if (!data || !isMountedRef.current) return; // Component unmounted or no data
        if (requestVersionRef.current !== requestVersion) return; // Stale request
        setLoading(false);

        // Support both legacy format (plain array) and current format ({stars: [...], ...})
        const isLegacyFormat = Array.isArray(data);
        const starHistory = isLegacyFormat ? data : data.stars;
        if (!starHistory) {
          pendingRepoRef.current = null;
          closeSSE();
          setError("No star data received. Please try again.");
          setShowError(true);
          return;
        }
        setHistoryLoaded(true);
        pendingRepoRef.current = null;
        closeSSE();
        setCurrentStarsHistory(starHistory);

        // Set starsLast10d from server response
        setStarsLast10d(isLegacyFormat ? "" : (data.newLast10Days ?? ""));

        // Process max periods and peaks data for the chart markers
        const maxPeriods = (!isLegacyFormat && data.maxPeriods) ? data.maxPeriods.map((period) => ({
          start: period.StartDay,
          end: period.EndDay,
          label: `Best 10d: ${period.TotalStars.toLocaleString()} ⭐`,
          value: period.TotalStars,
          timeformat: "%d-%m-%Y",
          type: "full",
          style: {
            marker: {
              fill: "rgba(139, 92, 246, 0.15)",
              stroke: "#8b5cf6",
              "stroke-width": 1,
            },
            text: {
              fill: "#a78bfa",
            },
          },
        })) : [];
        const maxPeaks = (!isLegacyFormat && data.maxPeaks) ? data.maxPeaks.map((peak) => ({
          start: peak.Day,
          timeformat: "%d-%m-%Y",
          label: `Best day: ${peak.Stars.toLocaleString()} ⭐`,
          value: peak.Stars,
          style: {
            marker: {
              fill: "#10b981", // Emerald-500 - softer and more professional than bright green
            },
          },
        })) : [];
        currentPeaks.current = maxPeriods.concat(maxPeaks);

        const totalStarsToUse = currentTotalStars || (starHistory.length > 0 ? starHistory[starHistory.length - 1][2] : 0);

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
              if (requestVersionRef.current !== requestVersion) return null; // Stale request
              if (res.ok) {
                // Clear any existing errors on successful API call
                setShowError(false);
              }
              return res.json();
            })
            .then(recentData => {
              if (!recentData || requestVersionRef.current !== requestVersion) return; // Stale request
              const existingDays = new Set(starHistory.map(d => d[0]));
              const merged = [
                ...starHistory,
                ...recentData.stars.filter(d => !existingDays.has(d[0]))
              ];
              setCurrentStarsHistory(merged);

              // Important change here: Update the graph with data AND title together
              updateGraphWithTitle(merged, repo, totalStarsToUse, requestVersion);

            })
            .catch((error) => {
              if (requestVersionRef.current !== requestVersion) return; // Stale request
              console.error("Error fetching recent stars:", error);
              setError("Failed to fetch recent star data. Using cached data instead.");
              setShowError(true);
              // Fall back to using the cached data we already have

              // Important change here: Update the graph with data AND title together
              updateGraphWithTitle(starHistory, repo, totalStarsToUse, requestVersion);
            });
        } else {
          // Important change here: Update the graph with data AND title together
          updateGraphWithTitle(starHistory, repo, totalStarsToUse, requestVersion);
        }
      })
      .catch((e) => {
        if (!isMountedRef.current || requestVersionRef.current !== requestVersion) return;
        pendingRepoRef.current = null;
        closeSSE();
        setError(e.message || "Couldn’t load star history. Please try again.");
        setShowError(true);
        setLoading(false);
      });
  };

  const updateGraphWithTitle = async (starHistory, repo, currentTotalStars = 0, requestVersion = requestVersionRef.current) => {
    const graphVersion = ++graphVersionRef.current;
    const isCurrentGraph = () => isMountedRef.current
      && requestVersionRef.current === requestVersion && graphVersionRef.current === graphVersion;
    if (!starHistory.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await updateGraph(starHistory, currentTotalStars, requestVersion, graphVersion);
    } catch (error) {
      if (!isCurrentGraph()) return;
      setError("Couldn’t render this chart. Try loading the repository again.");
      setShowError(true);
      console.error(error);
    } finally {
      if (isCurrentGraph()) setLoading(false);
    }
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
    const repoParsed = parseGitHubRepoURL(currentRepoRef.current);
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
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Error downloading CSV:", error);
        setError("Failed to download CSV. Please try again later.");
        setShowError(true);
      });
  };

  const downloadJSON = () => {
    const repoParsed = parseGitHubRepoURL(currentRepoRef.current);
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
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("Error downloading JSON:", error);
        setError("Failed to download JSON. Please try again later.");
        setShowError(true);
      });
  };

  const openCurrentRepoPage = () => {
    const repoParsed = parseGitHubRepoURL(currentRepoRef.current);
    window.open("https://github.com/" + repoParsed, "_blank", "noopener,noreferrer");
  };

  const closeSSE = sseClient.close;

  const startSSEUpdates = (repo) => {
    const sse = sseClient.open(`${HOST}/sse?repo=${encodeURIComponent(repo)}`);
    sse.addEventListener("current-value", event => {
      if (!isMountedRef.current || currentRepoRef.current !== repo) return;
      try {
        const value = Number(JSON.parse(event.data).data);
        if (Number.isFinite(value)) setProgressValue(value);
      } catch { /* History requests can finish even if a progress event is malformed. */ }
    });
  };

  const handleClick = () => handleClickWithRepo(repoInput);

  const handleClickWithRepo = async (repo) => {
    const repoParsed = parseGitHubRepoURL(repo.trim());
    if (!repoParsed) {
      setError("Enter owner/repository or paste a GitHub repository URL.");
      setShowError(true);
      return;
    }
    if (pendingRepoRef.current === repoParsed) return;
    pendingRepoRef.current = repoParsed;
    const requestVersion = ++requestVersionRef.current;
    graphVersionRef.current += 1;
    trendRequestRef.current?.controller.abort();
    trendRequestRef.current = null;
    const isCurrent = () => isMountedRef.current && requestVersionRef.current === requestVersion;
    closeSSE();
    clearTimeout(historyRetryRef.current);
    currentRepoRef.current = repoParsed;
    setLastRepo(repoParsed);
    setSelectedRepo(repoParsed);
    setRepoInput(repoParsed);
    setShowError(false);
    setHistoryLoaded(false);
    setCurrentStarsHistory([]);
    rawStarsRef.current = [];
    setTotalStars(0);
    setStarsLast10d("");
    setCreationDate("");
    setAge("");
    setZoomedStars(0);
    setZoomedStarsPercentageTotal(0);
    setProgressValue(0);
    setLoading(true);
    setds(previous => ({
      ...previous,
      dataSource: { ...previous.dataSource, caption: { text: `Stars ${repoParsed}` }, data: null },
    }));
    if (location.pathname !== `/${repoParsed}`) {
      navigate({ pathname: `/${repoParsed}`, search: location.search });
    }
    const res = await fetchTotalStars(repoParsed, requestVersion);
    if (!isCurrent()) return;
    if (!res) {
      pendingRepoRef.current = null;
      setLoading(false);
      return;
    }
    setTotalStars(res.stars);
    setCreationDate(res.createdAt || "");
    if (res.createdAt) {
      const { years, months, days } = intervalToDuration({ start: parseISO(res.createdAt), end: Date.now() });
      setAge([years ? `${years}y` : "", months ? `${months}m` : "", days ? `${days}d` : ""].filter(Boolean).join(" ") || "<1d");
    }
    startSSEUpdates(repoParsed);
    fetchAllStars(repoParsed, false, res.stars, 0, requestVersion);
  };

  useEffect(() => {
    handleClickWithRepo(user && repository ? `${user}/${repository}` : lastRepo);
  }, [user, repository]);

  const activityLaneData = useMemo(() => {
    if (!currentStarsHistory || currentStarsHistory.length === 0 || feed === "none") {
      return null;
    }

    const parsedHistory = currentStarsHistory
      .map((item) => ({
        dateLabel: item[0],
        dateObj: parseTimelineDate(item[0]),
      }))
      .filter((item) => item.dateObj && !Number.isNaN(item.dateObj.getTime()))
      .sort((a, b) => a.dateObj - b.dateObj);

    if (parsedHistory.length === 0) return null;

    let rangeStart = parseTimelineDate(selectedTimeRange?.start) || parsedHistory[0].dateObj;
    let rangeEnd = parseTimelineDate(selectedTimeRange?.end) || parsedHistory[parsedHistory.length - 1].dateObj;
    if (rangeStart > rangeEnd) {
      const tmp = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = tmp;
    }

    const visiblePoints = parsedHistory.filter(
      (item) => item.dateObj >= rangeStart && item.dateObj <= rangeEnd
    );
    const points = visiblePoints.length > 0 ? visiblePoints : parsedHistory;

    const activeDateSet = new Set(
      Object.keys(currentHNnews.current || {}).map((date) => normalizeTimelineDate(date))
    );

    const activeDays = points.reduce(
      (sum, item) => sum + (activeDateSet.has(normalizeTimelineDate(item.dateLabel)) ? 1 : 0),
      0
    );

    const targetBins = Math.min(140, points.length);
    const binSize = Math.max(1, Math.ceil(points.length / targetBins));
    const bins = [];

    for (let i = 0; i < points.length; i += binSize) {
      const chunk = points.slice(i, i + binSize);
      const activeCount = chunk.reduce(
        (sum, item) => sum + (activeDateSet.has(normalizeTimelineDate(item.dateLabel)) ? 1 : 0),
        0
      );

      bins.push({
        start: chunk[0]?.dateLabel || "",
        end: chunk[chunk.length - 1]?.dateLabel || "",
        activeCount,
        ratio: chunk.length > 0 ? activeCount / chunk.length : 0,
      });
    }

    return {
      bins,
      activeDays,
      totalDays: points.length,
      rangeStart: points[0]?.dateLabel || "",
      rangeEnd: points[points.length - 1]?.dateLabel || "",
    };
  }, [currentStarsHistory, selectedTimeRange, feed, ds]);

  const hasChart = currentStarsHistory.length > 0 && Boolean(ds?.dataSource?.data);
  useEffect(() => {
    const host = chartHostRef.current;
    const content = host?.closest(".content");
    if (!host || !content || !hasChart) return;
    let lastSize = "";
    let frame;
    const resizeChart = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = host.getBoundingClientRect();
        const top = bounds.top - content.getBoundingClientRect().top + content.scrollTop;
        const width = Math.floor(bounds.width);
        const height = Math.max(360, Math.floor(content.clientHeight - top - 16));
        const size = `${width}:${height}`;
        if (width > 0 && size !== lastSize && chartRef.current?.chartObj) {
          lastSize = size;
          chartRef.current.chartObj.resizeTo(width, height);
        }
      });
    };
    const observer = new ResizeObserver(resizeChart);
    observer.observe(host);
    host.closest(".desktop-stars")?.querySelectorAll(".desktop-stars__pins, .desktop-stars__search, .desktop-stars__controls, .desktop-stars__loading, .desktop-stars__error")
      .forEach(element => observer.observe(element));
    window.addEventListener("resize", resizeChart);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resizeChart);
    };
  }, [hasChart, pinnedRepos.length]);

  const chartBusy = loading || !hasChart;
  const transforms = [
    ["none", "Daily stars"], ["trend", "Trend"], ["yearlyBinning", "Group by year"],
    ["monthlyBinning", "Group by month"], ["weeklyBinning", "Group by week"],
    ["normalize", "Normalize peaks"], ["loess", "LOESS smoothing"],
    ["runningAverage", "Running average"], ["runningMedian", "Running median"],
    ["firstOrderDerivative", "First derivative"], ["secondOrderDerivative", "Second derivative"],
    ["weeklyGrowthRate", "Weekly growth rate"],
  ];

  return (
    <div className="desktop-stars" data-theme={appTheme}>
      <header className="desktop-stars__header">
        <div>
          <p className="desktop-stars__eyebrow">Repository star history</p>
          <h1>{selectedRepo}</h1>
        </div>
      </header>

      {pinnedRepos.length > 0 && (
        <nav className="desktop-stars__card desktop-stars__pins" aria-label="Pinned repositories">
          <PushPinIcon className="desktop-stars__pins-icon" fontSize="small" />
          {pinnedRepos.map(repo => (
            <div className="desktop-stars__pin" key={repo}>
              <button type="button" onClick={() => handleClickWithRepo(repo)} aria-label={`Open ${repo}`}
                aria-current={repo === selectedRepo ? "page" : undefined}>{repo}</button>
              <button type="button" onClick={() => togglePin(repo)} aria-label={`Unpin ${repo}`}><CloseIcon fontSize="inherit" /></button>
            </div>
          ))}
          <Button size="small" color="inherit" onClick={clearPinned}>Clear pins</Button>
        </nav>
      )}

      <section className="desktop-stars__card desktop-stars__search" aria-label="Repository search">
        <div className="desktop-stars__search-row">
          <Autocomplete
            freeSolo disablePortal id="combo-box-repo" size="small"
            options={starsRepos} value={selectedRepo} inputValue={repoInput}
            sx={{ flex: "1 1 260px", minWidth: 220, maxWidth: 400 }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.target.getAttribute("aria-activedescendant")) {
                event.defaultMuiPrevented = true;
                event.preventDefault();
                handleClick();
              }
            }}
            renderInput={params => (
              <TextField {...params} label="GitHub repository" placeholder="owner/repository or GitHub URL"
                slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, autoCapitalize: "none", autoCorrect: "off", spellCheck: false } }} />
            )}
            onChange={(event, value, reason) => {
              if (reason === "selectOption" || reason === "createOption") handleClickWithRepo(value || "");
              if (reason === "clear") setRepoInput("");
            }}
            onInputChange={(event, value, reason) => {
              if (reason === "input") setRepoInput(value);
            }}
          />
          <FormControl size="small" sx={{ width: 120 }} disabled={loading || !historyLoaded}>
            <InputLabel id="desktop-feed-label">Feeds</InputLabel>
            <Select labelId="desktop-feed-label" id="desktop-feed" value={feed} label="Feeds" onChange={handleFeedChange}
              renderValue={selected => FEED_LABELS[selected] || selected}>
              <MenuItem value="none">None</MenuItem><MenuItem value="releases">Releases</MenuItem>
              <MenuItem value="hacker">Hacker News</MenuItem><MenuItem value="redditStrict">Reddit (strict)</MenuItem>
              <MenuItem value="redditBroad">Reddit (broad)</MenuItem><MenuItem value="ghmentions">GitHub mentions</MenuItem>
              <MenuItem value="youtube">YouTube</MenuItem>
            </Select>
          </FormControl>
          <LoadingButton onClick={handleClick} endIcon={<SendIcon />} loading={loading} loadingPosition="end"
            variant="contained" size="small" aria-label="Fetch repository" disabled={!repoInput.trim()}>
            Fetch
          </LoadingButton>
          <Tooltip title={pinnedRepos.includes(selectedRepo) ? "Unpin repository" : "Pin repository"}>
            <span><IconButton size="small" onClick={() => togglePin(selectedRepo)} disabled={!historyLoaded || loading}
              aria-label={pinnedRepos.includes(selectedRepo) ? `Unpin ${selectedRepo}` : `Pin ${selectedRepo}`}
              aria-pressed={pinnedRepos.includes(selectedRepo)} color={pinnedRepos.includes(selectedRepo) ? "primary" : "default"}>
              {pinnedRepos.includes(selectedRepo) ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
            </IconButton></span>
          </Tooltip>
          {showForceRefetch && (
            <Tooltip title={FORCE_REFETCH_TOOLTIP}>
              <FormControlLabel control={<Checkbox checked={forceRefetch} onChange={handleForceRefetchChange} size="small" />} label="Refresh cached data" />
            </Tooltip>
          )}
          <Tooltip title={INFO_TOOLTIP}>
            <IconButton size="small" aria-label="How to explore the chart"><InfoOutlinedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <TextField id="total-stars" size="small" label="Total stars" sx={{ width: 110 }}
            value={historyLoaded ? totalStars.toLocaleString() : "—"} slotProps={{ input: { readOnly: true } }} />
          <TextField id="last-10d" size="small" label="Last 10 days" sx={{ width: 110 }}
            value={historyLoaded && starsLast10d !== "" ? `+${Number(starsLast10d).toLocaleString()}` : "—"} slotProps={{ input: { readOnly: true } }} />
          <TextField id="creation-date" size="small" label="Created (UTC)" sx={{ width: 220 }}
            value={historyLoaded ? creationDate || "—" : "—"} slotProps={{ input: { readOnly: true } }} />
          <TextField id="age" size="small" label="Age" sx={{ width: 120 }}
            value={historyLoaded ? age || "—" : "—"} slotProps={{ input: { readOnly: true } }} />
        </div>
      </section>

      {showError && (
        <Alert severity="error" className="desktop-stars__error" action={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Button color="inherit" size="small" onClick={() => handleClickWithRepo(selectedRepo)} disabled={loading}>Try again</Button>
            <IconButton aria-label="Dismiss error" color="inherit" size="small" onClick={() => setShowError(false)}><CloseIcon fontSize="inherit" /></IconButton>
          </Box>
        }>{error}</Alert>
      )}

      <section className="desktop-stars__card desktop-stars__controls" aria-label="Chart controls">
        <FormControl size="small" sx={{ width: 110 }} disabled={chartBusy}>
          <InputLabel id="desktop-theme-label">Theme</InputLabel>
          <Select labelId="desktop-theme-label" value={theme} label="Theme" onChange={handleThemeChange}>
            <MenuItem value="fusion">Fusion</MenuItem><MenuItem value="candy">Candy</MenuItem><MenuItem value="gammel">Gammel</MenuItem><MenuItem value="zune">Zune</MenuItem><MenuItem value="umber">Umber</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ width: 160 }} disabled={loading || !historyLoaded}>
          <InputLabel id="desktop-transform-label">Transform</InputLabel>
          <Select labelId="desktop-transform-label" value={transformation} label="Transform" onChange={handleTransformationChange}>
            {transforms.map(([value, label]) => <MenuItem value={value} key={value}>{label}</MenuItem>)}
          </Select>
        </FormControl>
        {transformation.includes("Binning") && (
          <FormControl size="small" sx={{ width: 110 }} disabled={chartBusy}>
            <InputLabel id="desktop-aggregate-label">Aggregate</InputLabel>
            <Select labelId="desktop-aggregate-label" value={aggregation} label="Aggregate" onChange={handleAggregationChange}>
              <MenuItem value="average">Mean</MenuItem><MenuItem value="sum">Total</MenuItem><MenuItem value="max">Maximum</MenuItem><MenuItem value="min">Minimum</MenuItem>
            </Select>
          </FormControl>
        )}
        <FormControlLabel control={<Checkbox checked={checkedYAxisType} onChange={handleYAxisTypeCheckChange} size="small" disabled={chartBusy} slotProps={{ input: { "aria-label": "Logarithmic Y axis" } }} />} label="Log Y" />
        <span className="desktop-stars__separator" aria-hidden="true" />
        <Button size="small" variant="outlined" onClick={downloadCSV} disabled={chartBusy} aria-label="Download star history as CSV">CSV</Button>
        <Button size="small" variant="outlined" onClick={downloadJSON} disabled={chartBusy} aria-label="Download star history as JSON">JSON</Button>
        <CopyToClipboardButton dateRange={checkedDateRange ? selectedTimeRange : null} transformation={transformation} aggregation={transformation.includes("Binning") ? aggregation : null} disabled={chartBusy} />
        <Tooltip title="Include the selected dates in the shared link">
          <FormControlLabel control={<Checkbox checked={checkedDateRange} onChange={handleDateRangeCheckChange} size="small" disabled={chartBusy} slotProps={{ input: { "aria-label": "Share selected dates" } }} />} label="Date range" />
        </Tooltip>
        <span className="desktop-stars__separator" aria-hidden="true" />
        <TextField id="zoomed-stars" size="small" label="Stars in selection" sx={{ width: 165 }}
          value={hasChart ? `${formatNumber(zoomedStars)} (${zoomedStarsPercentageTotal}%)` : "—"}
          slotProps={{ input: { readOnly: true } }} />
        <Button id="desktop-range" size="small" variant="outlined" onClick={last30Active ? applyFullTimelineView : applyLast30DaysView} disabled={chartBusy}>
          {last30Active ? "All history" : "Last 30 days"}
        </Button>
        <span className="desktop-stars__separator" aria-hidden="true" />
        <Button size="small" variant="outlined" onClick={openCurrentRepoPage} disabled={!historyLoaded || loading}>Open repo</Button>
      </section>

      <section className="desktop-stars__card desktop-stars__chart" aria-label="Star history chart">
        {loading && <div className="desktop-stars__loading" role="status"><p>Loading {selectedRepo}… {progressValue > 0 && `${progressValue} history requests completed.`}</p><LinearProgress aria-label="Loading repository history" /></div>}
        <Box id="chart-container" ref={chartHostRef} className="desktop-stars__canvas" aria-busy={loading}>
          {hasChart ? <ReactFC ref={chartRef} {...ds} /> : (
            <div className="desktop-stars__empty">
              <h2>{loading ? "Fetching star history" : showError ? "History could not be loaded" : "No daily history yet"}</h2>
              <p>{loading ? "The chart will appear here when the data is ready." : showError ? "Try again above, or choose another repository." : "Daily history includes completed days. Try another repository or check back after the next UTC day."}</p>
            </div>
          )}
        </Box>
        {activityLaneData && activityLaneData.bins.length > 0 && (
          <Box sx={{ mt: 1.2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.6 }}>
              <Typography variant="caption" sx={{ color: currentTheme.textMuted }}>
                Activity Lane: {activityLaneData.activeDays.toLocaleString()} active days
              </Typography>
              <Typography variant="caption" sx={{ color: currentTheme.textMuted }}>
                {activityLaneData.rangeStart} → {activityLaneData.rangeEnd}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: `repeat(${activityLaneData.bins.length}, minmax(0, 1fr))`,
                gap: "2px",
                background: appTheme === "dark" ? "rgba(148, 163, 184, 0.1)" : "rgba(148, 163, 184, 0.2)",
                border: `1px solid ${currentTheme.cardBorder}`,
                borderRadius: "999px",
                p: "2px",
                minHeight: "12px",
              }}
            >
              {activityLaneData.bins.map((bin, index) => {
                let color = appTheme === "dark" ? "rgba(148, 163, 184, 0.25)" : "rgba(148, 163, 184, 0.35)";
                if (bin.activeCount > 0 && bin.ratio >= 0.6) {
                  color = "#22c55e";
                } else if (bin.activeCount > 0 && bin.ratio >= 0.3) {
                  color = "#60a5fa";
                } else if (bin.activeCount > 0) {
                  color = "#f59e0b";
                }

                return (
                  <Box
                    key={`${bin.start}-${index}`}
                    title={`${bin.start}${bin.start !== bin.end ? ` → ${bin.end}` : ""}: ${bin.activeCount} active day(s)`}
                    sx={{
                      borderRadius: "999px",
                      background: color,
                      minHeight: "8px",
                    }}
                  />
                );
              })}
            </Box>
            <Typography variant="caption" sx={{ color: currentTheme.textMuted, mt: 0.5, display: "block" }}>
              Green = dense activity, blue = medium, amber = sparse
            </Typography>
          </Box>
        )}
        <footer className="desktop-stars__chart-footer">
          <p className="desktop-stars__hint">Scroll to zoom · Drag the lower navigator · Today’s count may be partial</p>
        </footer>
      </section>
    </div>
  );
}

export default TimeSeriesChart;
