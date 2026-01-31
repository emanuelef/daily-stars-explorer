import { useState, useEffect } from "react";
import "./App.css";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import Button from "@mui/material/Button";
import RefreshIcon from "@mui/icons-material/Refresh";
import CircularProgress from "@mui/material/CircularProgress";

const HOST = import.meta.env.VITE_HOST;

// Stat Card Component
const StatCard = ({ icon, label, value, color = "#3b82f6", subtext = "" }) => (
  <div style={{
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
    border: `1px solid ${color}33`,
    borderRadius: '12px',
    padding: '20px 24px',
    minWidth: '200px',
    backdropFilter: 'blur(10px)',
  }}>
    <div style={{
      fontSize: '12px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: '#9ca3af',
      marginBottom: '8px',
      fontWeight: '500',
    }}>
      {icon} {label}
    </div>
    <div style={{
      fontSize: '32px',
      fontWeight: '700',
      color: '#fff',
      lineHeight: '1.2',
    }}>
      {value}
    </div>
    {subtext && (
      <div style={{
        fontSize: '12px',
        color: '#6b7280',
        marginTop: '4px',
      }}>
        {subtext}
      </div>
    )}
  </div>
);

// Progress Bar Component
const LimitsProgressBar = ({ remaining, total }) => {
  const percentage = total > 0 ? (remaining / total) * 100 : 0;
  const getColor = () => {
    if (percentage > 50) return '#10b981';
    if (percentage > 20) return '#fbbf24';
    return '#ef4444';
  };

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '8px',
        fontSize: '12px',
        color: '#9ca3af',
      }}>
        <span>API Requests Used</span>
        <span>{total - remaining} / {total}</span>
      </div>
      <div style={{
        height: '8px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${getColor()} 0%, ${getColor()}88 100%)`,
          borderRadius: '4px',
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
};

const formatTime = (seconds) => {
  if (seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const MainPage = () => {
  const [totalRequests, setTotalRequests] = useState(0);
  const [remainingRequests, setRemainingRequests] = useState(0);
  const [resetLimitsTime, setResetLimitsTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeOps, setActiveOps] = useState({ ongoingStars: [], busyClients: {}, totalActive: 0 });

  const fetchActiveOps = async () => {
    try {
      const response = await fetch(`${HOST}/activeOps`);
      const data = await response.json();
      setActiveOps(data);
    } catch (error) {
      console.error("Error fetching active operations:", error);
    }
  };

  const fetchLimits = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${HOST}/limits`);
      const jsonData = await response.json();
      setRemainingRequests(jsonData.Remaining);
      setTotalRequests(jsonData.Limit);
      const utcDate = new Date(jsonData.ResetAt);
      const currentDate = new Date();
      const timeDifferenceMilliseconds = utcDate - currentDate;
      const timeDifferenceSeconds = Math.floor(timeDifferenceMilliseconds / 1000);
      setResetLimitsTime(Math.max(0, timeDifferenceSeconds));
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setResetLimitsTime(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchLimits();
    const intervalId = setInterval(fetchLimits, 60000);
    return () => clearInterval(intervalId);
  }, []);

  // Poll active operations every 5 seconds
  useEffect(() => {
    fetchActiveOps();
    const intervalId = setInterval(fetchActiveOps, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const usedRequests = totalRequests - remainingRequests;
  const usagePercentage = totalRequests > 0 ? ((usedRequests / totalRequests) * 100).toFixed(1) : 0;

  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh', padding: '20px' }}>
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />

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
            }}>
              GitHub API Status
            </h1>
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '14px',
              color: '#9ca3af'
            }}>
              Monitor your GitHub API rate limits
            </p>
          </div>
          <Button
            variant="contained"
            onClick={fetchLimits}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <RefreshIcon />}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
        {lastUpdated && (
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#6b7280' }}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "20px",
        marginBottom: "24px"
      }}>
        <StatCard
          icon="📊"
          label="Remaining Requests"
          value={remainingRequests.toLocaleString()}
          color={remainingRequests > totalRequests * 0.5 ? "#10b981" : remainingRequests > totalRequests * 0.2 ? "#fbbf24" : "#ef4444"}
          subtext={`of ${totalRequests.toLocaleString()} total`}
        />
        <StatCard
          icon="⏱️"
          label="Reset In"
          value={formatTime(resetLimitsTime)}
          color="#3b82f6"
          subtext="until limit resets"
        />
        <StatCard
          icon="📈"
          label="Usage"
          value={`${usagePercentage}%`}
          color={usagePercentage < 50 ? "#10b981" : usagePercentage < 80 ? "#fbbf24" : "#ef4444"}
          subtext={`${usedRequests.toLocaleString()} requests used`}
        />
      </div>

      {/* Progress Bar Card */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#fff', fontSize: '16px', fontWeight: '600' }}>
          Rate Limit Status
        </h3>
        <LimitsProgressBar remaining={remainingRequests} total={totalRequests} />

        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: 'rgba(59, 130, 246, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
            About GitHub API Limits
          </div>
          <div style={{ fontSize: '14px', color: '#fff', lineHeight: '1.6' }}>
            GitHub's GraphQL API has a rate limit of 5,000 points per hour for authenticated requests.
            This tool uses GraphQL queries which consume varying amounts of points depending on the complexity
            of the data being fetched.
          </div>
        </div>
      </div>

      {/* Active Operations Card */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: '600' }}>
            🔄 Active Operations
          </h3>
          <span style={{
            background: activeOps.totalActive > 0 ? '#10b981' : '#6b7280',
            color: '#fff',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
          }}>
            {activeOps.totalActive} active
          </span>
        </div>

        {activeOps.totalActive === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '14px',
          }}>
            No active operations
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeOps.ongoingStars.map((repo, index) => {
              // Find which client is processing this repo
              const clientKey = Object.entries(activeOps.busyClients || {})
                .find(([_, r]) => r === repo)?.[0];

              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '8px',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#10b981',
                      animation: 'pulse 2s infinite',
                    }} />
                    <span style={{ color: '#fff', fontSize: '14px', fontFamily: 'monospace' }}>
                      {repo}
                    </span>
                  </div>
                  {clientKey && (
                    <span style={{
                      color: '#9ca3af',
                      fontSize: '12px',
                      background: 'rgba(255,255,255,0.1)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}>
                      {clientKey}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{
          marginTop: '16px',
          fontSize: '11px',
          color: '#6b7280',
          textAlign: 'right',
        }}>
          Updates every 5 seconds
        </div>
      </div>
    </div>
  );
};

export default MainPage;
