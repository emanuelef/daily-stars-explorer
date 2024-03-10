import React, { useState, useEffect } from "react";
import FusionCharts from "fusioncharts";
import charts from "fusioncharts/fusioncharts.charts";
import ReactFC from "react-fusioncharts";
import CandyTheme from "fusioncharts/themes/fusioncharts.theme.candy.js";

charts(CandyTheme);
const WEEKLY_BINNING = {
  year: [],
  month: [],
  day: [],
  week: [1],
  hour: [],
  minute: [],
  second: [],
};

function loadData(url) {
  return fetch(url).then((response) => response.json());
}

const Chart = () => {
  const [ds, setds] = useState(null);

  const dataSource = {
    chart: { animation: "0" },
    caption: {
      text: "Temperature readings of an Italian Town",
    },
    yAxis: [
      {
        plot: {
          value: "Temperature",
          type: "column",
        },
        title: "Temperature",
        aggregation: "max",
        format: {
          suffix: "°C",
        },
        referenceline: [
          {
            label: "Controlled Temperature",
            value: 10,
          },
        ],
      },
    ],
    xAxis: {
      plot: "Time",
      binning: WEEKLY_BINNING,
    },
  };

  useEffect(() => {
    Promise.all([
      loadData(
        "https://s3.eu-central-1.amazonaws.com/fusion.store/ft/data/adding-a-reference-line-data.json"
      ),
      loadData(
        "https://s3.eu-central-1.amazonaws.com/fusion.store/ft/schema/adding-a-reference-line-schema.json"
      ),
    ]).then((res) => {
      console.log(res[1]);

      const fusionTable = new FusionCharts.DataStore().createDataTable(
        res[0],
        res[1]
      );
      dataSource.data = fusionTable;

      dataSource.yAxis[0].referenceline = [
        {
          label: "Ref Temperature",
          value: 22,
        },
      ];

      setds({
        type: "timeseries",
        width: "100%",
        height: "700",
        dataSource,
      });
    });
  }, []);

  return (
    <div>
      <h1>Temperature Readings of an Italian Town</h1>
      {ds && ds.dataSource.data && <ReactFC {...ds} />}
    </div>
  );
};

export default Chart;
