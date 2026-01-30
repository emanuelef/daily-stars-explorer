/* eslint-disable no-case-declarations */
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Autocomplete from "@mui/material/Autocomplete";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import { Link } from "react-router-dom";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema-compare";
import { parseGitHubRepoURL } from "./githubUtils";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import UmberTheme from "fusioncharts/themes/fusioncharts.theme.umber";
import CopyToClipboardButton from "./CopyToClipboardButton";

import {
  formatNumber,
} from "./utils";

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

const formatDate = (originalDate) => {
  const parts = originalDate.split("-");
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const INCLUDE_DATE_RANGE =
  "When checked the URL to share will include the current time range selected";

ReactFC.fcRoot(
  FusionCharts,
  TimeSeries,
  GammelTheme,
  CandyTheme,
  ZuneTheme,
  UmberTheme
);

const isToday = (dateString) => {
  const today = new Date();
  const [day, month, year] = dateString.split("-").map(Number);
  return (
    today.getDate() === day &&
    today.getMonth() + 1 === month && // Adding 1 to month because JavaScript months are 0-indexed
    today.getFullYear() === year
  );
};

function CompareChart() {
  const chart_props = {
    type: "timeseries",
    width: "100%",
    height: "80%",
    dataEmptyMessage: "Fetching data...",
    dataSource: {
      caption: { text: "Stars" },
      data: null,
      series: "Repo",
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
        binning: {},
      },
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
          handleZoom(ev.data.start, ev.data.end);
        }
      },
      rendered: function (e) {
        setTimeout(() => {
          e.sender.setTimeSelection(selectedTimeRange);
        }, 1000);
      },
    },
  };

  const { user, repository, secondUser, secondRepository } = useParams();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const [open, setOpen] = useState(true);

  const handleClose = () => {
    setOpen(false);
  };

  let defaultRepo =
    user && repository ? `${user}/${repository}` : "facebook/react";
  let defaultRepo2 =
    secondUser && secondRepository
      ? `${secondUser}/${secondRepository}`
      : "vuejs/vue";

  const [ds, setds] = useState(chart_props);
  const [loading, setLoading] = useState(false);

  const [theme, setTheme] = useState("candy");

  const [aggregation, setAggregation] = useState(
    queryParams.get("aggregation") || "none"
  );

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [selectedRepo2, setSelectedRepo2] = useState(defaultRepo2);
  const [starsRepos, setStarsRepos] = useState([]);

  const currentRepo = useRef(defaultRepo);
  const currentRepo2 = useRef(defaultRepo2);

  const [checkedDateRange, setCheckedDateRange] = useState(false);

  const [checkedYAxisType, setCheckedYAxisType] = useState(false);

  //const chartRef = useRef(null);

  const [selectedTimeRange, setSelectedTimeRange] = useState({
    start: queryParams.get("start"),
    end: queryParams.get("end"),
  });

  const navigate = useNavigate();

  const [zoomedStars, setZoomedStars] = useState({});
  const [zoomedStarsPercentageTotal, setZoomedStarsPercentageTotal] = useState({});

  const handleZoom = (start, end) => {
    if (ds && ds.dataSource && ds.dataSource.data) {
      // Filter data points within the zoomed range
      const zoomedData = ds.dataSource.data._data.filter(
        (dataPoint) => dataPoint[0] >= start && dataPoint[0] <= end
      );

      // Calculate total stars for each repository during the zoomed period
      const totalsByRepo = zoomedData.reduce((totals, dataPoint) => {
        const repo = dataPoint[3]; // Repo name
        const starsGained = dataPoint[1]; // Stars gained
        if (!totals[repo]) {
          totals[repo] = 0;
        }
        totals[repo] += starsGained;
        return totals;
      }, {});

      console.log("Totals by Repository:", totalsByRepo);

      // Get the latest total stars for each repository from the full dataset
      const latestTotalsByRepo = ds.dataSource.data._data.reduce((latestTotals, dataPoint) => {
        const repo = dataPoint[3]; // Repo name
        const totalStars = dataPoint[2]; // Total stars
        latestTotals[repo] = totalStars; // Always overwrite to ensure the last valid is kept
        return latestTotals;
      }, {});

      console.log("Latest Totals by Repository:", latestTotalsByRepo);

      console.log("Selected Repositories:", currentRepo.current, selectedRepo2);

      // Extract totals for the selected repositories
      const totalStarsRepo1 = totalsByRepo[currentRepo.current] || 0;
      const totalStarsRepo2 = totalsByRepo[currentRepo2.current] || 0;

      console.log("Total Stars Repo 1 (Zoomed):", totalStarsRepo1);
      console.log("Total Stars Repo 2 (Zoomed):", totalStarsRepo2);

      // Set total stars in state
      setZoomedStars({ [currentRepo.current]: totalStarsRepo1, [currentRepo2.current]: totalStarsRepo2 });

      // Calculate percentages relative to the latest total stars for each repository
      const latestTotalRepo1 = latestTotalsByRepo[currentRepo.current] || 1; // Avoid division by zero
      const latestTotalRepo2 = latestTotalsByRepo[currentRepo2.current] || 1; // Avoid division by zero

      const totalPercentageRepo1 = ((totalStarsRepo1 / latestTotalRepo1) * 100).toFixed(1);
      const totalPercentageRepo2 = ((totalStarsRepo2 / latestTotalRepo2) * 100).toFixed(1);

      console.log("Percentage Repo 1:", totalPercentageRepo1);
      console.log("Percentage Repo 2:", totalPercentageRepo2);

      // Set percentages in state
      setZoomedStarsPercentageTotal({
        [currentRepo.current]: totalPercentageRepo1,
        [currentRepo2.current]: totalPercentageRepo2,
      });
    }
  };


  const handleDateRangeCheckChange = (event) => {
    setCheckedDateRange(event.target.checked);
  };

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    const options = { ...ds };
    options.dataSource.chart.theme = event.target.value;
    setds(options);

    const repoParsed = parseGitHubRepoURL(selectedRepo);
    const repoParsed2 = parseGitHubRepoURL(selectedRepo2);

    navigate(
      `/compare/${repoParsed}/${repoParsed2}?start=${selectedTimeRange.start}&end=${selectedTimeRange.end}`,
      {
        replace: false,
      }
    );

    // http://localhost:5173/gh-repo-stats-server/#/compare/helm/helm-mapkubeapis/pipe-cd/pipecd?start=1585872000000&end=1700265600000
    // http://localhost:5173/gh-repo-stats-server/#/compare/helm/helm-mapkubeapis/pipe-cd/pipecd?start=1627131263936&end=1645079357900
  };

  const handleAggregationChange = (event) => {
    setAggregation(event.target.value);
  };

  const handleYAxisTypeCheckChange = (event) => {
    setCheckedYAxisType(event.target.checked);
    const options = { ...ds };
    options.dataSource.yAxis[0].type = event.target.checked ? "log" : "";
    setds(options);
  };

  useEffect(() => {
    fetchAllStars(selectedRepo, selectedRepo2);
  }, [aggregation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpen(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, []);

  const handleFetchResponse = (response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  };

  const options = { ...ds };

  const handleCombinedData = async (combinedData) => {
    let binning = {};

    console.log(combinedData);
    let appliedAggregationResult = combinedData;

    options.dataSource.yAxis[0].plot.type = "line";

    switch (aggregation) {
      case "none":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Daily Stars";
        options.dataSource.yAxis[0].plot.type = "line";
        break;
      case "trend":
        const repoParsed = parseGitHubRepoURL(selectedRepo);
        const repoParsed2 = parseGitHubRepoURL(selectedRepo2);

        const [predictions, predictions2] = await Promise.all([
          fetchPredictions(repoParsed),
          fetchPredictions(repoParsed2),
        ]);

        predictions.forEach((subarray) => {
          subarray.push(repoParsed);
        });

        predictions2.forEach((subarray) => {
          subarray.push(repoParsed2);
        });

        let currentRepo = repoParsed;
        let currentIndex = 0;

        do {
          predictions[currentIndex][2] = combinedData[currentIndex][2];
          currentIndex++;
          currentRepo = combinedData[currentIndex][3];
        } while (currentRepo == repoParsed);

        currentIndex--;

        let lastSum = combinedData[currentIndex][2];

        for (let index = currentIndex; index < predictions.length; index++) {
          predictions[index][2] = lastSum;
          lastSum += predictions[index][1];
        }

        currentIndex++;

        for (
          let index = 0;
          index < combinedData.length - currentIndex;
          index++
        ) {
          predictions2[index][2] = combinedData[currentIndex + index][2];
        }

        lastSum = combinedData[combinedData.length - 1][2];

        currentIndex = combinedData.length - currentIndex;

        for (let index = currentIndex; index < predictions2.length; index++) {
          predictions2[index][2] = lastSum;
          lastSum += predictions2[index][1];
        }

        appliedAggregationResult = predictions.concat(predictions2);

        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Trend";
        options.dataSource.yAxis[0].plot.type = "line";
        options.dataSource.subcaption = "Trend";
        break;
      case "yearlyBinning":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Daily Stars Average by Year";

        binning = YEARLY_BINNING;
        options.dataSource.yAxis[0].plot.type = "line";
        break;
      case "monthlyBinning":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Daily Stars Average by Month";
        binning = MONTHLY_BINNING;
        options.dataSource.yAxis[0].plot.type = "line";
        break;
      case "weeklyBinning":
        options.dataSource.yAxis[0].plot.value =
          schema[1].name =
          options.dataSource.yAxis[0].title =
          "Daily Stars Average by Week";
        binning = WEEKLY_BINNING;
        options.dataSource.yAxis[0].plot.type = "line";
        break;
      default:
        break;
    }

    console.log(appliedAggregationResult);

    const fusionTable = new FusionCharts.DataStore().createDataTable(
      appliedAggregationResult,
      schema
    );

    options.dataSource.caption = { text: `Stars` };
    options.dataSource.data = fusionTable;
    options.dataSource.xAxis.binning = binning;

    /*
    // Didn't work
    options.dataSource.xAxis.initialinterval = {
      from: "2022-01-01 12:00:00",
      to: "2023-01-31 12:00:00",
    };
    */

    options.dataSource.chart.theme = theme;
    options.dataSource.chart.exportFileName = `${selectedRepo.replace(
      "/",
      "_"
    )}-stars-history`;

    setds(options);
  };

  const fetchAllStarsKeys = async () => {
    try {
      const response = await fetch(`${HOST}/allStarsKeys`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`An error occurred: ${error}`);
    }
  };

  const removeUncompleteDay = (data) => {
    if (data.length > 1) {
      const lastElement = data[data.length - 1];
      console.log(lastElement[0]);
      const isLastElementToday = isToday(lastElement[0]);
      data.pop(); // remove last element as the current day is not complete
      console.log("isLastElementToday", isLastElementToday);
    } else {
      console.log("Array is empty.");
    }
  };

  const fetchPredictions = async (repo) => {
    try {
      setLoading(true);
      const response = await fetch(`${PREDICTOR_HOST}/predict?repo=${repo}`);
      setLoading(false);

      const data = await response.json();

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

  const fetchAllStars = (repo, repo2) => {
    setLoading(false);
    const fetchUrl = `${HOST}/allStars?repo=${repo}`;
    const fetchUrl2 = `${HOST}/allStars?repo=${repo2}`;

    const promises = [
      fetch(fetchUrl).then(handleFetchResponse),
      fetch(fetchUrl2).then(handleFetchResponse),
    ];

    Promise.all(promises)
      .then((results) => {
        const [data1, data2] = results;

        data1.stars.forEach((subarray) => {
          subarray.push(repo);
        });

        data2.stars.forEach((subarray) => {
          subarray.push(repo2);
        });

        removeUncompleteDay(data1.stars);
        removeUncompleteDay(data2.stars);

        handleCombinedData(data1.stars.concat(data2.stars));
        setLoading(false);
      })
      .catch((error) => {
        console.error(`An error occurred: ${error}`);
        setLoading(false);
      });
  };

  useEffect(() => {
    const fetchRepos = async () => {
      const repos = await fetchAllStarsKeys();
      console.log(repos);
      setStarsRepos(repos.sort());
    };

    fetchRepos();
    handleClick();
  }, [selectedRepo, selectedRepo2]);

  const handleClick = async () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    const repoParsed2 = parseGitHubRepoURL(selectedRepo2);

    if (repoParsed === null || repoParsed2 === null) {
      return;
    }

    navigate(`/compare/${repoParsed}/${repoParsed2}`, {
      replace: false,
    });

    fetchAllStars(repoParsed, repoParsed2);
  };

  const handleInputChange = async (value, setStateFunction) => {
    console.log(value);
    setStateFunction(value);
  };

  return (
    <Box sx={{ p: 1.5 }}>
      <div>
        {open && (
          <Alert
            severity="info"
            action={
              <IconButton
                aria-label="close"
                color="inherit"
                size="small"
                onClick={handleClose}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            }
            sx={{ mb: 1.5 }}
          >
            Consider this tool just as a way to compare trendiness, read more in{" "}
            <Link to="/info">here</Link>.
          </Alert>
        )}
      </div>

      <Alert severity="info" sx={{ mb: 1.5 }}>
        Only already fetched repositories are available for comparison. Zoom to see the increase in selection.
      </Alert>

      {/* Repository Selection */}
      <Paper elevation={2} sx={{ p: 1.5, mb: 1.5 }}>
        <Box sx={{ display: "flex", gap: 1.2, flexWrap: "wrap", alignItems: "center" }}>
        <Autocomplete
          disablePortal
          id="combo-box-repo"
          size="small"
          options={starsRepos.map((el) => ({ label: el }))}
          renderInput={(params) => (
            <TextField
              {...params}
              sx={{ width: 400 }}
              label="Repository 1"
              variant="outlined"
              size="small"
            />
          )}
          value={selectedRepo}
          onChange={(e, v) => {
            currentRepo.current = v?.label;
            setSelectedRepo(v?.label)
          }}
        />
        <TextField
          sx={{ width: 165 }}
          size="small"
          id="repo-increase"
          label="Increase"
          value={zoomedStars[selectedRepo] !== undefined
            ? `${formatNumber(zoomedStars[selectedRepo])} (${zoomedStarsPercentageTotal[selectedRepo]}%)`
            : "N/A"}
          InputProps={{
            readOnly: true,
          }}
        />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Autocomplete
          disablePortal
          id="combo-box-repo2"
          size="small"
          options={starsRepos.map((el) => ({ label: el }))}
          renderInput={(params) => (
            <TextField
              {...params}
              sx={{ width: 400 }}
              label="Repository 2"
              variant="outlined"
              size="small"
            />
          )}
          value={selectedRepo2}
          onChange={(e, v) => {
            currentRepo2.current = v?.label;
            setSelectedRepo2(v?.label)
          }}
        />
        <TextField
          sx={{ width: 165 }}
          size="small"
          id="repo2-increase"
          label="Increase"
          value={zoomedStars[selectedRepo2] !== undefined
            ? `${formatNumber(zoomedStars[selectedRepo2])} (${zoomedStarsPercentageTotal[selectedRepo2]}%)`
            : "N/A"}
          InputProps={{
            readOnly: true,
          }}
        />
        </Box>
      </Paper>

      {/* Controls & Actions */}
      <Paper elevation={2} sx={{ p: 1.5, mb: 1.5 }}>
        <Box sx={{ display: "flex", gap: 1.2, flexWrap: "wrap", alignItems: "center" }}>
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
            <InputLabel>Aggregate</InputLabel>
            <Select
              value={aggregation}
              label="Aggregate"
              onChange={handleAggregationChange}
            >
              <MenuItem value={"none"}>None</MenuItem>
              <MenuItem value={"trend"}>Trend</MenuItem>
              <MenuItem value={"yearlyBinning"}>Yearly Binning</MenuItem>
              <MenuItem value={"monthlyBinning"}>Monthly Binning</MenuItem>
              <MenuItem value={"weeklyBinning"}>Weekly Binning</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Checkbox
                checked={checkedYAxisType}
                onChange={handleYAxisTypeCheckChange}
                size="small"
              />
            }
            label={<Typography variant="body2">Log Y</Typography>}
          />
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <CopyToClipboardButton
            dateRange={checkedDateRange ? selectedTimeRange : null}
            aggregation={aggregation}
          />
          <Tooltip title={INCLUDE_DATE_RANGE}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={checkedDateRange}
                  onChange={handleDateRangeCheckChange}
                  size="small"
                />
              }
              label={<Typography variant="body2">Date Range</Typography>}
            />
          </Tooltip>
        </Box>
      </Paper>

      {/* Chart Container */}
      <Paper elevation={3} sx={{ p: 1.5 }}>
        <Box id="chart-container">
        {ds != null && ds != chart_props && ds && ds.dataSource.data && (
          <ReactFC {...ds} />
        )}
        </Box>
      </Paper>
    </Box>
  );
}

export default CompareChart;
