import { useState } from "react";
import "./App.css";

import MainPage from "./MainPage";
import TimeSeriesChart from "./TimeSeriesChart";
import CompareChart from "./CompareChart";
import IssuesTimeSeriesChart from "./IssuesTimeSeriesChart";
import PRsTimeSeriesChart from "./PRsTimeSeriesChart";
import ForksTimeSeriesChart from "./ForksTimeSeriesChart";
import CommitsTimeSeriesChart from "./CommitsTimeSeriesChart";
import InfoPage from "./InfoPage";

import { Sidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Routes, Route, Link, useLocation } from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TableViewRounded from "@mui/icons-material/TableViewRounded";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SsidChartRoundedIcon from "@mui/icons-material/SsidChartRounded";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import AltRouteOutlinedIcon from "@mui/icons-material/AltRouteOutlined";
import CallMergeRoundedIcon from '@mui/icons-material/CallMergeRounded';
import CommitRoundedIcon from '@mui/icons-material/CommitRounded';

import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Tooltip from "@mui/material/Tooltip";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

function App() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <div className="app-container">
        <Sidebar
          className="sidebar"
          collapsed={collapsed}
          backgroundColor="rgb(51, 117, 117)"
          width={collapsed ? "70" : "200"}
        >
          <Menu
            menuItemStyles={{
              button: ({ level, active, disabled }) => {
                if (level >= 0)
                  return {
                    color: disabled ? "#f5d9ff" : "#07100d",
                    backgroundColor: active ? "#cccccc" : "undefined",
                  };
              },
            }}
          >
            <MenuItem
              component={<Link to="/" className="link" />}
              className="menu1"
              icon={
                <Tooltip title="Toggle Menu" placement="right">
                  <MenuRoundedIcon
                    onClick={() => {
                      setCollapsed(!collapsed);
                    }}
                  />
                </Tooltip>
              }
            >
              <h2 style={{ color: "black" }}>Stars Explorer</h2>
            </MenuItem>
            <MenuItem
              component={<Link to="/starstimeline/:id" className="link" />}
              icon={
                <Tooltip title="Stars Timeline" placement="right">
                  <QueryStatsRoundedIcon />
                </Tooltip>
              }
              active={
                !(
                  useLocation().pathname.includes("/compare") ||
                  useLocation().pathname.includes("/table") ||
                  useLocation().pathname.includes("/info") ||
                  useLocation().pathname.includes("/issues") ||
                  useLocation().pathname.includes("/forks") ||
                  useLocation().pathname.includes("/prs") ||
                  useLocation().pathname.includes("/commits")
                )
              }
            >
              Repo Star History
            </MenuItem>
            <MenuItem
              component={<Link to="/compare" className="link" />}
              icon={
                <Tooltip title="Compare" placement="right">
                  <SsidChartRoundedIcon />
                </Tooltip>
              }
              active={useLocation().pathname.includes("/compare")}
            >
              Compare
            </MenuItem>
            <MenuItem
              component={<Link to="/commits" className="link" />}
              icon={
                <Tooltip title="Commits Timeline" placement="right">
                  <CommitRoundedIcon />
                </Tooltip>
              }
              active={useLocation().pathname.includes("/commits")}
            >
              Commits
            </MenuItem>
            <MenuItem
              component={<Link to="/prs" className="link" />}
              icon={
                <Tooltip title="PRs Timeline" placement="right">
                  <CallMergeRoundedIcon />
                </Tooltip>
              }
              active={useLocation().pathname.includes("/prs")}
            >
              PRs
            </MenuItem>
            <MenuItem
              component={<Link to="/issues" className="link" />}
              icon={
                <Tooltip title="Issues Timeline" placement="right">
                  <BugReportRoundedIcon />
                </Tooltip>
              }
              active={useLocation().pathname.includes("/issues")}
            >
              Issues
            </MenuItem>
            <MenuItem
              component={<Link to="/forks" className="link" />}
              icon={
                <Tooltip title="Forks Timeline" placement="right">
                  <AltRouteOutlinedIcon />
                </Tooltip>
              }
              active={useLocation().pathname.includes("/forks")}
            >
              Forks
            </MenuItem>
            <MenuItem
              component={<Link to="/table" className="link" />}
              icon={
                <Tooltip title="Table" placement="right">
                  <TableViewRounded />
                </Tooltip>
              }
              active={useLocation().pathname === "/table"}
            >
              Table
            </MenuItem>
            <MenuItem
              component={<Link to="/info" className="link" />}
              icon={
                <Tooltip title="Info" placement="right">
                  <InfoOutlinedIcon />
                </Tooltip>
              }
              active={useLocation().pathname === "/info"}
            >
              Info
            </MenuItem>
          </Menu>
        </Sidebar>
        <section className="content">
          <Routes>
            <Route path="/" element={<TimeSeriesChart />} />
            <Route path="/:user/:repository" element={<TimeSeriesChart />} />
            <Route path="/table" element={<MainPage />} />
            <Route path="/starstimeline/:id" element={<TimeSeriesChart />} />
            <Route path="/compare" element={<CompareChart />} />
            <Route
              path="/compare/:user/:repository/:secondUser/:secondRepository"
              element={<CompareChart />}
            />
            <Route path="/info" element={<InfoPage />} />
            <Route path="/issues" element={<IssuesTimeSeriesChart />} />
            <Route path="/issues/:user/:repository" element={<IssuesTimeSeriesChart />} />
            <Route path="/forks" element={<ForksTimeSeriesChart />} />
            <Route path="/forks/:user/:repository" element={<ForksTimeSeriesChart />} />
            <Route path="/prs" element={<PRsTimeSeriesChart />} />
            <Route path="/prs/:user/:repository" element={<PRsTimeSeriesChart />} />
            <Route path="/commits" element={<CommitsTimeSeriesChart />} />
            <Route path="/commits/:user/:repository" element={<CommitsTimeSeriesChart />} />
          </Routes>
        </section>
      </div>
    </ThemeProvider>
  );
}

export default App;
