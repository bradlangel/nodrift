import {
  AccessDecisionCategory,
  CategoryStatsProjection,
  DailyBlockerStats,
  DailySiteStats,
  SiteStatsProjection,
  buildDailyStatsProjection,
} from "./stats.js";

type LocalStatsResponse = {
  ok: boolean;
  stats?: DailyBlockerStats;
  error?: string;
};

const formatUsedTime = (seconds: number): string => {
  const value = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
};

const formatDecisionLabel = (decision: DailyBlockerStats["recentDecisions"][number]): string => {
  if (decision.action === "temporary-allow") {
    const mins = Number.isFinite(decision.minutes) ? Math.max(decision.minutes ?? 0, 0) : 0;
    return mins > 0 ? `Temporarily allowed (${mins}m)` : "Temporarily allowed";
  }
  if (decision.action === "request-denied") {
    return "Request denied";
  }
  if (decision.action === "request-follow-up") {
    return "Follow-up requested";
  }
  return "Blocked";
};

const formatCategoryLabel = (category: AccessDecisionCategory): string =>
  category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const siteStatsEntries = (stats: DailyBlockerStats): Array<[string, DailySiteStats]> =>
  Object.entries(stats.siteStatsToday || {});

const topSitesBy = (
  stats: DailyBlockerStats,
  key: keyof DailySiteStats,
  limit = 7
): Array<[string, DailySiteStats]> =>
  siteStatsEntries(stats)
    .filter(([, siteStats]) => siteStats[key] > 0)
    .sort((a, b) => b[1][key] - a[1][key] || a[0].localeCompare(b[0]))
    .slice(0, limit);

const setText = (id: string, value: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
};

const renderTopSites = (
  listId: string,
  rows: Array<[string, DailySiteStats]>,
  valueFormatter: (siteStats: DailySiteStats) => string,
  emptyLabel: string
) => {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = "";

  if (rows.length === 0) {
    const item = document.createElement("li");
    item.className = "row row-empty";
    item.textContent = emptyLabel;
    list.appendChild(item);
    return;
  }

  rows.forEach(([site, siteStats]) => {
    const item = document.createElement("li");
    item.className = "row";

    const domain = document.createElement("span");
    domain.className = "row-domain";
    domain.textContent = site;

    const value = document.createElement("strong");
    value.className = "row-value";
    value.textContent = valueFormatter(siteStats);

    item.appendChild(domain);
    item.appendChild(value);
    list.appendChild(item);
  });
};

const renderPerSiteDetails = (stats: DailyBlockerStats) => {
  const root = document.getElementById("per-site-details");
  if (!root) return;
  root.innerHTML = "";

  const projection = buildDailyStatsProjection(stats);
  const rows = Object.values(projection.perSiteStatsToday)
    .filter(
      (siteStats) =>
        siteStats.blockedAttemptsToday > 0 ||
        siteStats.temporaryAllowsToday > 0 ||
        siteStats.temporaryAllowUsedSecondsToday > 0
    )
    .sort(
      (a, b) =>
        b.blockedAttemptsToday - a.blockedAttemptsToday ||
        b.temporaryAllowsToday - a.temporaryAllowsToday ||
        a.site.localeCompare(b.site)
    )
    .slice(0, 12);

  if (rows.length === 0) {
    const item = document.createElement("li");
    item.className = "row row-empty";
    item.textContent = "No site stats recorded today.";
    root.appendChild(item);
    return;
  }

  rows.forEach((siteStats: SiteStatsProjection) => {
    const item = document.createElement("li");
    item.className = "site-detail-row";

    const top = document.createElement("div");
    top.className = "decision-top";

    const site = document.createElement("strong");
    site.className = "row-domain";
    site.textContent = siteStats.site;

    const pressure = document.createElement("span");
    pressure.className = "muted";
    pressure.textContent =
      siteStats.blockedAttemptsToday > 0
        ? `Access pressure ${siteStats.temporaryAllowsToday}/${siteStats.blockedAttemptsToday}`
        : "Access pressure n/a";

    const detail = document.createElement("div");
    detail.className = "muted";
    detail.textContent = [
      `${siteStats.blockedAttemptsToday} blocked`,
      `${siteStats.temporaryAllowsToday} temp allows`,
      `${formatUsedTime(siteStats.temporaryAllowUsedSecondsToday)} temp access`,
    ].join(" · ");

    top.appendChild(site);
    top.appendChild(pressure);
    item.appendChild(top);
    item.appendChild(detail);
    root.appendChild(item);
  });
};

const hasCategoryActivity = (categoryStats: CategoryStatsProjection): boolean =>
  categoryStats.accessRequestsToday > 0 ||
  categoryStats.temporaryAllowsToday > 0 ||
  categoryStats.requestDenialsToday > 0 ||
  categoryStats.followUpsToday > 0 ||
  categoryStats.temporaryAllowUsedSecondsToday > 0;

