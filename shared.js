export const STORAGE_KEYS = Object.freeze({
  sessions: "savedSessions",
  lastActionStatus: "lastActionStatus"
});

export const SESSION_SOURCE = Object.freeze({
  manual: "manual",
  auto: "auto"
});

export const AUTO_SAVE_ALARM = "context-switch-killer:auto-save";
export const AUTO_SAVE_LIMIT = 10;

export const CATEGORY_ORDER = Object.freeze([
  "Coding",
  "Learning",
  "Work / Productivity",
  "Shopping",
  "Social / Entertainment",
  "News",
  "General"
]);

const CATEGORY_GROUP_COLORS = Object.freeze({
  Coding: "blue",
  Learning: "green",
  Shopping: "orange",
  "Social / Entertainment": "pink",
  "Work / Productivity": "cyan",
  News: "yellow",
  General: "grey"
});

const CATEGORY_RULES = Object.freeze([
  { category: "Coding", any: ["github.com"] },
  { category: "Coding", any: ["stackoverflow.com"] },
  { category: "Coding", any: ["gitlab.com"] },
  { category: "Coding", any: ["leetcode.com"] },
  { category: "Coding", any: ["hackerrank.com"] },
  { category: "Coding", any: ["codepen.io"] },
  {
    category: "Learning",
    all: ["youtube.com"],
    any: ["tutorial", "course", "lecture"]
  },
  { category: "Learning", any: ["medium.com"] },
  { category: "Learning", any: ["dev.to"] },
  { category: "Learning", any: ["coursera.org"] },
  { category: "Learning", any: ["udemy.com"] },
  { category: "Learning", any: ["freecodecamp.org"] },
  { category: "Learning", any: ["geeksforgeeks.org"] },
  { category: "Shopping", any: ["amazon.in"] },
  { category: "Shopping", any: ["amazon.com"] },
  { category: "Shopping", any: ["flipkart.com"] },
  { category: "Shopping", any: ["myntra.com"] },
  { category: "Shopping", any: ["ajio.com"] },
  { category: "Social / Entertainment", any: ["instagram.com"] },
  { category: "Social / Entertainment", any: ["facebook.com"] },
  { category: "Social / Entertainment", any: ["twitter.com"] },
  { category: "Social / Entertainment", any: ["x.com"] },
  { category: "Social / Entertainment", any: ["reddit.com"] },
  { category: "Social / Entertainment", any: ["netflix.com"] },
  { category: "Work / Productivity", any: ["docs.google.com"] },
  { category: "Work / Productivity", any: ["sheets.google.com"] },
  { category: "Work / Productivity", any: ["notion.so"] },
  { category: "Work / Productivity", any: ["slack.com"] },
  { category: "Work / Productivity", any: ["drive.google.com"] },
  { category: "Work / Productivity", any: ["trello.com"] },
  { category: "News", any: ["bbc.com"] },
  { category: "News", any: ["nytimes.com"] },
  { category: "News", any: ["thehindu.com"] }
]);

const STATUS_TTL_MS = 15 * 60 * 1000;

export async function ensureStorageState() {
  const existing = await chrome.storage.local.get([
    STORAGE_KEYS.sessions,
    STORAGE_KEYS.lastActionStatus
  ]);
  const nextValues = {};

  if (!Array.isArray(existing[STORAGE_KEYS.sessions])) {
    nextValues[STORAGE_KEYS.sessions] = [];
  }

  if (!existing[STORAGE_KEYS.lastActionStatus]) {
    nextValues[STORAGE_KEYS.lastActionStatus] = null;
  }

  if (Object.keys(nextValues).length > 0) {
    await chrome.storage.local.set(nextValues);
  }
}

export async function getSavedSessions() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.sessions);
  const sessions = Array.isArray(result[STORAGE_KEYS.sessions])
    ? result[STORAGE_KEYS.sessions]
    : [];

  return sessions.map(normalizeSavedSession).sort(sortSessionsNewestFirst);
}

