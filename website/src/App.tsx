import { useState } from "react";
import "./App.css";

import MainPage from "./MainPage";
import TimeSeriesChart from "./TimeSeriesChart";
import CompareChart from "./CompareChart";

import { Sidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Routes, Route, Link } from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TableViewRounded from "@mui/icons-material/TableViewRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import CompareIcon from "@mui/icons-material/Compare";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

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
              component={<Link to="/starstimeline/:id" className="link" />}
              icon={<TimelineRoundedIcon />}
            >
              StarsTimeline
            </MenuItem>
            <MenuItem
              component={<Link to="/compare/:id" className="link" />}
              icon={<CompareIcon />}
            >
              Compare
            </MenuItem>
          </Menu>
        </Sidebar>
        <section style={{ width: "90%", height: "90%" }}>
          <Routes>
            <Route path="/" element={<TimeSeriesChart />} />
            <Route path="/:user/:repository" element={<TimeSeriesChart />} />
            <Route path="/table" element={<MainPage />} />
            <Route path="/starstimeline/:id" element={<TimeSeriesChart />} />
            <Route path="/compare/:id" element={<CompareChart />} />
          </Routes>
        </section>
      </div>
    </ThemeProvider>
  );
}

export default App;
