import { useState } from "react";
import "./App.css";
import "./index.css";
import { AnimatePresence, motion } from "framer-motion";

import MainPage from "./MainPage";
import TimeSeriesChart from "./TimeSeriesChart";
import CompareChart from "./CompareChart";
import IssuesTimeSeriesChart from "./IssuesTimeSeriesChart";
import PRsTimeSeriesChart from "./PRsTimeSeriesChart";
import ForksTimeSeriesChart from "./ForksTimeSeriesChart";
import CommitsTimeSeriesChart from "./CommitsTimeSeriesChart";
import ContributorsTimeSeriesChart from "./ContributorsTimeSeriesChart";
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
import CallMergeRoundedIcon from "@mui/icons-material/CallMergeRounded";
import CommitRoundedIcon from "@mui/icons-material/CommitRounded";
import Diversity3OutlinedIcon from "@mui/icons-material/Diversity3Outlined";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";

function App() {
  const [collapsed, setCollapsed] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const location = useLocation();

  const theme = createTheme({
    palette: {
      mode: darkMode ? "dark" : "light",
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className={darkMode ? "app-container dark-theme" : "app-container light-theme"}>
        {/* Theme Toggle */}
        <IconButton
          onClick={() => setDarkMode(!darkMode)}
          style={{
            position: "fixed",
            top: 750,
            left: 100,
            zIndex: 1200,
            background: darkMode ? "#333" : "#ddd",
            color: darkMode ? "#fff" : "#111",
            transition: "all 0.3s ease",
          }}
        >
          {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
        </IconButton>

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

            <MenuItem component={<Link to="/starstimeline/:id" className="link" />}
              icon={<Tooltip title="Stars Timeline"><QueryStatsRoundedIcon /></Tooltip>}
              active={!["/compare", "/table", "/info", "/issues", "/forks", "/prs", "/commits", "/contributors"]
                .some(path => location.pathname.includes(path))}
            >Repo Star History</MenuItem>

            <MenuItem component={<Link to="/compare" className="link" />}
              icon={<Tooltip title="Compare"><SsidChartRoundedIcon /></Tooltip>}
              active={location.pathname.includes("/compare")}
            >Compare</MenuItem>

            <MenuItem component={<Link to="/commits" className="link" />}
              icon={<Tooltip title="Commits"><CommitRoundedIcon /></Tooltip>}
              active={location.pathname.includes("/commits")}
            >Commits</MenuItem>

            <MenuItem component={<Link to="/prs" className="link" />}
              icon={<Tooltip title="PRs"><CallMergeRoundedIcon /></Tooltip>}
              active={location.pathname.includes("/prs")}
            >PRs</MenuItem>

            <MenuItem component={<Link to="/issues" className="link" />}
              icon={<Tooltip title="Issues"><BugReportRoundedIcon /></Tooltip>}
              active={location.pathname.includes("/issues")}
            >Issues</MenuItem>

            <MenuItem component={<Link to="/forks" className="link" />}
              icon={<Tooltip title="Forks"><AltRouteOutlinedIcon /></Tooltip>}
              active={location.pathname.includes("/forks")}
            >Forks</MenuItem>

            <MenuItem component={<Link to="/contributors" className="link" />}
              icon={<Tooltip title="Contributors"><Diversity3OutlinedIcon /></Tooltip>}
              active={location.pathname.includes("/contributors")}
            >Contributors</MenuItem>

            <MenuItem component={<Link to="/table" className="link" />}
              icon={<Tooltip title="Table"><TableViewRounded /></Tooltip>}
              active={location.pathname === "/table"}
            >Table</MenuItem>

            <MenuItem component={<Link to="/info" className="link" />}
              icon={<Tooltip title="Info"><InfoOutlinedIcon /></Tooltip>}
              active={location.pathname === "/info"}
            >Info</MenuItem>
          </Menu>
        </Sidebar>

        <section className="content">
          <Routes>
            <Route path="/" element={<TimeSeriesChart />} />
            <Route path="/:user/:repository" element={<TimeSeriesChart />} />
            <Route path="/table" element={<MainPage />} />
            <Route path="/starstimeline/:id" element={<TimeSeriesChart />} />
            <Route path="/compare" element={<CompareChart />} />
            <Route path="/compare/:user/:repository/:secondUser/:secondRepository" element={<CompareChart />} />
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
          </Routes>
        </section>
      </div>
    </ThemeProvider>
  );
}

export default App;
