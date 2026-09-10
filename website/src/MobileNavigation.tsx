import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
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
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";

interface MobileNavigationProps {
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

const destinations = [
  { path: "/", label: "Repo star history", icon: QueryStatsRoundedIcon, repo: true },
  { path: "/compare", label: "Compare", icon: SsidChartRoundedIcon },
  { path: "/commits", label: "Commits", icon: CommitRoundedIcon, repo: true },
  { path: "/prs", label: "Pull requests", icon: CallMergeRoundedIcon, repo: true },
  { path: "/issues", label: "Issues", icon: BugReportRoundedIcon, repo: true },
  { path: "/forks", label: "Forks", icon: AltRouteOutlinedIcon, repo: true },
  { path: "/contributors", label: "Contributors", icon: Diversity3OutlinedIcon, repo: true },
  { path: "/newrepos", label: "Global activity", icon: AddBoxOutlinedIcon },
  { path: "/featured", label: "Featured repos", icon: ArticleIcon },
  { path: "/limits", label: "API limits", icon: SpeedOutlinedIcon },
  { path: "/info", label: "About", icon: InfoOutlinedIcon },
];

export default function MobileNavigation({ theme, currentTheme, toggleTheme, lastRepo }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const isDark = theme === "dark";
  const activePath = destinations.find(({ path }) =>
    path !== "/" && (pathname === path || pathname.startsWith(`${path}/`))
  )?.path || "/";

  return (
    <>
      <header
        className="mobile-navigation"
        style={{ background: currentTheme.sidebarBg, borderColor: currentTheme.cardBorder, color: currentTheme.textPrimary }}
      >
        <IconButton
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls={open ? "mobile-navigation-menu" : undefined}
          onClick={() => setOpen(true)}
          sx={{ width: 44, height: 44, color: "inherit" }}
        >
          <MenuRoundedIcon />
        </IconButton>
        <Link className="mobile-navigation-brand" to={lastRepo ? `/${lastRepo}` : "/"}>
          Daily Stars Explorer
        </Link>
        <IconButton
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
          sx={{ width: 44, height: 44, color: "inherit" }}
        >
          {isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
        </IconButton>
      </header>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-modal": true,
            "aria-labelledby": "mobile-navigation-title",
            sx: {
              width: "min(320px, 88vw)",
              background: currentTheme.sidebarBg,
              color: currentTheme.textPrimary,
              pt: "env(safe-area-inset-top)",
              pb: "env(safe-area-inset-bottom)",
              pl: "env(safe-area-inset-left)",
            },
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1 }}>
          <Box id="mobile-navigation-title" component="span" sx={{ fontWeight: 700 }}>Explore</Box>
          <IconButton aria-label="Close navigation" onClick={() => setOpen(false)} sx={{ width: 44, height: 44, color: "inherit" }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <Box component="nav" id="mobile-navigation-menu" aria-label="Main navigation" sx={{ px: 1, pb: 1 }}>
          {destinations.map(({ path, label, icon: Icon, repo }) => {
            const selected = activePath === path;
            const to = repo && lastRepo ? `${path === "/" ? "" : path}/${lastRepo}` : path;

            return (
              <ListItemButton
                key={path}
                component={Link}
                to={to}
                selected={selected}
                aria-current={selected ? "page" : undefined}
                onClick={() => setOpen(false)}
                sx={{
                  minHeight: 48,
                  borderRadius: 2,
                  "&.Mui-selected": { background: currentTheme.accentBg },
                  "&:hover, &.Mui-selected:hover": { background: currentTheme.accentHover },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: selected ? "#3b82f6" : currentTheme.textSecondary }}><Icon /></ListItemIcon>
                <ListItemText primary={label} />
              </ListItemButton>
            );
          })}
        </Box>
      </Drawer>
    </>
  );
}
