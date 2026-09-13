import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { intervalToDuration, parseISO } from "date-fns";
import { parseGitHubRepoURL } from "./githubUtils";
import { useAppTheme } from "./ThemeContext";
import { useLastRepo } from "./RepoContext";
import MobileStarsChart from "./MobileStarsChart";
import "./MobileStarsView.css";

const HOST = import.meta.env.VITE_HOST;
const normalizeRepo = (value) => {
  const trimmed = value.trim();
  const parsed = parseGitHubRepoURL(/^github\.com\//i.test(trimmed) ? `https://${trimmed}` : trimmed);
  return parsed && /^[\w.-]+\/[\w.-]+$/.test(parsed) ? parsed : null;
};

const formatDay = (value) => {
  const [day, month, year] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
};

const formatAge = (createdAt) => {
  if (!createdAt) return "";
  try {
    const { years, months, days } = intervalToDuration({ start: parseISO(createdAt), end: Date.now() });
    return [years ? `${years}y` : "", months ? `${months}m` : "", days ? `${days}d` : ""]
      .filter(Boolean).join(" ") || "<1d";
  } catch {
    return "";
  }
};

// Cancel retry timers as well as network requests when switching repositories.
const waitForRetry = (signal) => new Promise((resolve, reject) => {
  const cancel = () => {
    clearTimeout(timer);
    reject(new DOMException("Aborted", "AbortError"));
  };
  const timer = setTimeout(() => {
    signal.removeEventListener("abort", cancel);
    resolve();
  }, 2000);
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
});

const MobileStarsView = () => {
  const navigate = useNavigate();
  const { user, repository } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { lastRepo, setLastRepo } = useLastRepo();
  const { theme } = useAppTheme();
  const routeRepo = user && repository ? `${user}/${repository}` : lastRepo;
  const activeRepo = normalizeRepo(routeRepo) || routeRepo;
  const requestedRange = searchParams.get("range");
  const dailyChartRange = ["30d", "90d", "all"].includes(requestedRange) ? requestedRange : "30d";
  const [repo, setRepo] = useState(activeRepo);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inputError, setInputError] = useState("");
  const [retry, setRetry] = useState(0);
  const [progress, setProgress] = useState(0);
  const [maxProgress, setMaxProgress] = useState(0);
  const [starsRepos, setStarsRepos] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [shareMessage, setShareMessage] = useState("");
  const [shareFallback, setShareFallback] = useState("");
  const [pinnedRepos, setPinnedRepos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pinned-repos") || "[]");
      return Array.isArray(saved)
        ? [...new Set(saved.filter(r => typeof r === "string").map(normalizeRepo).filter(Boolean))]
        : [];
    } catch {
      return [];
    }
  });
  const inputRef = useRef(null);
  const filteredRepos = repo.trim()
    ? starsRepos.filter(r => r.toLowerCase().includes(repo.trim().toLowerCase())).slice(0, 8)
    : [];
  const suggestionsOpen = showSuggestions && filteredRepos.length > 0;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${HOST}/allStarsKeys`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : [])
      .then(data => setStarsRepos(Array.isArray(data) ? data.filter(r => typeof r === "string").sort() : []))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("pinned-repos", JSON.stringify(pinnedRepos));
    } catch { /* Pins remain usable when browser storage is unavailable. */ }
  }, [pinnedRepos]);

  useEffect(() => {
    setLastRepo(activeRepo);
  }, [activeRepo, setLastRepo]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let eventSource;
    let sseReceivedProgress = false;
    const request = (path) => fetch(`${HOST}/${path}?repo=${encodeURIComponent(activeRepo)}`, { signal });
    setRepo(activeRepo);
    setLoading(true);
    setResult(null);
    setError("");
    setInputError("");
    setShareMessage("");
    setShareFallback("");
    setProgress(0);
    setMaxProgress(0);
    setShowSuggestions(false);
    setActiveSuggestion(-1);

    const load = async () => {
      let metadata = {};
      try {
        try {
          const response = await request("totalStars");
          if (response.ok) metadata = await response.json();
        } catch (err) {
          if (signal.aborted) throw err;
        }
        if (signal.aborted) return;
        setMaxProgress(Math.ceil((metadata.stars || 0) / 100));
        eventSource = new EventSource(`${HOST}/sse?repo=${encodeURIComponent(activeRepo)}`);
        eventSource.addEventListener("current-value", (event) => {
          if (signal.aborted) return;
          try {
            const value = Number(JSON.parse(event.data).data);
            if (Number.isFinite(value)) {
              sseReceivedProgress = true;
              setProgress(value);
            }
          } catch { /* Ignore malformed progress events; fetching can continue. */ }
        });
        eventSource.onerror = () => eventSource.close();

        for (let attempt = 0; attempt < 60; attempt++) {
          const response = await request("allStars");
          if (response.status === 204) {
            await waitForRetry(signal);
            continue;
          }
          if (response.ok) {
            const data = await response.json();
            if (signal.aborted) return;
            const history = (data.stars || []).map(item => ({ date: item[0], daily: item[1], total: item[2] }));
            const best = history.reduce((peak, day) => !peak || day.daily > peak.daily ? day : peak, null);
            setResult({
              repo: activeRepo,
              history,
              total: history.length ? history[history.length - 1].total : (metadata.stars || 0),
              recent: history.slice(-10).reduce((sum, day) => sum + day.daily, 0),
              age: formatAge(metadata.createdAt),
              best,
            });
            return;
          }
          if (response.status === 500) {
            let ongoing = sseReceivedProgress;
            try {
              const statusResponse = await request("status");
              if (statusResponse.ok) ongoing ||= (await statusResponse.json()).onGoing;
            } catch (err) {
              if (signal.aborted) throw err;
            }
            if (ongoing || attempt === 0) {
              await waitForRetry(signal);
              continue;
            }
          }
          const messages = {
            404: "Repository not found. Check the owner and repository name.",
            429: "GitHub’s rate limit has been reached. Please try again later.",
            504: "This repository is taking longer than expected. Please try again.",
          };
          throw new Error(messages[response.status] || "Couldn’t load this repository. Please try again.");
        }
        throw new Error("This repository is still being processed. Please try again shortly.");
      } catch (err) {
        if (!signal.aborted) setError(err instanceof TypeError
          ? "Couldn’t connect. Check your connection and try again."
          : err.message);
      } finally {
        eventSource?.close();
        if (!signal.aborted) setLoading(false);
      }
    };
    load();
    return () => {
      controller.abort();
      eventSource?.close();
    };
  }, [activeRepo, retry]);

  const openRepo = (value) => {
    const normalized = normalizeRepo(value);
    if (!normalized) {
      setInputError("Enter owner/repository or paste a GitHub repository URL.");
      inputRef.current?.focus();
      return;
    }
    setRepo(normalized);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
    setInputError("");
    inputRef.current?.blur();
    if (normalized === activeRepo) setRetry(value => value + 1);
    else navigate(`/${normalized}?range=${dailyChartRange}`);
  };

  const togglePin = (name) => setPinnedRepos(previous => previous.includes(name)
    ? previous.filter(r => r !== name) : [...previous, name]);

  const changeRange = (range) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set("range", range);
      return next;
    }, { replace: true });
    setShareMessage("");
    setShareFallback("");
  };

  const shareRepo = async () => {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin);
    url.hash = `/${result.repo}?range=${dailyChartRange}`;
    setShareMessage("");
    setShareFallback("");
    try {
      if (navigator.share) {
        await navigator.share({ title: `${result.repo} · Daily Stars Explorer`, url: url.toString() });
      } else {
        await navigator.clipboard.writeText(url.toString());
        setShareMessage("Link copied");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setShareFallback(url.toString());
        setShareMessage("Select and copy the link below.");
      }
    }
  };

  const percentage = maxProgress > 0 && progress > 0
    ? Math.min(Math.round(progress / maxProgress * 100), 99) : null;
  const history = result?.history || [];
  const cumulativeMax = Math.max(result?.total || 0, 1);
  const cumulativePoints = history.map((day, index) =>
    `${history.length === 1 ? 150 : index / (history.length - 1) * 300},${110 - day.total / cumulativeMax * 100}`
  ).join(" ");

  return (
    <div className="mobile-stars" data-theme={theme}>
      <form className="mobile-stars__search" onSubmit={(event) => {
        event.preventDefault();
        openRepo(repo);
      }} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setShowSuggestions(false);
      }}>
        <label htmlFor="mobile-repo">Explore a GitHub repository</label>
        <div className="mobile-stars__search-row">
          <input
            id="mobile-repo" ref={inputRef} type="text" value={repo}
            role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen}
            aria-controls={suggestionsOpen ? "mobile-repo-suggestions" : undefined}
            aria-activedescendant={suggestionsOpen && activeSuggestion >= 0 ? `mobile-repo-option-${activeSuggestion}` : undefined}
            aria-invalid={!!inputError} aria-describedby={inputError ? "mobile-repo-error" : "mobile-repo-hint"}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" enterKeyHint="go"
            placeholder="owner/repository"
            onChange={(event) => {
              setRepo(event.target.value);
              setInputError("");
              setShowSuggestions(true);
              setActiveSuggestion(-1);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setShowSuggestions(false);
                setActiveSuggestion(-1);
              }
              if (filteredRepos.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                setShowSuggestions(true);
                const next = event.key === "ArrowDown"
                  ? (activeSuggestion + 1) % filteredRepos.length
                  : (activeSuggestion <= 0 ? filteredRepos.length - 1 : activeSuggestion - 1);
                setActiveSuggestion(next);
                document.getElementById(`mobile-repo-option-${next}`)?.scrollIntoView({ block: "nearest" });
              }
              if (event.key === "Enter" && suggestionsOpen && filteredRepos[activeSuggestion]) {
                event.preventDefault();
                openRepo(filteredRepos[activeSuggestion]);
              }
            }}
          />
          <button className="mobile-stars__primary" type="submit" disabled={!repo.trim()}>Go <span aria-hidden="true">→</span></button>
        </div>
        <p id={inputError ? "mobile-repo-error" : "mobile-repo-hint"} className={inputError ? "mobile-stars__input-error" : "mobile-stars__hint"} role={inputError ? "alert" : undefined}>
          {inputError || "Paste a GitHub URL or enter owner/repository"}
        </p>
        {suggestionsOpen && (
          <ul id="mobile-repo-suggestions" className="mobile-stars__suggestions" role="listbox" aria-label="Repository suggestions"
            // Prevent blur before selection without canceling the touch pointer gesture.
            onMouseDown={event => event.preventDefault()}>
            {filteredRepos.map((name, index) => (
              <li key={name} role="option" id={`mobile-repo-option-${index}`} aria-selected={activeSuggestion === index}
                onClick={() => openRepo(name)}>
                {name}
              </li>
            ))}
          </ul>
        )}
      </form>

      {pinnedRepos.length > 0 && (
        <nav className="mobile-stars__pins" aria-label="Pinned repositories">
          <span className="mobile-stars__eyebrow">Pinned repositories</span>
          <div className="mobile-stars__pin-list">
            {pinnedRepos.map(name => (
              <div className="mobile-stars__pin" key={name}>
                <button type="button" onClick={() => openRepo(name)} aria-label={`Open ${name}`} aria-current={name === activeRepo ? "page" : undefined}>{name}</button>
                <button type="button" onClick={() => togglePin(name)} aria-label={`Unpin ${name}`}>×</button>
              </div>
            ))}
          </div>
        </nav>
      )}

      {loading && (
        <div className="mobile-stars__card mobile-stars__loading">
          <div role="status"><strong>Loading {activeRepo}</strong><p>Fetching star history. Large repositories may take a few minutes.</p></div>
          <div className="mobile-stars__progress" role="progressbar" aria-label="Loading star history"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage ?? undefined}>
            <div className={percentage === null ? "is-indeterminate" : ""} style={{ width: percentage === null ? "35%" : `${percentage}%` }} />
          </div>
          <p className="mobile-stars__hint">{percentage === null ? "Waiting for repository data…" : `${percentage}% complete`}</p>
        </div>
      )}

      {error && (
        <div className="mobile-stars__error">
          <div role="alert"><strong>Couldn’t load {activeRepo}</strong><p>{error}</p></div>
          <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>
        </div>
      )}

      {result && (
        <>
          <section className="mobile-stars__hero" aria-label="Repository overview">
            <h1><a href={`https://github.com/${result.repo}`} target="_blank" rel="noopener noreferrer">{result.repo}</a></h1>
            <div className="mobile-stars__total"><span aria-hidden="true">★</span> {result.total.toLocaleString()} <span>stars</span></div>
            <p className="mobile-stars__hint">{history.length ? `Through ${formatDay(history[history.length - 1].date)} (UTC)` : "No completed daily history yet"}{result.age && ` · ${result.age} old`}</p>
            <div className="mobile-stars__actions">
              <button type="button" onClick={() => togglePin(result.repo)} aria-pressed={pinnedRepos.includes(result.repo)}>
                {pinnedRepos.includes(result.repo) ? "✓ Pinned" : "+ Pin repository"}
              </button>
              <button type="button" onClick={shareRepo}>Share <span aria-hidden="true">↗</span></button>
            </div>
            <span className="mobile-stars__share-status" role="status">{shareMessage}</span>
            {shareFallback && <input className="mobile-stars__share-link" aria-label="Share link" readOnly value={shareFallback} onFocus={event => event.target.select()} />}
          </section>

          {history.length > 0 ? (
            <>
              <MobileStarsChart key={result.repo} history={history} range={dailyChartRange} onRangeChange={changeRange} theme={theme} />
              <div className="mobile-stars__stats">
                <div className="mobile-stars__card"><span className="mobile-stars__eyebrow">Last 10 days</span><strong className="mobile-stars__growth">+{result.recent.toLocaleString()}</strong><span className="mobile-stars__hint">stars added</span></div>
                <div className="mobile-stars__card"><span className="mobile-stars__eyebrow">Best day</span><strong>{result.best.daily.toLocaleString()}</strong><span className="mobile-stars__hint">{formatDay(result.best.date)}</span></div>
              </div>
              <section className="mobile-stars__card mobile-stars__cumulative" aria-label="Cumulative stars">
                <h2>Total stars over time</h2>
                <svg viewBox="0 0 300 120" preserveAspectRatio="none" role="img" aria-label={`Cumulative stars from ${formatDay(history[0].date)} to ${formatDay(history[history.length - 1].date)}: ${result.total.toLocaleString()} stars. Vertical scale starts at zero.`}>
                  <defs><linearGradient id="mobile-cumulative-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.3" /><stop offset="100%" stopColor="currentColor" stopOpacity="0.02" /></linearGradient></defs>
                  <polygon points={`0,110 ${cumulativePoints} 300,110`} fill="url(#mobile-cumulative-fill)" />
                  <polyline points={cumulativePoints} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                  {history.length === 1 && <circle cx="150" cy={110 - history[0].total / cumulativeMax * 100} r="3" fill="currentColor" />}
                </svg>
                <div className="mobile-stars__dates"><span>{formatDay(history[0].date)}</span><span>{formatDay(history[history.length - 1].date)}</span></div>
              </section>
            </>
          ) : <div className="mobile-stars__card"><h2>No daily history yet</h2><p>Daily charts include completed days. Check back after the next UTC day, or try another repository.</p></div>}
        </>
      )}
      <p className="mobile-stars__footer">Daily history includes completed days in UTC.</p>
    </div>
  );
};

export default MobileStarsView;
