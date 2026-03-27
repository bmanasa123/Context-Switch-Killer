import {
  deleteSession,
  formatCategorySummary,
  formatSessionDate,
  getBreakdownEntries,
  getCurrentContext,
  getLastActionStatus,
  getSavedSessions,
  groupTabsForScope,
  isFreshStatus,
  restoreLatestSession,
  restoreSessionById,
  saveWindowSession,
  setLastActionStatus
} from "./shared.js";

const STATUS_AUTO_CLEAR_MS = 5000;
const REFRESH_DEBOUNCE_MS = 180;

export function bootApp({ surface }) {
  const elements = getElements();
  const state = {
    refreshTimerId: 0,
    statusTimerId: 0,
    sessions: []
  };

  bindEvents();
  void refreshAll();

  function bindEvents() {
    elements.saveSessionButton.addEventListener("click", () => {
      void handleSaveSession();
    });

    elements.groupTabsButton.addEventListener("click", () => {
      void handleGroupTabs();
    });

    elements.restoreLastButton.addEventListener("click", () => {
      void handleRestoreLast();
    });

    elements.openSidePanelButton.addEventListener("click", () => {
      void handleOpenSidePanel();
    });

    elements.sessionNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSaveSession();
      }
    });

    elements.sessionsList.addEventListener("click", (event) => {
      void handleSessionAction(event);
    });

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.tabs.onCreated.addListener(scheduleRefresh);
    chrome.tabs.onRemoved.addListener(scheduleRefresh);
    chrome.tabs.onActivated.addListener(scheduleRefresh);
    chrome.tabs.onUpdated.addListener(scheduleRefresh);
    window.addEventListener("unload", cleanup);

    if (surface !== "popup" || !chrome.sidePanel?.open) {
      elements.openSidePanelButton.hidden = true;
    }
  }

  function cleanup() {
    chrome.storage.onChanged.removeListener(handleStorageChange);
    chrome.tabs.onCreated.removeListener(scheduleRefresh);
    chrome.tabs.onRemoved.removeListener(scheduleRefresh);
    chrome.tabs.onActivated.removeListener(scheduleRefresh);
    chrome.tabs.onUpdated.removeListener(scheduleRefresh);
    window.clearTimeout(state.refreshTimerId);
    window.clearTimeout(state.statusTimerId);
  }

  async function refreshAll() {
    try {
      const [sessions, currentContext, lastActionStatus] = await Promise.all([
        getSavedSessions(),
        getCurrentContext(),
        getLastActionStatus()
      ]);

      state.sessions = sessions;

      renderOverview(currentContext, sessions.length);
      renderSessions(sessions);
      renderRestoreState(sessions);

      if (isFreshStatus(lastActionStatus)) {
        showStatus(lastActionStatus.message, lastActionStatus.type);
      }
    } catch (error) {
      console.error("Failed to refresh the dashboard:", error);
      showStatus("Could not load your tab context right now.", "error");
    }
  }

  async function refreshContextOnly() {
    try {
      const currentContext = await getCurrentContext();
      renderOverview(currentContext, state.sessions.length);
    } catch (error) {
      console.error("Failed to refresh tab context:", error);
    }
  }

  function renderOverview(context, sessionCount) {
    elements.currentFocusTitle.textContent = context.focusLabel;
    elements.currentFocusMeta.textContent = context.focusMeta;
    elements.currentFocusSummary.textContent = context.focusSummary;
    elements.openTabCount.textContent = String(context.totalTabs);
    elements.sessionCount.textContent = String(sessionCount);
    elements.sessionCountPill.textContent = `${sessionCount} total`;
  }

  function renderSessions(sessions) {
    elements.sessionsList.innerHTML = "";
    elements.emptyState.hidden = sessions.length > 0;

    for (const session of sessions) {
      elements.sessionsList.appendChild(createSessionCard(session));
    }
  }

  function renderRestoreState(sessions) {
    elements.restoreLastButton.disabled = sessions.length === 0;
  }

  function createSessionCard(session) {
    const card = document.createElement("article");
    card.className = "session-card";

    const top = document.createElement("div");
    top.className = "session-top";

    const titleBlock = document.createElement("div");

    const title = document.createElement("h3");
    title.className = "session-title";
    title.textContent = session.name;

    const date = document.createElement("p");
    date.className = "session-date";
    date.textContent = formatSessionDate(session.createdAt);

    titleBlock.append(title, date);

    const sourcePill = document.createElement("span");
    sourcePill.className = `source-pill ${session.source}`;
    sourcePill.textContent = session.source === "auto" ? "Auto" : "Manual";

    top.append(titleBlock, sourcePill);

    const summary = document.createElement("p");
    summary.className = "session-summary";
    summary.textContent = `${session.tabCount} tab${session.tabCount === 1 ? "" : "s"} | ${formatCategorySummary(session.categoryBreakdown)}`;

    const breakdown = document.createElement("div");
    breakdown.className = "breakdown-list";

    getBreakdownEntries(session.categoryBreakdown).forEach(([category, count]) => {
      const pill = document.createElement("span");
      pill.className = `pill ${slugifyCategory(category)}`;
      pill.textContent = `${category}: ${count}`;
      breakdown.appendChild(pill);
    });

    const previewList = document.createElement("ul");
    previewList.className = "tab-preview-list";

    session.tabs.slice(0, 3).forEach((tab) => {
      const previewItem = document.createElement("li");
      previewItem.textContent = tab.title || tab.url || "Untitled tab";
      previewList.appendChild(previewItem);
    });

    if (session.tabs.length > 3) {
      const extra = document.createElement("li");
      const moreCount = session.tabs.length - 3;
      extra.textContent = `+${moreCount} more tab${moreCount === 1 ? "" : "s"}`;
      previewList.appendChild(extra);
    }

    const footer = document.createElement("div");
    footer.className = "session-footer";

    const actions = document.createElement("div");
    actions.className = "session-actions";

    const restoreButton = document.createElement("button");
    restoreButton.className = "primary-button";
    restoreButton.type = "button";
    restoreButton.dataset.action = "restore";
    restoreButton.dataset.sessionId = session.id;
    restoreButton.textContent = "Restore";

    const deleteButton = document.createElement("button");
    deleteButton.className = "secondary-button";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.sessionId = session.id;
    deleteButton.textContent = "Delete";

    actions.append(restoreButton, deleteButton);
    footer.append(actions);

    card.append(top, summary, breakdown, previewList, footer);
    return card;
  }

  async function handleSaveSession() {
    await runButtonAction(elements.saveSessionButton, "Saving...", async () => {
      const session = await saveWindowSession({
        customName: elements.sessionNameInput.value.trim()
      });
      const message = `Saved "${session.name}" with ${session.tabCount} tab${session.tabCount === 1 ? "" : "s"}.`;

      elements.sessionNameInput.value = "";
      await setLastActionStatus(message, "success");
      showStatus(message, "success");
      await refreshAll();
    });
  }

  async function handleGroupTabs() {
    await runButtonAction(elements.groupTabsButton, "Grouping...", async () => {
      const result = await groupTabsForScope();
      const message = buildGroupingMessage(result);
      const statusType = result.groupedTabCount > 0 ? "success" : "info";

      await setLastActionStatus(message, statusType);
      showStatus(message, statusType);
      await refreshContextOnly();
    });
  }

  async function handleRestoreLast() {
    await runButtonAction(elements.restoreLastButton, "Restoring...", async () => {
      const result = await restoreLatestSession();
      const message = buildRestoreMessage(result);

      await setLastActionStatus(message, "success");
      showStatus(message, "success");
      await refreshContextOnly();
    });
  }

  async function handleOpenSidePanel() {
    try {
      if (!chrome.sidePanel?.open) {
        showStatus(
          "This version of Chrome does not support side panel opening.",
          "error"
        );
        return;
      }

      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!activeTab?.windowId) {
        showStatus(
          "Could not find the current Chrome window for the side panel.",
          "error"
        );
        return;
      }

      await chrome.sidePanel.open({
        windowId: activeTab.windowId
      });

      window.close();
    } catch (error) {
      console.error("Failed to open the side panel:", error);
      showStatus("Chrome could not open the side panel right now.", "error");
    }
  }

  async function handleSessionAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) {
      return;
    }

    const { action, sessionId } = button.dataset;

    if (!sessionId) {
      return;
    }

    if (action === "restore") {
      await runButtonAction(button, "Restoring...", async () => {
        const result = await restoreSessionById(sessionId);
        const message = buildRestoreMessage(result);

        await setLastActionStatus(message, "success");
        showStatus(message, "success");
        await refreshContextOnly();
      });
    }

    if (action === "delete") {
      const session = state.sessions.find((item) => item.id === sessionId);
      const confirmed = window.confirm(
        `Delete "${session?.name || "this session"}"?`
      );

      if (!confirmed) {
        return;
      }

      await runButtonAction(button, "Deleting...", async () => {
        const deletedSession = await deleteSession(sessionId);
        const message = `Deleted "${deletedSession.name}".`;

        await setLastActionStatus(message, "info");
        showStatus(message, "info");
        await refreshAll();
      });
    }
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local") {
      return;
    }

    if (changes.savedSessions || changes.lastActionStatus) {
      void refreshAll();
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(state.refreshTimerId);
    state.refreshTimerId = window.setTimeout(() => {
      void refreshContextOnly();
    }, REFRESH_DEBOUNCE_MS);
  }

  function showStatus(message, type = "info") {
    window.clearTimeout(state.statusTimerId);
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message is-visible ${type}`;

    state.statusTimerId = window.setTimeout(() => {
      elements.statusMessage.textContent = "";
      elements.statusMessage.className = "status-message";
    }, STATUS_AUTO_CLEAR_MS);
  }
}

function getElements() {
  return {
    currentFocusTitle: document.getElementById("currentFocusTitle"),
    currentFocusMeta: document.getElementById("currentFocusMeta"),
    currentFocusSummary: document.getElementById("currentFocusSummary"),
    openTabCount: document.getElementById("openTabCount"),
    sessionCount: document.getElementById("sessionCount"),
    sessionCountPill: document.getElementById("sessionCountPill"),
    sessionNameInput: document.getElementById("sessionName"),
    saveSessionButton: document.getElementById("saveSessionButton"),
    groupTabsButton: document.getElementById("groupTabsButton"),
    restoreLastButton: document.getElementById("restoreLastButton"),
    openSidePanelButton: document.getElementById("openSidePanelButton"),
    statusMessage: document.getElementById("statusMessage"),
    emptyState: document.getElementById("emptyState"),
    sessionsList: document.getElementById("sessionsList")
  };
}

async function runButtonAction(button, loadingLabel, task) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = loadingLabel;

  try {
    await task();
  } catch (error) {
    console.error("Action failed:", error);
    const statusMessage = document.getElementById("statusMessage");

    statusMessage.textContent =
      error instanceof Error
        ? error.message
        : "Something went wrong while processing that action.";
    statusMessage.className = "status-message is-visible error";
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function buildGroupingMessage(result) {
  if (!result.groupedTabCount) {
    if (result.skippedPinnedTabs > 0) {
      return `Pinned tabs cannot be grouped by Chrome. Skipped ${result.skippedPinnedTabs} pinned tab${result.skippedPinnedTabs === 1 ? "" : "s"}.`;
    }

    return "No tabs were available to group in this window.";
  }

  const groupedPart = `Grouped ${result.groupedTabCount} tab${result.groupedTabCount === 1 ? "" : "s"} into ${result.groupedCategories.length} context group${result.groupedCategories.length === 1 ? "" : "s"}.`;

  if (result.skippedPinnedTabs > 0) {
    return `${groupedPart} Skipped ${result.skippedPinnedTabs} pinned tab${result.skippedPinnedTabs === 1 ? "" : "s"}.`;
  }

  return groupedPart;
}

function buildRestoreMessage(result) {
  const restoredPart = `Restored ${result.restoredCount} tab${result.restoredCount === 1 ? "" : "s"} from "${result.session.name}".`;

  if (result.skippedCount > 0) {
    return `${restoredPart} Skipped ${result.skippedCount} unsupported browser tab${result.skippedCount === 1 ? "" : "s"}.`;
  }

  return restoredPart;
}

function slugifyCategory(category) {
  return category
    .toLowerCase()
    .replaceAll(" / ", "-")
    .replaceAll(" ", "-");
}