export async function getLastActionStatus() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.lastActionStatus);
  return result[STORAGE_KEYS.lastActionStatus] ?? null;
}

export async function setLastActionStatus(message, type = "info") {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastActionStatus]: {
      message,
      type,
      createdAt: new Date().toISOString()
    }
  });
}

export function isFreshStatus(status) {
  if (!status?.createdAt) {
    return false;
  }

  return Date.now() - new Date(status.createdAt).getTime() < STATUS_TTL_MS;
}

export function detectCategoryFromUrl(url = "") {
  const normalizedUrl = String(url || "").toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (doesUrlMatchRule(normalizedUrl, rule)) {
      return rule.category;
    }
  }

  return "General";
}

export function buildCategoryBreakdown(tabs = []) {
  const breakdown = CATEGORY_ORDER.reduce((result, category) => {
    result[category] = 0;
    return result;
  }, {});

  tabs.forEach((tab) => {
    const category = tab.category || detectCategoryFromUrl(tab.url || "");
    breakdown[category] = (breakdown[category] || 0) + 1;
  });

  return breakdown;
}

export function getBreakdownEntries(breakdown = {}, options = {}) {
  const includeZero = options.includeZero ?? false;

  return CATEGORY_ORDER.map((category) => [category, breakdown[category] || 0]).filter(
    ([, count]) => includeZero || count > 0
  );
}

export function formatCategorySummary(breakdown = {}) {
  const entries = getBreakdownEntries(breakdown);

  if (!entries.length) {
    return "No tabs";
  }

  return entries.map(([category, count]) => `${category}: ${count}`).join(" | ");
}

export function formatSessionDate(dateString) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateString));
}

export async function getCurrentContext(scope = "currentWindow") {
  const tabs = await captureSessionTabs(scope);
  const breakdown = buildCategoryBreakdown(tabs);
  const focusLabel = tabs.length
    ? createSmartSessionName(tabs).replace(/ Session$/, "")
    : "No active context";
  const distractionCount =
    (breakdown["Shopping"] || 0) + (breakdown["Social / Entertainment"] || 0);

  let focusMeta = "Open a few tabs and the extension will detect your context.";

  if (tabs.length) {
    focusMeta =
      distractionCount > 0
        ? `${distractionCount} distraction tab${distractionCount === 1 ? "" : "s"} detected in this window.`
        : "Your active tabs are tightly aligned right now.";
  }

  return {
    totalTabs: tabs.length,
    breakdown,
    focusLabel,
    focusMeta,
    focusSummary: tabs.length
      ? formatCategorySummary(breakdown)
      : "Save a session once your flow state is where you want it."
  };
}

export async function saveWindowSession(options = {}) {
  const customName = options.customName?.trim() || "";
  const scope = options.scope || "currentWindow";
  const tabs = await captureSessionTabs(scope);

  if (!tabs.length) {
    throw new Error("No tabs were available to save in this window.");
  }

  const session = buildSessionRecord({
    name: customName || createSmartSessionName(tabs),
    source: SESSION_SOURCE.manual,
    tabs
  });

  const sessions = await getSavedSessions();
  sessions.unshift(session);
  await writeSessions(sessions);

  return session;
}

export async function createAutoSaveSession() {
  const tabs = await captureSessionTabs("allWindows");

  if (!tabs.length) {
    return null;
  }

  const autoSession = buildSessionRecord({
    name: `Auto Session - ${formatAutoSaveTime(new Date())}`,
    source: SESSION_SOURCE.auto,
    tabs
  });

  const sessions = await getSavedSessions();
  const manualSessions = sessions.filter(
    (session) => session.source !== SESSION_SOURCE.auto
  );
  const autoSessions = sessions.filter(
    (session) => session.source === SESSION_SOURCE.auto
  );

  autoSessions.unshift(autoSession);

  await writeSessions(
    [...manualSessions, ...autoSessions.slice(0, AUTO_SAVE_LIMIT)].sort(
      sortSessionsNewestFirst
    )
  );

  return autoSession;
}

