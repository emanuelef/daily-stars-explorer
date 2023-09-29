import { useState, useEffect } from "react";
// @ts-ignore
import Papa from "papaparse";
import "./App.css";

import TextField from "@mui/material/TextField";

import TimeSeriesChart from "./TimeSeriesChart";
import K8sTimeSeriesChart from "./K8sTimeSeriesChart";
import RequestsProgressBar from "./RequestsProgressBar";
import EstimatedTimeProgress from "./EstimatedTimeProgress";

import { Sidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Routes, Route, Link, useParams } from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TableViewRounded from "@mui/icons-material/TableViewRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";

/*
archived
"false"
days-last-commit
"151"
days-last-star
"5"
days-since-creation
"3961"
dependencies
"5"
language
"Go"
mentionable-users
"8"
new-stars-last-7d
"1"
new-stars-last-14d
"5"
new-stars-last-24H
"0"
new-stars-last-30d
"7"
repo
"mewkiz/flac"
stars
"262"
stars-per-mille-30d
"26.718"*/

const GitHubURL = "https://github.com/";

const HOST = import.meta.env.VITE_HOST;

console.log("HOST " + HOST);

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

function App() {
  const [selectedRepo, setSelectedRepo] = useState("helm/helm-mapkubeapis");
  const [collapsed, setCollapsed] = useState(true);
  const [result, setResult] = useState("");
  const [totalRequests, setTotalRequests] = useState(60);
  const [remainingRequests, setRemainingRequests] = useState(totalRequests);
  const [resetLimitsTime, setResetLimitsTime] = useState(60);

  const fetchRepoStats = (repo) => {
    console.log(repo);
    fetch(`${HOST}/stats?repo=${repo}`)
      .then((response) => response.json())
      .then((stats) => {
        console.log(stats);
        setResult(stats);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
      });
  };

  const fetchLimits = async () => {
    try {
      // Make your API request here using fetch or an HTTP library like Axios
      const response = await fetch(`${HOST}/limits`);
      const jsonData = await response.json();
      setRemainingRequests(jsonData.Remaining);
      setTotalRequests(jsonData.Limit);
      const utcDate = new Date(jsonData.ResetAt);
      console.log("UTC Date:", utcDate);
      const currentDate = new Date();
      const timeDifferenceMilliseconds = utcDate - currentDate;
      const timeDifferenceSeconds = Math.floor(
        timeDifferenceMilliseconds / 1000
      );
      console.log("Time difference in seconds:", timeDifferenceSeconds);
      setResetLimitsTime(timeDifferenceSeconds);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    fetchLimits();
    const intervalId = setInterval(fetchLimits, 30000);
    return () => clearInterval(intervalId);
  }, []);

  const handleInputChange = (event, setStateFunction) => {
    const inputText = event.target.value;
    setStateFunction(inputText);
    fetchRepoStats(parseGitHubRepoURL(inputText));
  };

  const Table = () => {
    return (
      <div className="chart-container">
        <TextField
          style={{ marginTop: "20px", marginRight: "20px", marginLeft: "20px" }}
          label="Enter a GitHub repository"
          variant="outlined"
          value={selectedRepo}
          onChange={(e) => handleInputChange(e, setSelectedRepo)}
        />
        <RequestsProgressBar
          remainingRequests={remainingRequests}
          totalRequests={totalRequests}
        />
        <EstimatedTimeProgress
          text="API Limits reset"
          totalTime={resetLimitsTime}
        />
        <div>
          <h1>JSON Data</h1>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      </div>
    );
  };

  const StarsTimeline = () => {
    const { id } = useParams();
    const decodedRepositoryId = decodeURIComponent(id);
    console.log(decodedRepositoryId);
    setSelectedRepo(decodedRepositoryId);
    return (
      <>
        <TimeSeriesChart repo={selectedRepo} />
      </>
    );
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar className="app" collapsed={collapsed}>
        <Menu>
          <MenuItem
            component={<Link to="/" className="link" />}
            className="menu1"
            icon={
              <MenuRoundedIcon
                onClick={() => {
                  setCollapsed(!collapsed);
                }}
              />
            }
          >
            <h2>Repo Stats</h2>
          </MenuItem>
          <MenuItem
            component={<Link to="/table" className="link" />}
            icon={<TableViewRounded />}
          >
            Table
          </MenuItem>
          <MenuItem
            component={<Link to="/k8sstarstimeline/:id" className="link" />}
            icon={<TimelineRoundedIcon />}
          >
            K8s StarsTimeline
          </MenuItem>
        </Menu>
      </Sidebar>
      <section>
        <Routes>
          <Route path="/" element={<Table />} />
          <Route path="/table" element={<Table />} />
          <Route path="/k8sstarstimeline" element={<K8sTimeSeriesChart />} />
        </Routes>
      </section>
    </div>
  );
}

export default App;
