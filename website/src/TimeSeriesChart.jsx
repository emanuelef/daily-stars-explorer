import React, { useState, useEffect } from "react";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema";
import EstimatedTimeProgress from "./EstimatedTimeProgress";

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

  const fetchRepoStats = (repo) => {
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
        //setds(options);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
      });
  };

  useEffect(() => {
    //fetchRepoStats(selectedRepo);
  }, []);

  const handleInputChange = (event, setStateFunction) => {
    const inputText = event.target.value;
    //setStateFunction(inputText);
    //fetchRepoStats(parseGitHubRepoURL(inputText));
  };

  return (
    <div>
      <TextField
        style={{ marginTop: "20px", marginRight: "20px", marginLeft: "20px" }}
        label="Enter a GitHub repository"
        variant="outlined"
        value={selectedRepo}
        onChange={(e) => handleInputChange(e, setSelectedRepo)}
      />
      <EstimatedTimeProgress text="Estimated Time Left" totalTime={36} />
      <ReactFC {...ds.timeseriesDs} />
    </div>
  );
}

export default TimeSeriesChart;