export async function restoreSessionById(sessionId, scope = "currentWindow") {
  const sessions = await getSavedSessions();
  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error("That session no longer exists.");
  }

  return restoreSession(session, scope);
}

export async function restoreLatestSession(scope = "currentWindow") {
  const sessions = await getSavedSessions();
  const latestManualSession = sessions.find(
    (session) => session.source !== SESSION_SOURCE.auto
  );

  if (!sessions.length) {
    throw new Error("There are no saved sessions to restore yet.");
  }

  return restoreSession(latestManualSession || sessions[0], scope);
}

export async function deleteSession(sessionId) {
  const sessions = await getSavedSessions();
  const targetSession = sessions.find((item) => item.id === sessionId);

  if (!targetSession) {
    throw new Error("That session no longer exists.");
  }

  await writeSessions(sessions.filter((item) => item.id !== sessionId));
  return targetSession;
}

export async function groupTabsForScope(scope = "currentWindow") {
  const rawTabs = await queryTabs(scope);
  const workingTabs = rawTabs
    .filter((tab) => typeof tab.id === "number")
    .map((tab) => ({
      id: tab.id,
      pinned: Boolean(tab.pinned),
      category: detectCategoryFromUrl(tab.url || tab.pendingUrl || "")
    }));

  const pinnedTabs = workingTabs.filter((tab) => tab.pinned);
  const groupableTabs = workingTabs.filter((tab) => !tab.pinned);
  const groupedCategories = await groupTabsByCategory(groupableTabs);

  return {
    groupedCategories,
    groupedTabCount: groupableTabs.length,
    skippedPinnedTabs: pinnedTabs.length
  };
}

function buildSessionRecord({ name, source, tabs }) {
  const categoryBreakdown = buildCategoryBreakdown(tabs);

  return {
    id: crypto.randomUUID(),
    name,
    source,
    createdAt: new Date().toISOString(),
    tabCount: tabs.length,
    dominantCategory: getDominantCategory(categoryBreakdown),
    categoryBreakdown,
    tabs
  };
}

function getDominantCategory(breakdown) {
  const meaningfulEntries = getBreakdownEntries(breakdown).filter(
    ([category]) => category !== "General"
  );
  const sourceEntries = meaningfulEntries.length
    ? meaningfulEntries
    : getBreakdownEntries(breakdown);

  return sourceEntries[0]?.[0] || "General";
}

function createSmartSessionName(tabs) {
  const breakdown = buildCategoryBreakdown(tabs);
  const meaningfulEntries = getBreakdownEntries(breakdown).filter(
    ([category]) => category !== "General"
  );
  const sourceEntries = meaningfulEntries.length
    ? meaningfulEntries
    : getBreakdownEntries(breakdown);

  if (!sourceEntries.length) {
    return "General Session";
  }

  const [first, second] = sourceEntries;

  if (second && first[1] === second[1]) {
    return `${first[0]} + ${second[0]} Session`;
  }

  return `${first[0]} Session`;
}

function normalizeSavedSession(session) {
  const tabs = Array.isArray(session?.tabs)
    ? session.tabs.map((tab) => {
        const url = tab.url || "";

        return {
          title: tab.title || url || "Untitled tab",
          url,
          category: tab.category || detectCategoryFromUrl(url)
        };
      })
    : [];
  const categoryBreakdown = buildCategoryBreakdown(tabs);

  return {
    id: session?.id || crypto.randomUUID(),
    name: session?.name || createSmartSessionName(tabs),
    source:
      session?.source === SESSION_SOURCE.auto
        ? SESSION_SOURCE.auto
        : SESSION_SOURCE.manual,
    createdAt: session?.createdAt || new Date().toISOString(),
    tabCount:
      typeof session?.tabCount === "number" ? session.tabCount : tabs.length,
    dominantCategory:
      session?.dominantCategory || getDominantCategory(categoryBreakdown),
    categoryBreakdown,
    tabs
  };
}

