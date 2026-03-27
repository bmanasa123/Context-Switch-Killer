import {
  AUTO_SAVE_ALARM,
  createAutoSaveSession,
  ensureStorageState,
  groupTabsForScope,
  saveWindowSession,
  setLastActionStatus
} from "./shared.js";

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_SAVE_ALARM) {
    void handleAutoSave();
  }
});

chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command);
});

void initializeExtension();

async function initializeExtension() {
  try {
    await ensureStorageState();
    await ensureAutoSaveAlarm();
    await configureSidePanel();
  } catch (error) {
    console.error("Failed to initialize Context Switch Killer:", error);
  }
}

async function ensureAutoSaveAlarm() {
  const existingAlarm = await chrome.alarms.get(AUTO_SAVE_ALARM);

  if (!existingAlarm) {
    await chrome.alarms.create(AUTO_SAVE_ALARM, {
      periodInMinutes: 5
    });
  }
}

async function configureSidePanel() {
  if (!chrome.sidePanel?.setOptions) {
    return;
  }

  await chrome.sidePanel.setOptions({
    enabled: true,
    path: "sidepanel.html"
  });
}

async function handleAutoSave() {
  try {
    await createAutoSaveSession();
  } catch (error) {
    console.error("Auto-save failed:", error);
  }
}

async function handleCommand(command) {
  try {
    if (command === "save-current-session") {
      const session = await saveWindowSession({
        scope: "lastFocusedWindow"
      });

      await setLastActionStatus(
        `Saved "${session.name}" from the keyboard shortcut.`,
        "success"
      );
      return;
    }

    if (command === "group-current-tabs") {
      const result = await groupTabsForScope("lastFocusedWindow");
      const message = buildGroupingMessage(result);

      await setLastActionStatus(
        message,
        result.groupedTabCount > 0 ? "success" : "info"
      );
    }
  } catch (error) {
    console.error("Command failed:", error);
    await setLastActionStatus(
      error instanceof Error
        ? error.message
        : "Something went wrong while handling the shortcut.",
      "error"
    );
  }
}

function buildGroupingMessage(result) {
  if (!result.groupedTabCount) {
    if (result.skippedPinnedTabs > 0) {
      return `Pinned tabs cannot be grouped by Chrome. Skipped ${result.skippedPinnedTabs} pinned tab${result.skippedPinnedTabs === 1 ? "" : "s"}.`;
    }

    return "No tabs were available to group in the active window.";
  }

  const groupCount = result.groupedCategories.length;
  const groupedPart = `Grouped ${result.groupedTabCount} tab${result.groupedTabCount === 1 ? "" : "s"} into ${groupCount} context group${groupCount === 1 ? "" : "s"}.`;

  if (result.skippedPinnedTabs > 0) {
    return `${groupedPart} Skipped ${result.skippedPinnedTabs} pinned tab${result.skippedPinnedTabs === 1 ? "" : "s"}.`;
  }

  return groupedPart;
}
