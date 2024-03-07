import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Autocomplete from "@mui/material/Autocomplete";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema-compare";
import { parseGitHubRepoURL } from "./githubUtils";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";
import CopyToClipboardButton from "./CopyToClipboardButton";

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

const INCLUDE_DATE_RANGE =
  "When checked the URL to share will include the current time range selected";

ReactFC.fcRoot(FusionCharts, TimeSeries, GammelTheme, CandyTheme, ZuneTheme);

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
  const { user, repository, secondUser, secondRepository } = useParams();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  let defaultRepo =
    user && repository ? `${user}/${repository}` : "facebook/react";
  let defaultRepo2 =
    secondUser && secondRepository
      ? `${secondUser}/${secondRepository}`
      : "vuejs/vue";

  const [ds, setds] = useState(null);
  const [loading, setLoading] = useState(false);

  const [theme, setTheme] = useState("candy");

  const [aggregation, setAggregation] = useState("none");

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [selectedRepo2, setSelectedRepo2] = useState(defaultRepo2);
  const [starsRepos, setStarsRepos] = useState([]);

  const [checkedDateRange, setCheckedDateRange] = useState(false);

  //const chartRef = useRef(null);

  const [selectedTimeRange, setSelectedTimeRange] = useState({
    start: queryParams.get("start"),
    end: queryParams.get("end"),
  });

  const navigate = useNavigate();

  const chart_props = {
    timeseriesDs: {
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
            plot: [
              {
                value: "New Stars",
              },
            ],
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
      },
    },
  };

  const handleDateRangeCheckChange = (event) => {
    setCheckedDateRange(event.target.checked);
  };

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    const options = { ...ds };
    options.timeseriesDs.dataSource.chart.theme = event.target.value;
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

  useEffect(() => {
    fetchAllStars(selectedRepo, selectedRepo2);
  }, [aggregation]);

  const handleFetchResponse = (response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  };

  const handleCombinedData = (combinedData) => {
    let binning = {};

    switch (aggregation) {
      case "none":
        schema[1].name = "Daily Stars";
        break;
      case "yearlyBinning":
        schema[1].name = "Yearly Average";
        binning = YEARLY_BINNING;
        break;
      case "monthlyBinning":
        schema[1].name = "Monthly Average";
        binning = MONTHLY_BINNING;
        break;
      case "weeklyBinning":
        schema[1].name = "Weekly Average";
        binning = WEEKLY_BINNING;
        break;
      default:
        break;
    }

    const fusionTable = new FusionCharts.DataStore().createDataTable(
      combinedData,
      schema
    );
    const options = { ...chart_props };
    options.timeseriesDs.dataSource.caption = { text: `Stars` };
    options.timeseriesDs.dataSource.data = fusionTable;
    options.timeseriesDs.dataSource.xAxis.binning = binning;
    options.timeseriesDs.dataSource.yAxis[0].plot[0].value = "Cumulative Stars";

    /*
    // Didn't work
    options.timeseriesDs.dataSource.xAxis.initialinterval = {
      from: "2022-01-01 12:00:00",
      to: "2023-01-31 12:00:00",
    };
    */

    options.timeseriesDs.dataSource.chart.theme = theme;
    options.timeseriesDs.dataSource.chart.exportFileName = `${selectedRepo.replace(
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

  return (
    <div>
      <Typography
        style={{
          marginTop: "10px",
          marginLeft: "20px",
          width: "700px",
        }}
        variant="body2"
      >
        Now, it only works when the history of both repositories has been
        fetched previously.
      </Typography>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Autocomplete
          disablePortal
          id="combo-box-repo"
          size="small"
          options={starsRepos.map((el) => {
            return { label: el };
          })}
          renderInput={(params) => (
            <TextField
              {...params}
              style={{
                marginTop: "20px",
                marginRight: "20px",
                marginLeft: "10px",
                width: "500px",
              }}
              label="Enter a GitHub repository"
              variant="outlined"
              size="small"
            />
          )}
          value={selectedRepo}
          onChange={(e, v) => {
            console.log(v?.label);
            setSelectedRepo(v?.label);
          }}
        />
        <Autocomplete
          disablePortal
          id="combo-box-repo2"
          size="small"
          options={starsRepos.map((el) => {
            return { label: el };
          })}
          renderInput={(params) => (
            <TextField
              {...params}
              style={{
                marginTop: "20px",
                marginRight: "20px",
                marginLeft: "10px",
                width: "500px",
              }}
              label="Enter a GitHub repository"
              variant="outlined"
              size="small"
            />
          )}
          value={selectedRepo2}
          onChange={(e, v) => {
            console.log(v?.label);
            setSelectedRepo2(v?.label);
          }}
        />
        <div
          style={{ marginTop: "20px", display: "flex", alignItems: "center" }}
        >
          <CopyToClipboardButton
            dateRange={checkedDateRange ? selectedTimeRange : null}
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
        </div>
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
        <FormControl
          style={{
            width: "180px",
            marginRight: "20px",
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
            <MenuItem value={"none"}>None</MenuItem>
            <MenuItem value={"yearlyBinning"}>Yearly Binning</MenuItem>
            <MenuItem value={"monthlyBinning"}>Monthly Binning</MenuItem>
            <MenuItem value={"weeklyBinning"}>Weekly Binning</MenuItem>
          </Select>
        </FormControl>
      </div>
      <div
        style={{
          marginLeft: "10px",
        }}
      >
        {ds != null && <ReactFC {...ds.timeseriesDs} />}
      </div>
    </div>
  );
}

export default CompareChart;
