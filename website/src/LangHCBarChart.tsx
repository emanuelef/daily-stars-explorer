import React, { useState, useEffect, useCallback } from "react";
import Linkweb from "@mui/material/Link";
import Papa from "papaparse";
import "./App.css";
import { ResponsiveBar } from "@nivo/bar";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

const GitHubURL = "https://github.com/";

const csvURL =
  "https://raw.githubusercontent.com/emanuelef/cncf-repos-stats/main/dep-repo-latest.csv";

const LanguageColoursURL =
  "https://raw.githubusercontent.com/ozh/github-colors/master/colors.json";

const ColumnChart = ({ dataRows }) => {
  const [data, setData] = useState([]);
  const [keys, setKeys] = useState([]);
  const [series, setSeries] = useState([]);

  const loadData = async () => {
    console.log(dataRows);

    const response = await fetch(LanguageColoursURL);
    const colours = await response.json();

    console.log(colours);

    let langData = {};
    let keysSet = new Set();
    let allLanguagesCount = {};

    dataRows.forEach((element) => {
      if (!element.repo || !element.language) {
        return;
      }

      keysSet.add(element.language);

      if (element.language in allLanguagesCount) {
        allLanguagesCount[element.language]++;
      } else {
        allLanguagesCount[element.language] = 1;
      }

      if (element.status in langData) {
        if (element.language in langData[element.status]) {
          langData[element.status][element.language]++;
        } else {
          langData[element.status][element.language] = 1;
        }
      } else {
        langData[element.status] = { [element.language]: 1 };
      }
    });

    console.log(langData);

    const sorted_languages = Object.keys(allLanguagesCount).sort((a, b) => {
      return allLanguagesCount[a] - allLanguagesCount[b];
    });

    console.log(allLanguagesCount);
    console.log(sorted_languages);

    const allLanguageKeys = Array.from(keysSet);

    let AllSeries = [];

    for (const lang of sorted_languages) {
      console.log(lang);

      let statusList = [];
      statusList.push(
        lang in langData["Graduated"] ? langData["Graduated"][lang] : 0
      );
      statusList.push(
        lang in langData["Incubating"] ? langData["Incubating"][lang] : 0
      );
      statusList.push(
        lang in langData["Sandbox"] ? langData["Sandbox"][lang] : 0
      );
      statusList.push(
        lang in langData["Archived"] ? langData["Archived"][lang] : 0
      );

      AllSeries.push({
        name: lang,
        data: statusList,
        color: lang in colours ? colours[lang].color : undefined,
      });
    }

    console.log(AllSeries);

    setSeries(AllSeries);

    setData(langData);
    setKeys(allLanguageKeys);
  };

  useEffect(() => {
    loadData();
  }, []);

  const options = {
    chart: {
      type: "column",
      height: 760,
    },
    title: {
      text: "CNCF Languages",
    },
    xAxis: {
      categories: ["Graduated", "Incubating", "Sandbox", "Archived"],
    },
    yAxis: {
      min: 0,
      title: {
        text: "Total",
      },
      stackLabels: {
        enabled: true,
      },
    },
    legend: {
      reversed: true,
    },
    plotOptions: {
      column: {
        stacking: "normal",
        animation: false,
        dataLabels: {
          enabled: true,
        },
      },
    },
    series: series,
  };

  return (
    <div
      style={{
        height: 760,
        width: 1400,
        marginTop: 10,
        backgroundColor: "azure",
      }}
    >
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
};

export default ColumnChart;
