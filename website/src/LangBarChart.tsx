import React, { useState, useEffect, useCallback } from "react";
import Linkweb from "@mui/material/Link";
import Papa from "papaparse";
import "./App.css";
import { ResponsiveBar } from "@nivo/bar";

const GitHubURL = "https://github.com/";

const csvURL =
  "https://raw.githubusercontent.com/emanuelef/cncf-repos-stats/main/dep-repo-latest.csv";

/*
const data = [
  {
    country: "AD",
    "hot dog": 89,
    burger: 142,
    sandwich: 179,
    kebab: 136,
    fries: 192,
    donut: 3,
  },
  {
    country: "AE",
    "hot dog": 27,
    burger: 88,
    sandwich: 123,
    kebab: 14,
    fries: 181,
    donut: 6,
  },
];
*/

function LangBarChart({ dataRows }) {
  const [data, setData] = useState([]);
  const [keys, setKeys] = useState([]);

  const loadData = async () => {
    console.log(dataRows);

    let langData = [];

    let keysSet = new Set();

    dataRows.forEach((element) => {
      const index = langData.findIndex(
        (repo) => repo.status === element.status
      );

      if (!element.repo || !element.language) {
        return;
      }

      keysSet.add(element.language);

      if (index == -1) {
        langData.push({
          status: element.status,
          [element.language]: 1,
        });
      } else {
        if (element.language in langData[index]) {
          langData[index][element.language]++;
        } else {
          langData[index][element.language] = 1;
        }
      }
    });

    console.log(langData);
    setData(langData);
    setKeys(Array.from(keysSet));
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div
      style={{
        height: 760,
        width: 1400,
        marginTop: 10,
        backgroundColor: "azure",
      }}
    >
      <ResponsiveBar
        data={data}
        keys={keys}
        indexBy="status"
        margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
        padding={0.3}
        valueScale={{ type: "linear" }}
        indexScale={{ type: "band", round: true }}
        colors={{ scheme: "paired" }}
        borderColor={{
          from: "color",
          modifiers: [["darker", 1.6]],
        }}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: "status",
          legendPosition: "middle",
          legendOffset: 32,
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: "repos",
          legendPosition: "middle",
          legendOffset: -40,
        }}
        labelSkipWidth={12}
        labelSkipHeight={12}
        labelTextColor={{
          from: "color",
          modifiers: [["darker", 1.6]],
        }}
        legends={[
          {
            dataFrom: "keys",
            anchor: "bottom-right",
            direction: "column",
            justify: false,
            translateX: 120,
            translateY: 0,
            itemsSpacing: 2,
            itemWidth: 100,
            itemHeight: 20,
            itemDirection: "left-to-right",
            itemOpacity: 0.85,
            symbolSize: 20,
            effects: [
              {
                on: "hover",
                style: {
                  itemOpacity: 1,
                },
              },
            ],
          },
        ]}
        animate={false}
        role="application"
        ariaLabel="CNCF Languages"
        barAriaLabel={(e) =>
          e.id + ": " + e.formattedValue + " in country: " + e.indexValue
        }
      />
    </div>
  );
}

export default LangBarChart;
