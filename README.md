# Context Switch Killer

Context Switch Killer is a production-style Chrome Extension built with Manifest V3 to help users stay focused, reduce tab chaos, and move between work modes without losing momentum.

It detects what your open tabs are about, groups them into meaningful contexts, saves complete browsing sessions, restores them later, and keeps background auto-saves running every 5 minutes.

## Features

- Smart context detection based on tab URLs
- Automatic tab grouping by category
- Session saving with smart names like `Coding Session` or `Coding + Learning Session`
- One-click session restore
- Session analytics with tab counts and category breakdowns
- Background auto-save every 5 minutes
- Keeps only the latest 10 auto-saved sessions
- Delete saved sessions
- Restore last session quickly
- Keyboard shortcuts for save and grouping
- Optional persistent side panel UI

## Categories

The extension classifies tabs using first-match URL rules:

- `Coding`
- `Learning`
- `Work / Productivity`
- `Shopping`
- `Social / Entertainment`
- `News`
- `General`

## Tech Stack

- Chrome Extension Manifest V3
- Service worker background script
- `chrome.tabs`
- `chrome.tabGroups`
- `chrome.storage.local`
- `chrome.alarms`
- `chrome.sidePanel`
- Vanilla HTML, CSS, and JavaScript

## Project Structure

```text
Context Switch Killer/
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── app.js
├── background.js
├── manifest.json
├── popup.html
├── popup.js
├── shared.js
├── sidepanel.html
├── sidepanel.js
└── styles.css
```

## Installation

No package installation is required.

To run the extension locally:

1. Open Chrome and go to `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder
5. Pin `Context Switch Killer` from the Chrome extensions menu
6. Click the extension icon to open the popup

## How To Use

### Save a session

1. Open the tabs you want to keep
2. Open the extension popup
3. Enter a custom session name or leave it blank
4. Click `Save Session`

If left blank, the extension generates a smart name based on the dominant tab categories.

### Group tabs

1. Open the extension popup
2. Click `Group Tabs`

Tabs will be grouped automatically by category using Chrome tab groups.

### Restore a session

1. Open the extension popup or side panel
2. Find a saved session
3. Click `Restore`

The extension reopens the session tabs and groups them again by category.

### Open the side panel

1. Open the popup
2. Click `Open Side Panel`

This gives you a persistent session manager while browsing.

## Keyboard Shortcuts

- `Ctrl + Shift + S` saves the current session
- `Ctrl + Shift + G` groups the current window tabs

If the shortcuts do not work, check:

- `chrome://extensions/shortcuts`

Chrome may already be using the same shortcut combination.

## Auto-Save Behavior

- Auto-save runs every 5 minutes in the background
- Auto-saved sessions use names like `Auto Session - 3:45 PM`
- Only the latest 10 auto-saved sessions are kept
- Manual sessions are preserved separately

## Example Use Cases

- Save a full coding setup with GitHub, Stack Overflow, docs, and local tooling tabs
- Separate learning tabs from work tabs before they become distracting
- Reopen a full research or shopping session later without rebuilding it manually
- Keep a persistent side panel open while working across multiple contexts

## Manual Testing Checklist

### Smart detection

Open tabs from different sites such as:

- `github.com`
- `stackoverflow.com`
- `medium.com`
- `youtube.com/watch?...tutorial...`
- `amazon.com`
- `docs.google.com`
- `reddit.com`
- `bbc.com`

Then open the extension and verify that the current focus summary updates correctly.

### Group tabs

Click `Group Tabs` and verify:

- tabs are grouped by category
- each group has the correct title
- different categories use different colors

### Save and restore

Save a session, close some tabs, then restore it and verify:

- the tabs reopen
- categories are preserved
- restored tabs are grouped correctly

### Auto-save

Leave Chrome open for at least 5 minutes and verify:

- an auto-saved session appears
- old auto-saves are capped at 10

## Notes

- `chrome://` and some internal browser pages cannot be restored automatically
- Pinned tabs may be skipped during grouping because of Chrome tab behavior
- After making code changes, reload the extension from `chrome://extensions`

## Privacy

This extension stores session data locally using `chrome.storage.local`.

Saved session data includes:

- tab title
- tab URL
- detected category
- session metadata such as creation time and source

No backend, server, or external database is required for the extension to work.