const renderCategorySummary = (stats: DailyBlockerStats) => {
  const root = document.getElementById("category-summary");
  if (!root) return;
  root.innerHTML = "";

  const projection = buildDailyStatsProjection(stats);
  const rows = Object.entries(projection.categorySummaryToday)
    .filter(([, categoryStats]) => hasCategoryActivity(categoryStats))
    .sort(
      (a, b) =>
        b[1].accessRequestsToday - a[1].accessRequestsToday ||
        b[1].temporaryAllowsToday - a[1].temporaryAllowsToday ||
        a[0].localeCompare(b[0])
    ) as Array<[AccessDecisionCategory, CategoryStatsProjection]>;

  if (rows.length === 0) {
    const item = document.createElement("li");
    item.className = "row row-empty";
    item.textContent = "No categorized requests yet today.";
    root.appendChild(item);
    return;
  }

  rows.forEach(([category, categoryStats]) => {
    const item = document.createElement("li");
    item.className = "category-row";

    const top = document.createElement("div");
    top.className = "decision-top";

    const label = document.createElement("strong");
    label.textContent = formatCategoryLabel(category);

    const allows = document.createElement("span");
    allows.className = "muted";
    allows.textContent = `${categoryStats.temporaryAllowsToday} allowed`;

    const detail = document.createElement("div");
    detail.className = "muted";
    detail.textContent = [
      `${categoryStats.accessRequestsToday} requests`,
      `${categoryStats.requestDenialsToday} denied`,
      `${categoryStats.followUpsToday} follow-ups`,
      `${formatUsedTime(categoryStats.temporaryAllowUsedSecondsToday)} used`,
    ].join(" · ");

    top.appendChild(label);
    top.appendChild(allows);
    item.appendChild(top);
    item.appendChild(detail);
    root.appendChild(item);
  });
};

const renderRecentDecisions = (stats: DailyBlockerStats) => {
  const root = document.getElementById("recent-decisions");
  if (!root) return;
  root.innerHTML = "";

  const decisions = Array.isArray(stats.recentDecisions)
    ? stats.recentDecisions.slice(0, 12)
    : [];

  if (decisions.length === 0) {
    const item = document.createElement("li");
    item.className = "row row-empty";
    item.textContent = "No decisions yet today.";
    root.appendChild(item);
    return;
  }

  decisions.forEach((decision) => {
    const item = document.createElement("li");
    item.className = "decision-row";

    const top = document.createElement("div");
    top.className = "decision-top";

    const label = document.createElement("strong");
    label.textContent = formatDecisionLabel(decision);

    const time = document.createElement("span");
    time.className = "muted";
    time.textContent = new Date(decision.timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    const site = document.createElement("div");
    site.className = "muted";
    site.textContent = decision.site || "Unknown site";

    top.appendChild(label);
    top.appendChild(time);
    item.appendChild(top);
    item.appendChild(site);

    if (decision.source || decision.scope === "url") {
      const meta = document.createElement("div");
      meta.className = "muted";
      meta.textContent = [
        decision.source ? `via ${decision.source}` : null,
        decision.model ? `model ${decision.model}` : null,
        decision.scope === "url" ? "URL scoped" : null,
      ]
        .filter(Boolean)
        .join(" · ");
      item.appendChild(meta);
    }

    if (decision.purpose) {
      const purpose = document.createElement("div");
      purpose.className = "muted";
      purpose.textContent = `Purpose: ${decision.purpose}`;
      item.appendChild(purpose);
    }

    if (decision.message) {
      const message = document.createElement("div");
      message.className = "muted";
      message.textContent = `Reason: ${decision.message}`;
      item.appendChild(message);
    }

    root.appendChild(item);
  });
};

const renderStats = (stats: DailyBlockerStats) => {
  setText("summary-date", stats.dayKey);
  setText("blocked-attempts", String(stats.blockedAttemptsToday || 0));
  setText("temporary-allows", String(stats.temporaryAllowsToday || 0));
  setText("temp-allow-time", formatUsedTime(stats.temporaryAllowUsedSecondsToday || 0));

  renderTopSites(
    "top-blocked-domains",
    topSitesBy(stats, "blockedAttemptsToday"),
    (siteStats) => `${siteStats.blockedAttemptsToday}`,
    "No blocked domains recorded today."
  );

  renderTopSites(
    "top-temp-access-domains",
    topSitesBy(stats, "temporaryAllowUsedSecondsToday"),
    (siteStats) => formatUsedTime(siteStats.temporaryAllowUsedSecondsToday),
    "No temporary access usage recorded today."
  );

  renderPerSiteDetails(stats);
  renderCategorySummary(stats);
  renderRecentDecisions(stats);
};

const setStatus = (message: string) => {
  const status = document.getElementById("status-message");
  if (!status) return;
  status.textContent = message;
};

const getLocalStats = (): Promise<DailyBlockerStats> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "get-local-stats" }, (response: LocalStatsResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok || !response.stats) {
        reject(new Error(response?.error || "Could not load local stats."));
        return;
      }
      resolve(response.stats);
    });
  });

const loadAndRenderStats = async () => {
  setStatus("Loading local stats...");
  try {
    const stats = await getLocalStats();
    renderStats(stats);
    setStatus("All stats stay on this device.");
  } catch (error) {
    console.warn("Failed to render stats dashboard", error);
    setStatus("Could not load stats right now.");
  }
};

const bindActions = () => {
  const resetBtn = document.getElementById("reset-today");
  resetBtn?.addEventListener("click", () => {
    const confirmed = window.confirm("Reset today's local stats?");
    if (!confirmed) return;

    setStatus("Resetting today's local stats...");
    chrome.runtime.sendMessage({ type: "reset-today-local-stats" }, (response: LocalStatsResponse) => {
      if (chrome.runtime.lastError || !response?.ok || !response.stats) {
        console.warn("Failed to reset today's local stats", chrome.runtime.lastError?.message || response?.error);
        setStatus("Could not reset stats.");
        return;
      }
      renderStats(response.stats);
      setStatus("Today's stats reset. Data remains local.");
    });
  });
};

bindActions();
void loadAndRenderStats();
