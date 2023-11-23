import { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Autocomplete from "@mui/material/Autocomplete";
import { parseGitHubRepoURL } from "./githubUtils";
import { ResponsiveCalendar } from "@nivo/calendar";

const HOST = import.meta.env.VITE_HOST;

const calculateMedian = (arr) => {
  // Sort the array in ascending order
  arr.sort(function (a, b) {
    return a - b;
  });

  const middle = Math.floor(arr.length / 2);

  if (arr.length % 2 === 0) {
    // If the array has an even number of elements, calculate the average of the two middle elements
    return (arr[middle - 1] + arr[middle]) / 2;
  } else {
    // If the array has an odd number of elements, the median is the middle element
    return arr[middle];
  }
};

const calculatePercentile = (arr, percentile) => {
  // Sort the array in ascending order
  arr.sort(function (a, b) {
    return a - b;
  });

  const n = arr.length;

  if (n === 0 || percentile < 0 || percentile > 1) {
    return undefined; // Invalid input
  }

  const index = (n - 1) * percentile;

  if (Number.isInteger(index)) {
    // If the index is an integer, return the element at that index
    return arr[index];
  } else {
    // If the index is a fraction, interpolate between the elements
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    const lowerValue = arr[lowerIndex];
    const upperValue = arr[upperIndex];
    const fraction = index - lowerIndex;
    return lowerValue + fraction * (upperValue - lowerValue);
  }
};

function CalendarChart() {
  let defaultRepo = "kubernetes/kubernetes";

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [loading, setLoading] = useState(false);
  const [starsRepos, setStarsRepos] = useState([]);
  const [dataCalendar, setDataCalendar] = useState([]);

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

  const fetchAllStars = async (repo) => {
    const fetchUrl = `${HOST}/allStars?repo=${repo}`;
    const response = await fetch(fetchUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  };

  useEffect(() => {
    const fetchRepos = async () => {
      const repos = await fetchAllStarsKeys();
      console.log(repos);
      setStarsRepos(repos.sort());

      const data = await fetchAllStars(selectedRepo);
      console.log(data);
      let testCalendarData = data.map((el) => {
        let parts = el[0].split("-");
        return {
          value: el[1],
          day: parts[2] + "-" + parts[1] + "-" + parts[0],
        };
      });

      setDataCalendar(testCalendarData);
    };

    fetchRepos();
    handleClick();
  }, [selectedRepo]);

  const handleClick = async () => {
    const repoParsed = parseGitHubRepoURL(selectedRepo);

    if (repoParsed === null) {
      return;
    }

    fetchAllStars(repoParsed);
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
        Now, it only works when the history of the repository has been fetched
        previously.
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
                width: "400px",
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
        ></div>
      </div>
      <div style={{ height: 1780, width: "100%", backgroundColor: "azure" }}>
        <ResponsiveCalendar
          theme={{
            background: "#ffffff",
            text: {
              fontSize: 18,
              fill: "#333333",
              outlineWidth: 0,
              outlineColor: "transparent",
            },
            tooltip: {
              container: {
                background: "#000000",
                fontSize: 12,
              },
              basic: {
                // Set the text color to black for the tooltip
                fontSize: 12,
                fill: "#ff0000",
              },
              chip: {},
              table: {},
              tableCell: {},
              tableCellValue: {},
            },
          }}
          data={dataCalendar}
          from={dataCalendar.length ? dataCalendar[0].day : ""}
          to={
            dataCalendar.length ? dataCalendar[dataCalendar.length - 1].day : ""
          }
          emptyColor="#dddddd"
          colors={["#61cdbb", "#97e3d5", "#e8c1a0", "#f47560", "#ff0000"]}
          minValue={0}
          maxValue={calculatePercentile(
            dataCalendar.map((el) => el.value),
            0.95
          )}
          margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
          yearSpacing={40}
          monthBorderColor="#000000"
          dayBorderWidth={2}
          dayBorderColor="#ffffff"
          legends={[
            {
              anchor: "bottom-right",
              direction: "row",
              translateY: 36,
              itemCount: 4,
              itemWidth: 42,
              itemHeight: 36,
              itemsSpacing: 14,
              itemDirection: "right-to-left",
            },
          ]}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default CalendarChart;
