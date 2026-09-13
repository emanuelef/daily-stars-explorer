import { useState, type CSSProperties } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import SsidChartRoundedIcon from "@mui/icons-material/SsidChartRounded";
import CommitRoundedIcon from "@mui/icons-material/CommitRounded";
import CallMergeRoundedIcon from "@mui/icons-material/CallMergeRounded";
import BugReportRoundedIcon from "@mui/icons-material/BugReportRounded";
import AltRouteOutlinedIcon from "@mui/icons-material/AltRouteOutlined";
import Diversity3OutlinedIcon from "@mui/icons-material/Diversity3Outlined";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import ArticleIcon from "@mui/icons-material/Article";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import StarOutlineRoundedIcon from "@mui/icons-material/StarOutlineRounded";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";

interface DesktopNavigationProps {
  theme: string;
  currentTheme: {
    sidebarBg: string;
    cardBorder: string;
    textPrimary: string;
    textSecondary: string;
    accentBg: string;
    accentHover: string;
  };
  toggleTheme: () => void;
  lastRepo: string;
}

const navigationGroups = [
  {
    label: "Repository",
    items: [
      { path: "/", label: "Star history", icon: QueryStatsRoundedIcon, repo: true },
      { path: "/compare", label: "Compare repos", icon: SsidChartRoundedIcon, repo: false },
      { path: "/commits", label: "Commits", icon: CommitRoundedIcon, repo: true },
      { path: "/prs", label: "Pull requests", icon: CallMergeRoundedIcon, repo: true },
      { path: "/issues", label: "Issues", icon: BugReportRoundedIcon, repo: true },
      { path: "/forks", label: "Forks", icon: AltRouteOutlinedIcon, repo: true },
      { path: "/contributors", label: "Contributors", icon: Diversity3OutlinedIcon, repo: true },
    ],
  },
  {
    label: "Discover",
    items: [
      { path: "/newrepos", label: "Global activity", icon: AddBoxOutlinedIcon, repo: false },
      { path: "/featured", label: "Featured repos", icon: ArticleIcon, repo: false },
    ],
  },
  {
    label: "Resources",
    items: [
      { path: "/limits", label: "API limits", icon: SpeedOutlinedIcon, repo: false },
      { path: "/info", label: "About", icon: InfoOutlinedIcon, repo: false },
    ],
  },
];

const COLLAPSE_STORAGE_KEY = "desktop-navigation-collapsed";

function initialCollapsed() {
  try {
    const saved = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (saved !== null) return saved === "true";
  } catch {
    // Navigation also works when browser storage is unavailable.
  }
  return true;
}

export default function DesktopNavigation({ theme, currentTheme, toggleTheme, lastRepo }: DesktopNavigationProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const { pathname } = useLocation();
  const isDark = theme === "dark";
  const toggleLabel = collapsed ? "Expand navigation" : "Collapse navigation";
  const themeLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
  const repoPath = lastRepo ? lastRepo.split("/").map(encodeURIComponent).join("/") : "";
  const navigationStyle = {
    "--nav-background": currentTheme.sidebarBg,
    "--nav-border": currentTheme.cardBorder,
    "--nav-text": currentTheme.textPrimary,
    "--nav-secondary": currentTheme.textSecondary,
    "--nav-active": currentTheme.accentBg,
    "--nav-hover": currentTheme.accentHover,
    "--nav-accent": isDark ? "#93c5fd" : "#1d4ed8",
  } as CSSProperties;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
    } catch {
      // Keep the current session's preference without browser storage.
    }
  };

  const isActive = (path: string, repo: boolean) => {
    if (path === "/") {
      return ["/", "/:user/:repository", "/starstimeline/:id"].some(pattern => matchPath(pattern, pathname));
    }
    if (pathname === path) return true;
    if (repo) return Boolean(matchPath(`${path}/:user/:repository`, pathname));
    return path === "/compare" && Boolean(matchPath("/compare/:user/:repository/:secondUser/:secondRepository", pathname));
  };

  return (
    <aside className={`desktop-navigation${collapsed ? " is-collapsed" : ""}`} style={navigationStyle}>
      <div className="desktop-navigation-header">
        {!collapsed && (
          <Link className="desktop-navigation-brand" to={repoPath ? `/${repoPath}` : "/"}>
            <span className="desktop-navigation-brand-icon"><QueryStatsRoundedIcon /></span>
            <span>Daily Stars<span className="desktop-navigation-brand-subtitle">Explorer</span></span>
          </Link>
        )}
        <Tooltip title={toggleLabel} placement="right">
          <IconButton
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            aria-controls="desktop-navigation-menu"
            onClick={toggleCollapsed}
            sx={{ color: "inherit", width: 36, height: 36, flexShrink: 0 }}
          >
            {collapsed ? <MenuRoundedIcon /> : <ChevronLeftRoundedIcon />}
          </IconButton>
        </Tooltip>
      </div>
      <nav id="desktop-navigation-menu" aria-label="Main navigation" className="desktop-navigation-menu">
        {navigationGroups.map(group => (
          <div className="desktop-navigation-group" key={group.label}>
            {!collapsed && <div className="desktop-navigation-group-label">{group.label}</div>}
            {group.items.map(({ path, label, icon: Icon, repo }) => {
              const selected = isActive(path, repo);
              const to = repo && repoPath ? `${path === "/" ? "" : path}/${repoPath}` : path;
              return (
                <Tooltip key={path} title={collapsed ? label : ""} placement="right" arrow>
                  <Link
                    to={to}
                    className={`desktop-navigation-link${selected ? " is-active" : ""}`}
                    aria-label={collapsed ? label : undefined}
                    aria-current={selected ? "page" : undefined}
                  >
                    <Icon fontSize="small" />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="desktop-navigation-footer">
        <Tooltip title={collapsed ? themeLabel : ""} placement="right" arrow>
          <button className="desktop-navigation-link" type="button" onClick={toggleTheme} aria-label={themeLabel}>
            {isDark ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
            {!collapsed && <span>{isDark ? "Light mode" : "Dark mode"}</span>}
          </button>
        </Tooltip>
        <Tooltip title={collapsed ? "Star on GitHub (opens in a new tab)" : ""} placement="right" arrow>
          <a
            className="desktop-navigation-link"
            href="https://github.com/emanuelef/daily-stars-explorer"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Star on GitHub (opens in a new tab)"
          >
            <StarOutlineRoundedIcon fontSize="small" />
            {!collapsed && <span>Star on GitHub</span>}
          </a>
        </Tooltip>
      </div>
    </aside>
  );
}
