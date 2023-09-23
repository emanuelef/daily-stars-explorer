import React, { useState, useEffect, useCallback } from "react";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import FusionCharts from "fusioncharts";
import TimeSeries from "fusioncharts/fusioncharts.timeseries";
import ReactFC from "react-fusioncharts";
import schema from "./schema";

ReactFC.fcRoot(FusionCharts, TimeSeries);
const chart_props = {
  timeseriesDs: {
    type: "timeseries",
    width: "1200",
    height: "800",
    dataEmptyMessage: "Fetching data...",
    dataSource: {
      caption: { text: "K8s new stars per day" },
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
      },
    },
  },
};

const FULL_URL_CSV =
  "https://raw.githubusercontent.com/emanuelef/github-repo-activity-stats/main/all-stars-history-k8s/all-stars-k8s.csv";

const CSVToArray = (data, delimiter = ",", omitFirstRow = true) =>
  data
    .slice(omitFirstRow ? data.indexOf("\n") + 1 : 0)
    .split("\n")
    .map((v) => {
      let arr = v.split(delimiter);
      arr[1] = parseInt(arr[1]);
      arr[2] = parseInt(arr[2]);
      return arr;
    });

const movingAvg = (array, countBefore, countAfter = 0) => {
  const result = [];
  for (let i = 0; i < array.length; i++) {
    const subArr = array.slice(
      Math.max(i - countBefore, 0),
      Math.min(i + countAfter + 1, array.length)
    );
    const avg =
      subArr.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0) / subArr.length;
    result.push(avg);
  }
  return result;
};

function K8sTimeSeriesChart({ repo }) {
  const [ds, setds] = useState(chart_props);
  const [selectedValue, setSelectedValue] = useState("increment");

  const handleChange = (event) => {
    setSelectedValue(event.target.value);
  };

  const loadData = async () => {
    try {
      const response = await fetch(FULL_URL_CSV);
      const res = await response.text();
      const data = CSVToArray(res);
      console.log(data);

      const fusionTable = new FusionCharts.DataStore().createDataTable(
        data,
        schema
      );
      const options = { ...ds };
      options.timeseriesDs.dataSource.data = fusionTable;
      options.timeseriesDs.dataSource.yAxis[0].plot[0].value =
        selectedValue === "increment" ? "New Stars" : "Cumulative Stars";
      setds(options);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    console.log("render");
    loadData();
  }, [repo, selectedValue]);

  return (
    <div>
      <FormControl
        component="fieldset"
        style={{ marginTop: 20, marginLeft: 20 }}
      >
        <FormLabel component="legend">Select one option:</FormLabel>
        <RadioGroup
          aria-label="options"
          name="options"
          value={selectedValue}
          onChange={handleChange}
          row
        >
          <FormControlLabel
            value="increment"
            control={<Radio />}
            label="Stars per day"
          />
          <FormControlLabel
            value="cumulative"
            control={<Radio />}
            label="Cumulative stars"
          />
        </RadioGroup>
      </FormControl>
      <ReactFC {...ds.timeseriesDs} />
    </div>
  );
}

export default K8sTimeSeriesChart;
