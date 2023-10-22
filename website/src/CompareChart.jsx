import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import Typography from "@mui/material/Typography";
import Autocomplete from "@mui/material/Autocomplete";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import LoadingButton from "@mui/lab/LoadingButton";
import SendIcon from "@mui/icons-material/Send";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema-compare";
import { parseGitHubRepoURL } from "./githubUtils";
import GammelTheme from "fusioncharts/themes/fusioncharts.theme.gammel";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy";
import ZuneTheme from "fusioncharts/themes/fusioncharts.theme.zune";

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
  let defaultRepo = "helm/helm-mapkubeapis";
  let defaultRepo2 = "pipe-cd/pipecd";
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

  const [ds, setds] = useState(chart_props);
  const [loading, setLoading] = useState(false);

  const [theme, setTheme] = useState("candy");

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [selectedRepo2, setSelectedRepo2] = useState(defaultRepo2);
  const [starsRepos, setStarsRepos] = useState([]);

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    const options = { ...ds };
    options.timeseriesDs.dataSource.chart.theme = event.target.value;
    setds(options);
  };

  const handleFetchResponse = (response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  };

  const handleCombinedData = (combinedData) => {
    const fusionTable = new FusionCharts.DataStore().createDataTable(
      combinedData,
      schema
    );
    const options = { ...ds };
    options.timeseriesDs.dataSource.caption = { text: `Stars` };
    options.timeseriesDs.dataSource.data = fusionTable;
    options.timeseriesDs.dataSource.yAxis[0].plot[0].value = "Cumulative Stars";
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

        data1.forEach((subarray) => {
          subarray.push(repo);
        });

        data2.forEach((subarray) => {
          subarray.push(repo2);
        });

        removeUncompleteDay(data1);
        removeUncompleteDay(data2);

        handleCombinedData(data1.concat(data2));
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
  }, []);

  const handleClick = async () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);
    const repoParsed2 = parseGitHubRepoURL(selectedRepo2);

    if (repoParsed === null || repoParsed2 === null) {
      return;
    }

    fetchAllStars(repoParsed, repoParsed2);
  };

  const handleInputChange = async (event, setStateFunction) => {
    const inputText = event.target.value;
    setStateFunction(inputText);
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
          onChange={(e, v) => {
            console.log(v?.label);
            setSelectedRepo2(v?.label);
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
          <span>Compare</span>
        </LoadingButton>
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
      </div>
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

export default CompareChart;
