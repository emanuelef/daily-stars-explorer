import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import CircularProgress from "@mui/material/CircularProgress";
import RefreshIcon from "@mui/icons-material/Refresh";
import { formatNumber } from "./utils";

const HOST = import.meta.env.VITE_HOST;

// Stat Card Component for clean visual hierarchy
const StatCard = ({ icon, label, value, color = "#3b82f6" }: { icon: string; label: string; value: string | number; color?: string }) => (
  <div style={{
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
    border: `1px solid ${color}33`,
    borderRadius: '12px',
    padding: '12px 16px',
    minWidth: '140px',
    backdropFilter: 'blur(10px)',
  }}>
    <div style={{
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: '#9ca3af',
      marginBottom: '4px',
      fontWeight: '500',
    }}>
      {icon} {label}
    </div>
    <div style={{
      fontSize: '18px',
      fontWeight: '700',
      color: '#fff',
      lineHeight: '1.2',
    }}>
      {value}
    </div>
  </div>
);

// Leaderboard Row Component
const LeaderboardRow = ({
  rank,
  repo,
  stars1h,
  stars24h,
  stars7d,
  totalStars,
  velocityPerHour,
  growthPercent,
  onClick
}: {
  rank: number;
  repo: string;
  stars1h: number;
  stars24h: number;
  stars7d: number;
  totalStars: number;
  velocityPerHour: number;
  growthPercent: number;
  onClick: () => void;
}) => {
  const getRankColor = (rank: number) => {
    if (rank === 1) return '#fbbf24'; // Gold
    if (rank === 2) return '#9ca3af'; // Silver
    if (rank === 3) return '#cd7f32'; // Bronze
    return '#6b7280';
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr repeat(5, 100px)',
        gap: '16px',
        alignItems: 'center',
        padding: '16px 20px',
        background: rank <= 3
          ? `linear-gradient(135deg, rgba(${rank === 1 ? '251, 191, 36' : rank === 2 ? '156, 163, 175' : '205, 127, 50'}, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)`
          : 'rgba(255, 255, 255, 0.02)',
        borderRadius: '12px',
        marginBottom: '8px',
        border: `1px solid ${rank <= 3 ? getRankColor(rank) + '33' : 'rgba(255, 255, 255, 0.05)'}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
        e.currentTarget.style.transform = 'translateX(4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = rank <= 3
          ? `linear-gradient(135deg, rgba(${rank === 1 ? '251, 191, 36' : rank === 2 ? '156, 163, 175' : '205, 127, 50'}, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)`
          : 'rgba(255, 255, 255, 0.02)';
        e.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      <div style={{
        fontSize: rank <= 3 ? '24px' : '16px',
        fontWeight: '700',
        color: getRankColor(rank),
        textAlign: 'center',
      }}>
        {getRankEmoji(rank)}
      </div>
      <div>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#fff',
          marginBottom: '4px',
        }}>
          {repo}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#9ca3af',
        }}>
          {formatNumber(totalStars)} total stars
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: stars1h > 0 ? '#10b981' : '#6b7280',
        }}>
          +{stars1h}
        </div>
        <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>1h</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: stars24h > 0 ? '#3b82f6' : '#6b7280',
        }}>
          +{formatNumber(stars24h)}
        </div>
        <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>24h</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: stars7d > 0 ? '#8b5cf6' : '#6b7280',
        }}>
          +{formatNumber(stars7d)}
        </div>
        <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>7d</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: '#fbbf24',
        }}>
          {velocityPerHour.toFixed(1)}/h
        </div>
        <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>velocity</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '700',
          color: growthPercent > 1 ? '#ef4444' : growthPercent > 0.1 ? '#f59e0b' : '#6b7280',
        }}>
          {growthPercent.toFixed(2)}%
        </div>
        <div style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>growth</div>
      </div>
    </div>
  );
};

interface TrendingRepo {
  repo: string;
  stars1h: number;
  stars24h: number;
  stars7d: number;
  totalStars: number;
  velocityPerHour: number;
  growthPercent: number;
  lastUpdated: string;
}

function ViralLeaderboard() {
  const [trendingRepos, setTrendingRepos] = useState<TrendingRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showError, setShowError] = useState(false);
  const [sortBy, setSortBy] = useState("stars24h");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const navigate = useNavigate();

  const fetchTrending = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${HOST}/trending?sort=${sortBy}&limit=50`);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setTrendingRepos(data || []);
      setLastRefresh(new Date());
      setShowError(false);
    } catch (err) {
      console.error("Error fetching trending repos:", err);
      setError("Failed to fetch trending repositories. Please try again later.");
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrending();
  }, [sortBy]);

  const handleRepoClick = (repo: string) => {
    navigate(`/hourly/${repo}`);
  };

  const totalStarsGained24h = trendingRepos.reduce((sum, r) => sum + r.stars24h, 0);
  const avgVelocity = trendingRepos.length > 0
    ? trendingRepos.reduce((sum, r) => sum + r.velocityPerHour, 0) / trendingRepos.length
    : 0;

  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh', padding: '20px' }}>
      {showError && (
        <Alert
          severity="error"
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={() => setShowError(false)}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '28px',
              fontWeight: '700',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '32px' }}>🔥</span>
              Viral Velocity Leaderboard
            </h1>
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '14px',
              color: '#9ca3af'
            }}>
              Repositories gaining stars the fastest right now
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FormControl style={{ width: '160px' }} size="small">
              <InputLabel>Sort By</InputLabel>
              <Select
                value={sortBy}
                label="Sort By"
                onChange={(e) => setSortBy(e.target.value)}
              >
                <MenuItem value="stars1h">Stars (1h)</MenuItem>
                <MenuItem value="stars24h">Stars (24h)</MenuItem>
                <MenuItem value="stars7d">Stars (7d)</MenuItem>
                <MenuItem value="velocity">Velocity</MenuItem>
                <MenuItem value="growth">Growth %</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={fetchTrending}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
            >
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        {lastRefresh && (
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7280' }}>
            Last updated: {lastRefresh.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Stats Dashboard */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "16px",
        marginBottom: "24px"
      }}>
        <StatCard
          icon="📊"
          label="Repos Tracked"
          value={trendingRepos.length}
          color="#3b82f6"
        />
        <StatCard
          icon="⭐"
          label="Total Stars (24h)"
          value={formatNumber(totalStarsGained24h)}
          color="#fbbf24"
        />
        <StatCard
          icon="⚡"
          label="Avg Velocity"
          value={`${avgVelocity.toFixed(1)}/h`}
          color="#10b981"
        />
        <StatCard
          icon="🏆"
          label="Top Performer"
          value={trendingRepos[0]?.repo?.split('/')[1] || "—"}
          color="#ef4444"
        />
      </div>

      {/* Leaderboard */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
      }}>
        {/* Header Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr repeat(5, 100px)',
          gap: '16px',
          padding: '12px 20px',
          marginBottom: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600' }}>Rank</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600' }}>Repository</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600', textAlign: 'right' }}>1 Hour</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600', textAlign: 'right' }}>24 Hours</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600', textAlign: 'right' }}>7 Days</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600', textAlign: 'right' }}>Velocity</div>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600', textAlign: 'right' }}>Growth</div>
        </div>

        {/* Loading State */}
        {loading && trendingRepos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <CircularProgress size={40} />
            <p style={{ marginTop: '16px' }}>Loading trending repositories...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && trendingRepos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
            <p>No trending data available yet.</p>
            <p style={{ fontSize: '14px' }}>Browse some repositories with hourly tracking to populate this leaderboard.</p>
          </div>
        )}

        {/* Leaderboard Rows */}
        {trendingRepos.map((repo, index) => (
          <LeaderboardRow
            key={repo.repo}
            rank={index + 1}
            repo={repo.repo}
            stars1h={repo.stars1h}
            stars24h={repo.stars24h}
            stars7d={repo.stars7d}
            totalStars={repo.totalStars}
            velocityPerHour={repo.velocityPerHour}
            growthPercent={repo.growthPercent}
            onClick={() => handleRepoClick(repo.repo)}
          />
        ))}
      </div>

      {/* Footer Note */}
      <div style={{
        marginTop: '24px',
        textAlign: 'center',
        fontSize: '12px',
        color: '#6b7280'
      }}>
        Click on any repository to view detailed hourly star history
      </div>
    </div>
  );
}

export default ViralLeaderboard;
