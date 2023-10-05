import { useState } from "react";
import "./App.css";

import MainPage from "./MainPage";
import TimeSeriesChart from "./TimeSeriesChart";

import { Sidebar, Menu, MenuItem } from "react-pro-sidebar";
import { Routes, Route, Link } from "react-router-dom";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import TableViewRounded from "@mui/icons-material/TableViewRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";

function App() {
  const [collapsed, setCollapsed] = useState(true);

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
            component={<Link to="/starstimeline/:id" className="link" />}
            icon={<TimelineRoundedIcon />}
          >
            StarsTimeline
          </MenuItem>
        </Menu>
      </Sidebar>
      <section>
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/table" element={<MainPage />} />
          <Route path="/starstimeline/:id" element={<TimeSeriesChart />} />
        </Routes>
      </section>
    </div>
  );
}

export default App;
