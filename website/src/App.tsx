import { useState, useEffect, useMemo } from "react";
import "./App.css";

import MainPage from "./MainPage";
import TimeSeriesChart from "./TimeSeriesChart";
import MobileStarsView from "./MobileStarsView";
import MobileNavigation from "./MobileNavigation";
import DesktopNavigation from "./DesktopNavigation";
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
import { ThemeProvider as AppThemeProvider, useAppTheme } from "./ThemeContext";
import { RepoProvider, useLastRepo } from "./RepoContext";

import { Routes, Route, Navigate } from "react-router-dom";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

function AppContent() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const { theme, currentTheme, toggleTheme } = useAppTheme();
  const { lastRepo } = useLastRepo();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: theme === 'dark' ? 'dark' : 'light',
        },
      }),
    [theme]
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <a
        className="skip-to-content"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const mainContent = document.getElementById("main-content");
          mainContent?.focus();
          mainContent?.scrollTo({ top: 0 });
        }}
      >
        Skip to content
      </a>
      <div className="app-container" style={{ background: currentTheme.background }}>
        {isMobile && <MobileNavigation theme={theme} currentTheme={currentTheme} toggleTheme={toggleTheme} lastRepo={lastRepo} />}
        {!isMobile && <DesktopNavigation theme={theme} currentTheme={currentTheme} toggleTheme={toggleTheme} lastRepo={lastRepo} />}
        <main className="content" id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={isMobile ? <MobileStarsView /> : <TimeSeriesChart />} />
            <Route path="/:user/:repository" element={isMobile ? <MobileStarsView /> : <TimeSeriesChart />} />
            <Route path="/limits" element={<MainPage />} />
            <Route path="/table" element={<Navigate to="/limits" replace />} />
            <Route path="/starstimeline/:id" element={isMobile ? <MobileStarsView /> : <TimeSeriesChart />} />
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
        </main>
      </div>
    </ThemeProvider>
  );
}

function App() {
  return (
    <RepoProvider>
      <AppThemeProvider>
        <AppContent />
      </AppThemeProvider>
    </RepoProvider>
  );
}

export default App;