async function restoreSession(session, scope) {
  const restorableTabs = session.tabs.filter((tab) => isRestorableUrl(tab.url));
  const skippedCount = session.tabs.length - restorableTabs.length;

  if (!restorableTabs.length) {
    throw new Error(
      "This session only contains browser pages that Chrome cannot reopen automatically."
    );
  }

  const windowId = await getTargetWindowId(scope);
  const createdTabs = [];

  for (const tab of restorableTabs) {
    const createProperties = {
      active: false,
      url: tab.url
    };

    if (typeof windowId === "number") {
      createProperties.windowId = windowId;
    }

    const createdTab = await chrome.tabs.create(createProperties);

    if (typeof createdTab.id === "number") {
      createdTabs.push({
        id: createdTab.id,
        category: tab.category
      });
    }
  }

  await groupTabsByCategory(createdTabs);

  return {
    session,
    restoredCount: restorableTabs.length,
    skippedCount
  };
}

async function groupTabsByCategory(tabs) {
  const buckets = new Map(CATEGORY_ORDER.map((category) => [category, []]));

  tabs.forEach((tab) => {
    if (!buckets.has(tab.category)) {
      buckets.set(tab.category, []);
    }

    buckets.get(tab.category).push(tab.id);
  });

  const groupedCategories = [];

  for (const category of CATEGORY_ORDER) {
    const tabIds = (buckets.get(category) || []).filter((tabId) =>
      Number.isInteger(tabId)
    );

    if (!tabIds.length) {
      continue;
    }

    const groupId = await chrome.tabs.group({
      tabIds
    });

    await chrome.tabGroups.update(groupId, {
      title: category,
      color: CATEGORY_GROUP_COLORS[category] || "grey",
      collapsed: false
    });

    groupedCategories.push({
      category,
      count: tabIds.length,
      groupId
    });
  }

  return groupedCategories;
}

async function captureSessionTabs(scope) {
  const tabs = await queryTabs(scope);

  return tabs.map((tab) => {
    const url = tab.url || tab.pendingUrl || "";

    return {
      title: tab.title || url || "Untitled tab",
      url,
      category: detectCategoryFromUrl(url)
    };
  });
}

async function queryTabs(scope) {
  const queryInfo = {
    windowType: "normal"
  };

  if (scope === "currentWindow") {
    queryInfo.currentWindow = true;
  }

  if (scope === "lastFocusedWindow") {
    queryInfo.lastFocusedWindow = true;
  }

  return chrome.tabs.query(queryInfo);
}

async function getTargetWindowId(scope) {
  const queryInfo =
    scope === "lastFocusedWindow"
      ? { active: true, lastFocusedWindow: true }
      : { active: true, currentWindow: true };

  const [activeTab] = await chrome.tabs.query(queryInfo);
  return activeTab?.windowId;
}

async function writeSessions(sessions) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.sessions]: [...sessions].sort(sortSessionsNewestFirst)
  });
}

function doesUrlMatchRule(normalizedUrl, rule) {
  const satisfiesAll =
    !rule.all || rule.all.every((fragment) => normalizedUrl.includes(fragment));
  const satisfiesAny =
    !rule.any || rule.any.some((fragment) => normalizedUrl.includes(fragment));

  return satisfiesAll && satisfiesAny;
}

function formatAutoSaveTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function sortSessionsNewestFirst(first, second) {
  return new Date(second.createdAt) - new Date(first.createdAt);
}

function isRestorableUrl(url) {
  const normalizedUrl = String(url || "").toLowerCase();
  return normalizedUrl.startsWith("http://") || normalizedUrl.startsWith("https://");
}
