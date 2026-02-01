import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { parseGitHubRepoURL } from "./githubUtils";
import { useAppTheme } from "./ThemeContext";

const HOST = import.meta.env.VITE_HOST;

const MobileStarsView = () => {
  const navigate = useNavigate();
  const { user, repository } = useParams();
  const { theme, currentTheme } = useAppTheme();
  const isDark = theme === 'dark';
  const [repo, setRepo] = useState(user && repository ? `${user}/${repository}` : "helm/helm");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [starHistory, setStarHistory] = useState([]);
  const [totalStars, setTotalStars] = useState(0);
  const [starsLast10d, setStarsLast10d] = useState(0);
  const [progress, setProgress] = useState(0);
  const [maxProgress, setMaxProgress] = useState(0);
  const [starsRepos, setStarsRepos] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredRepos, setFilteredRepos] = useState([]);
  const eventSourceRef = useRef(null);
  const isMountedRef = useRef(true);
  const inputRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Fetch available repos for autocomplete
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const response = await fetch(`${HOST}/allStarsKeys`);
        if (!response.ok) throw new Error("Failed to fetch repos");
        const data = await response.json();
        setStarsRepos(data.sort());
      } catch (e) {
        console.error(e);
      }
    };
    fetchRepos();
  }, []);

  // Fetch on initial mount or when URL params change
  useEffect(() => {
    const initialRepo = user && repository ? `${user}/${repository}` : "helm/helm";
    setRepo(initialRepo);
    fetchStars(initialRepo);
  }, [user, repository]);

  // Filter repos for autocomplete
  useEffect(() => {
    if (repo && starsRepos.length > 0) {
      const filtered = starsRepos
        .filter(r => r.toLowerCase().includes(repo.toLowerCase()))
        .slice(0, 8);
      setFilteredRepos(filtered);
    } else {
      setFilteredRepos([]);
    }
  }, [repo, starsRepos]);

  const fetchStars = async (repoToFetch) => {
    const repoName = repoToFetch || repo;
    if (!repoName) return;

    const parsed = parseGitHubRepoURL(repoName);
    const normalizedRepo = parsed || repoName;

    setLoading(true);
    setError("");
    setProgress(0);
    setMaxProgress(0);
    setStarHistory([]);
    setShowSuggestions(false);
    setTotalStars(0);
    setStarsLast10d(0);

    // Close any existing SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Fetch total stars first to calculate progress
    let callsNeeded = 100; // default
    try {
      const totalResponse = await fetch(`${HOST}/totalStars?repo=${encodeURIComponent(normalizedRepo)}`);
      if (totalResponse.ok) {
        const totalData = await totalResponse.json();
        if (totalData.stars) {
          callsNeeded = Math.floor(totalData.stars / 100);
          setMaxProgress(callsNeeded);
        }
      }
    } catch (e) {
      console.error("Error fetching total stars:", e);
    }

    // Set up SSE for progress updates
    const eventSource = new EventSource(`${HOST}/sse?repo=${encodeURIComponent(normalizedRepo)}`);
    eventSourceRef.current = eventSource;

    // Track if SSE has received any progress (means repo is being processed)
    let sseReceivedProgress = false;

    eventSource.addEventListener("current-value", (event) => {
      if (isMountedRef.current) {
        try {
          const parsedData = JSON.parse(event.data);
          const progressValue = parsedData.data;
          if (!isNaN(progressValue)) {
            sseReceivedProgress = true;
            setProgress(progressValue);
          }
        } catch (e) {
          console.error("Error parsing SSE data:", e);
        }
      }
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    // Helper to fetch allStars with retry on 500 (for new repos being processed)
    const fetchAllStarsWithRetry = async () => {
      const maxRetries = 60; // Up to 2 minutes of retries
      const retryDelay = 2000;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (!isMountedRef.current) return null;

        const response = await fetch(`${HOST}/allStars?repo=${encodeURIComponent(normalizedRepo)}`);

        if (response.ok) {
          return response;
        }

        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        } else if (response.status === 404) {
          throw new Error("Repository not found on GitHub.");
        } else if (response.status === 504) {
          throw new Error("Server timeout. The request took too long. Please try again.");
        } else if (response.status === 500) {
          // Check if SSE is showing progress - means repo is being processed
          // Also check status endpoint to see if processing is ongoing
          try {
            const statusResponse = await fetch(`${HOST}/status?repo=${encodeURIComponent(normalizedRepo)}`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              if (statusData.onGoing || sseReceivedProgress) {
                // Repo is being processed, wait and retry
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
              }
            }
          } catch (e) {
            console.error("Error checking status:", e);
          }
          // If we get here on first attempt, the 500 might be because processing just started
          // Give it a chance by waiting once
          if (attempt === 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          throw new Error("Internal server error. Please try again later.");
        } else {
          throw new Error(`Failed to fetch stars data. (${response.status})`);
        }
      }
      throw new Error("Timed out waiting for repository data. Please try again.");
    };

    try {
      const response = await fetchAllStarsWithRetry();

      if (!response || !isMountedRef.current) return;

      const data = await response.json();

      if (isMountedRef.current) {
        // Process star history for the chart
        // API returns data.stars as arrays: [date, dailyStars, totalStars]
        const history = data.stars || [];
        const processedHistory = history.map((item) => ({
          date: item[0],
          daily: item[1],
          total: item[2],
        }));

        setStarHistory(processedHistory);

        // Calculate totals
        if (processedHistory.length > 0) {
          setTotalStars(processedHistory[processedHistory.length - 1].total);

          // Calculate last 10 days
          const last10 = processedHistory.slice(-10);
          const last10Sum = last10.reduce((sum, day) => sum + day.daily, 0);
          setStarsLast10d(last10Sum);
        }

        // Update URL
        navigate(`/${normalizedRepo}`, { replace: true });
      }
    } catch (err) {
      if (isMountedRef.current) {
        // Network errors show generic "Failed to fetch" - make it more helpful
        if (err.message === "Failed to fetch") {
          setError(`Cannot connect to server at ${HOST}. Make sure the backend is running.`);
        } else {
          setError(err.message);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setProgress(100);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowSuggestions(false);
    fetchStars();
  };

  const handleSelectRepo = (selectedRepo) => {
    setRepo(selectedRepo);
    setShowSuggestions(false);
    fetchStars(selectedRepo);
  };

  // Get recent data for display (last 30 days)
  const recentHistory = starHistory.slice(-30);

  // Find max daily stars for scaling from the displayed data only
  // Use 95th percentile to avoid outliers making all other bars too small
  const sortedDaily = [...recentHistory].map(d => d.daily).sort((a, b) => a - b);
  const p95Index = Math.floor(sortedDaily.length * 0.95);
  const maxDaily = sortedDaily[p95Index] || Math.max(...recentHistory.map(d => d.daily), 1);

  return (
    <div style={{
      minHeight: "100vh",
      background: isDark
        ? "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)"
        : "linear-gradient(135deg, #f5f5f5 0%, #e8f0fe 100%)",
      padding: "16px",
      color: isDark ? "#fff" : "#1a1a2e",
    }}>
      {/* Header */}
      <div style={{
        textAlign: "center",
        marginBottom: "20px",
      }}>
        <h1 style={{
          fontSize: "24px",
          fontWeight: "700",
          margin: "0 0 4px 0",
          background: "linear-gradient(90deg, #3b82f6, #10b981)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Daily Stars Explorer
        </h1>
        <p style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
          GitHub Repository Star History
        </p>
      </div>

      {/* Search Form with Autocomplete */}
      <form onSubmit={handleSubmit} style={{ marginBottom: "20px", position: "relative" }}>
        <div style={{
          display: "flex",
          gap: "8px",
          marginBottom: "0",
        }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              type="text"
              value={repo}
              onChange={(e) => {
                setRepo(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="owner/repository"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: "12px",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.9)",
                color: isDark ? "#fff" : "#1a1a2e",
                fontSize: "16px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {/* Autocomplete Dropdown */}
            {showSuggestions && filteredRepos.length > 0 && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: isDark ? "#1a1a2e" : "#ffffff",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "12px",
                marginTop: "4px",
                maxHeight: "200px",
                overflowY: "auto",
                zIndex: 100,
              }}>
                {filteredRepos.map((r) => (
                  <div
                    key={r}
                    onClick={() => handleSelectRepo(r)}
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      fontSize: "14px",
                    }}
                    onMouseEnter={(e) => e.target.style.background = "rgba(59, 130, 246, 0.2)"}
                    onMouseLeave={(e) => e.target.style.background = "transparent"}
                  >
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px 24px",
              borderRadius: "12px",
              border: "none",
              background: loading
                ? "rgba(59, 130, 246, 0.5)"
                : "linear-gradient(90deg, #3b82f6, #2563eb)",
              color: "#fff",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Loading" : "Go"}
          </button>
        </div>
      </form>

      {/* Progress Bar */}
      {loading && (
        <div style={{
          marginBottom: "20px",
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: "8px",
          overflow: "hidden",
          height: "6px",
        }}>
          <div style={{
            width: `${maxProgress > 0 ? Math.min((progress / maxProgress) * 100, 100) : 0}%`,
            height: "100%",
            background: "linear-gradient(90deg, #3b82f6, #10b981)",
            transition: "width 0.3s ease",
          }} />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          padding: "12px 16px",
          marginBottom: "20px",
          borderRadius: "12px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#f87171",
          fontSize: "14px",
        }}>
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
        marginBottom: "20px",
      }}>
        <div style={{
          padding: "16px",
          borderRadius: "12px",
          background: "rgba(59, 130, 246, 0.1)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
        }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px", textTransform: "uppercase" }}>
            Total Stars
          </div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#fbbf24" }}>
            {totalStars.toLocaleString()}
          </div>
        </div>
        <div style={{
          padding: "16px",
          borderRadius: "12px",
          background: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
        }}>
          <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px", textTransform: "uppercase" }}>
            Last 10 Days
          </div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#10b981" }}>
            +{starsLast10d.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Hourly View Link */}
      {totalStars > 0 && (
        <div
          onClick={() => navigate(`/hourly/${repo.replace(' / ', '/')}`)}
          style={{
            padding: "12px 16px",
            marginBottom: "20px",
            borderRadius: "12px",
            background: "rgba(139, 92, 246, 0.1)",
            border: "1px solid rgba(139, 92, 246, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: "13px", color: "#a78bfa" }}>
            View hourly stars (last 24h)
          </div>
          <div style={{ fontSize: "16px", color: "#a78bfa" }}>→</div>
        </div>
      )}

      {/* Daily Stars Bar Chart */}
      {recentHistory.length > 0 && (
        <div style={{
          padding: "16px",
          borderRadius: "12px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}>
          <div style={{
            fontSize: "14px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#fff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span>Daily Stars (Last 30 days)</span>
            <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: "400" }}>
              max: {Math.max(...recentHistory.map(d => d.daily))}
            </span>
          </div>
          <div style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "3px",
            height: "140px",
            padding: "0 4px",
          }}>
            {recentHistory.map((day, index) => {
              const heightPercent = Math.min((day.daily / maxDaily) * 100, 100);
              return (
                <div
                  key={index}
                  style={{
                    flex: 1,
                    background: day.daily > 0
                      ? `linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)`
                      : "rgba(255, 255, 255, 0.1)",
                    height: `${Math.max(heightPercent, 3)}%`,
                    borderRadius: "3px 3px 0 0",
                    minHeight: "3px",
                    position: "relative",
                  }}
                  title={`${day.date}: ${day.daily} stars`}
                />
              );
            })}
          </div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "12px",
            fontSize: "11px",
            color: "#6b7280",
          }}>
            <span>{recentHistory[0]?.date || '30 days ago'}</span>
            <span>{recentHistory[recentHistory.length - 1]?.date || 'Today'}</span>
          </div>
        </div>
      )}

      {/* Cumulative Chart */}
      {starHistory.length > 0 && (
        <div style={{
          padding: "16px",
          borderRadius: "12px",
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          marginTop: "12px",
        }}>
          <div style={{
            fontSize: "14px",
            fontWeight: "600",
            marginBottom: "16px",
            color: "#fff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span>Cumulative Stars</span>
            <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: "400" }}>
              {totalStars.toLocaleString()} total
            </span>
          </div>
          <svg
            viewBox="0 0 300 120"
            style={{ width: "100%", height: "120px" }}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="cumGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            {(() => {
              const maxTotal = Math.max(...starHistory.map(d => d.total));
              const minTotal = Math.min(...starHistory.map(d => d.total));
              const range = maxTotal - minTotal || 1;
              const points = starHistory.map((d, i) => {
                const x = (i / (starHistory.length - 1)) * 300;
                const y = 110 - ((d.total - minTotal) / range) * 100;
                return `${x},${y}`;
              }).join(" ");
              const areaPoints = `0,110 ${points} 300,110`;
              return (
                <>
                  <polygon points={areaPoints} fill="url(#cumGradient)" />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                  />
                </>
              );
            })()}
          </svg>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "12px",
            fontSize: "11px",
            color: "#6b7280",
          }}>
            <span>{starHistory[0]?.date || ''}</span>
            <span>{starHistory[starHistory.length - 1]?.date || ''}</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        textAlign: "center",
        marginTop: "24px",
        paddingBottom: "20px",
        fontSize: "11px",
        color: "#4b5563",
        lineHeight: "1.6",
      }}>
        <div>For full features (compare, transforms, feeds, exports)</div>
        <div>use a laptop or larger screen</div>
      </div>
    </div>
  );
};

export default MobileStarsView;
