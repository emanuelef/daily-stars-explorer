import { useState } from "react";
import "./App.css";

import MainPage from "./MainPage";
import TimeSeriesChart from "./TimeSeriesChart";
import HourlyStarsChart from "./HourlyStarsChart";
import CompareChart from "./CompareChart";
import IssuesTimeSeriesChart from "./IssuesTimeSeriesChart";
import PRsTimeSeriesChart from "./PRsTimeSeriesChart";
import ForksTimeSeriesChart from "./ForksTimeSeriesChart";
import CommitsTimeSeriesChart from "./CommitsTimeSeriesChart";
import ContributorsTimeSeriesChart from "./ContributorsTimeSeriesChart";
import NewReposTimeSeriesChart from "./NewReposTimeSeriesChart";
import InfoPage from "./InfoPage";
import FeaturedReposPage from "./FeaturedReposPage";

import { Sidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SsidChartRoundedIcon from "@mui/icons-material/SsidChartRounded";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import AltRouteOutlinedIcon from "@mui/icons-material/AltRouteOutlined";
import CallMergeRoundedIcon from '@mui/icons-material/CallMergeRounded';
import CommitRoundedIcon from '@mui/icons-material/CommitRounded';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import ArticleIcon from '@mui/icons-material/Article';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

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
  const location = useLocation();

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
                  location.pathname.includes("/compare") ||
                  location.pathname.includes("/limits") ||
                  location.pathname.includes("/info") ||
                  location.pathname.includes("/issues") ||
                  location.pathname.includes("/forks") ||
                  location.pathname.includes("/prs") ||
                  location.pathname.includes("/commits") ||
                  location.pathname.includes("/contributors") ||
                  location.pathname.includes("/newrepos") ||
                  location.pathname.includes("/featured") ||
                  location.pathname.includes("/hourly")
                )
              }
            >
              Repo Star History
            </MenuItem>
            <MenuItem
              component={<Link to="/hourly" className="link" />}
              icon={
                <Tooltip title="Hourly Stars" placement="right">
                  <AccessTimeIcon />
                </Tooltip>
              }
              active={location.pathname.includes("/hourly")}
            >
              Hourly Stars
            </MenuItem>
            <MenuItem
              component={<Link to="/compare" className="link" />}
              icon={
                <Tooltip title="Compare" placement="right">
                  <SsidChartRoundedIcon />
                </Tooltip>
              }
              active={location.pathname.includes("/compare")}
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
              active={location.pathname.includes("/commits")}
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
              active={location.pathname.includes("/prs")}
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
              active={location.pathname.includes("/issues")}
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
              active={location.pathname.includes("/forks")}
            >
              Forks
            </MenuItem>
            <MenuItem
              component={<Link to="/contributors" className="link" />}
              icon={
                <Tooltip title="Contributors Timeline" placement="right">
                  <Diversity3OutlinedIcon />
                </Tooltip>
              }
              active={location.pathname.includes("/contributors")}
            >
              Contributors
            </MenuItem>
            <MenuItem
              component={<Link to="/newrepos" className="link" />}
              icon={
                <Tooltip title="New GitHub Repositories Created Daily" placement="right">
                  <AddBoxOutlinedIcon />
                </Tooltip>
              }
              active={location.pathname.includes("/newrepos")}
            >
              New Repos
            </MenuItem>
            <MenuItem
              component={<Link to="/featured" className="link" />}
              icon={
                <Tooltip title="GitHub Repositories Featured on Social Platforms" placement="right">
                  <ArticleIcon />
                </Tooltip>
              }
              active={location.pathname.includes("/featured")}
            >
              Featured Repos
            </MenuItem>
            <MenuItem
              component={<Link to="/limits" className="link" />}
              icon={
                <Tooltip title="API Rate Limits" placement="right">
                  <SpeedOutlinedIcon />
                </Tooltip>
              }
              active={location.pathname === "/limits"}
            >
              API Limits
            </MenuItem>
            <MenuItem
              component={<Link to="/info" className="link" />}
              icon={
                <Tooltip title="Info" placement="right">
                  <InfoOutlinedIcon />
                </Tooltip>
              }
              active={location.pathname === "/info"}
            >
              Info
            </MenuItem>
          </Menu>
        </Sidebar>
        <section className="content">
          <Routes>
            <Route path="/" element={<TimeSeriesChart />} />
            <Route path="/:user/:repository" element={<TimeSeriesChart />} />
            <Route path="/limits" element={<MainPage />} />
            <Route path="/table" element={<Navigate to="/limits" replace />} />
            <Route path="/starstimeline/:id" element={<TimeSeriesChart />} />
            <Route path="/hourly" element={<HourlyStarsChart />} />
            <Route path="/hourly/:user/:repository" element={<HourlyStarsChart />} />
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
            <Route path="/contributors" element={<ContributorsTimeSeriesChart />} />
            <Route path="/contributors/:user/:repository" element={<ContributorsTimeSeriesChart />} />
            <Route path="/newrepos" element={<NewReposTimeSeriesChart />} />
            <Route path="/showhn" element={<Navigate to="/featured" replace />} />
            <Route path="/featured" element={<FeaturedReposPage />} />
          </Routes>
        </section>
      </div>
    </ThemeProvider>
  );
}

export default App;
