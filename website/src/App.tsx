import { useState } from "react";
import "./App.css";

import MainPage from "./MainPage";
import TimeSeriesChart from "./TimeSeriesChart";
import CompareChart from "./CompareChart";
import CalendarChart from "./CalendarChart";

import { Sidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Routes, Route, Link } from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TableViewRounded from "@mui/icons-material/TableViewRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import CompareIcon from "@mui/icons-material/Compare";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SsidChartRoundedIcon from "@mui/icons-material/SsidChartRounded";

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
      <div style={{ display: "flex", height: "100vh" }}>
        <Sidebar
          className="app"
          collapsed={collapsed}
          backgroundColor="rgb(51, 117, 117)"
        >
          <Menu
            menuItemStyles={{
              button: ({ level, active, disabled }) => {
                if (level >= 0)
                  return {
                    color: disabled ? "#f5d9ff" : "#07100d",
                    backgroundColor: active ? "#00cef9" : "undefined",
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
              <h2 style={{ color: "black" }}>Repo Stats</h2>
            </MenuItem>
            <MenuItem
              component={<Link to="/starstimeline/:id" className="link" />}
              icon={
                <Tooltip title="Stars Timeline" placement="right">
                  <QueryStatsRoundedIcon />
                </Tooltip>
              }
            >
              StarsTimeline
            </MenuItem>
            <MenuItem
              component={<Link to="/compare" className="link" />}
              icon={
                <Tooltip title="Compare" placement="right">
                  <SsidChartRoundedIcon />
                </Tooltip>
              }
            >
              Compare
            </MenuItem>
            <MenuItem
              component={<Link to="/table" className="link" />}
              icon={
                <Tooltip title="Table" placement="right">
                  <TableViewRounded />
                </Tooltip>
              }
            >
              Table
            </MenuItem>
            <MenuItem
              component={<Link to="/calendar" className="link" />}
              icon={
                <Tooltip title="Calendar" placement="right">
                  <CalendarMonthIcon />
                </Tooltip>
              }
            >
              Calendar
            </MenuItem>
            <MenuItem
              component={<Link to="/info" className="link" />}
              icon={
                <Tooltip title="Info" placement="right">
                  <InfoOutlinedIcon />
                </Tooltip>
              }
            >
              Info
            </MenuItem>
          </Menu>
        </Sidebar>
        <section style={{ width: "90%", height: "90%" }}>
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
            <Route path="/calendar" element={<CalendarChart />} />
          </Routes>
        </section>
      </div>
    </ThemeProvider>
  );
}

export default App;
