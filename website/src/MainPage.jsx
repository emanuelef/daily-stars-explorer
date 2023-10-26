import { useState, useEffect } from "react";
import "./App.css";

import TextField from "@mui/material/TextField";
import LoadingButton from "@mui/lab/LoadingButton";
import SendIcon from "@mui/icons-material/Send";

import TimeSeriesChart from "./TimeSeriesChart";
import RequestsProgressBar from "./RequestsProgressBar";
import EstimatedTimeProgress from "./EstimatedTimeProgress";

import { Sidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Routes, Route, Link, useParams } from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TableViewRounded from "@mui/icons-material/TableViewRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import GitHubCorners from "@uiw/react-github-corners";

import JsonView from "react18-json-view";
import "react18-json-view/src/style.css";
import "react18-json-view/src/dark.css";

import { parseGitHubRepoURL } from "./githubUtils";

const HOST = import.meta.env.VITE_HOST;

console.log("HOST " + HOST);

const MainPage = () => {
  let defaultRepo = "helm/helm-mapkubeapis";
  const { user, repository } = useParams();
  if (user && repository) {
    defaultRepo = `${user}/${repository}`;
  }

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [repoInput, setRepoInput] = useState(defaultRepo);
  const [result, setResult] = useState({});
  const [totalRequests, setTotalRequests] = useState(60);
  const [remainingRequests, setRemainingRequests] = useState(totalRequests);
  const [resetLimitsTime, setResetLimitsTime] = useState(60);
  const [loading, setLoading] = useState(false);

  const fetchRepoStats = (repo) => {
    console.log(repo);
    setLoading(true);
    fetch(`${HOST}/stats?repo=${repo}`)
      .then((response) => response.json())
      .then((stats) => {
        console.log(stats);
        setResult(stats);
        setLoading(false);
      })
      .catch((e) => {
        console.error(`An error occurred: ${e}`);
        setLoading(false);
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
    fetchRepoStats(selectedRepo);
    const intervalId = setInterval(fetchLimits, 60000);
    return () => clearInterval(intervalId);
  }, []);

  const handleClick = async () => {
    setSelectedRepo(repoInput);
    fetchRepoStats(parseGitHubRepoURL(repoInput));
  };

  const handleInputChange = (event, setStateFunction) => {
    const inputText = event.target.value;
    setStateFunction(inputText);
  };

  return (
    <div className="chart-container">
      <GitHubCorners
        position="right"
        href="https://github.com/emanuelef/gh-repo-stats-server"
      />
      <TextField
        style={{
          marginTop: "20px",
          marginRight: "20px",
          marginLeft: "10px",
          width: "500px",
        }}
        size="small"
        label="Enter a GitHub repository"
        variant="outlined"
        value={repoInput}
        onChange={(e) => handleInputChange(e, setRepoInput)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleClick();
          }
        }}
      />
      <LoadingButton
        style={{
          marginTop: "30px",
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
        <span>Fetch</span>
      </LoadingButton>
      <RequestsProgressBar
        remainingRequests={remainingRequests}
        totalRequests={totalRequests}
      />
      <EstimatedTimeProgress
        text="API Limits reset"
        totalTime={resetLimitsTime}
      />
      <div>{result && <JsonView src={result} collapsed={1} dark={true} />}</div>
    </div>
  );
};

export default MainPage;
