const SOURCE = "pixel-compare-pages";
const TAB_STATES_KEY = "tabStates";

const DEFAULT_STATE = {
  visible: false,
  url: "",
  opacity: 0.5,
  x: 0,
  y: 0,
  controlsX: 0,
  controlsY: 0,
  frameVisible: true,
  controlsExpanded: false
};

function clampOpacity(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_STATE.opacity;
  }

  return Math.min(1, Math.max(0, number));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeState(value = {}) {
  return {
    visible: Boolean(value.visible),
    url: typeof value.url === "string" ? value.url : "",
    opacity: clampOpacity(value.opacity),
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    controlsX: finiteNumber(value.controlsX),
    controlsY: finiteNumber(value.controlsY),
    frameVisible: value.frameVisible !== false,
    controlsExpanded: Boolean(value.controlsExpanded)
  };
}

async function readTabStates() {
  const stored = await chrome.storage.local.get({ [TAB_STATES_KEY]: {} });
  return stored[TAB_STATES_KEY] || {};
}

async function writeTabStates(tabStates) {
  await chrome.storage.local.set({ [TAB_STATES_KEY]: tabStates });
}

async function getTabState(tabId) {
  const tabStates = await readTabStates();
  return normalizeState(tabStates[String(tabId)] || DEFAULT_STATE);
}

async function saveTabState(tabId, patch = {}) {
  const tabStates = await readTabStates();
  const key = String(tabId);
  const previous = normalizeState(tabStates[key] || DEFAULT_STATE);
  const next = normalizeState({ ...previous, ...patch });

  tabStates[key] = next;
  await writeTabStates(tabStates);

  return next;
}

async function deleteTabState(tabId) {
  const tabStates = await readTabStates();
  delete tabStates[String(tabId)];
  await writeTabStates(tabStates);
}

function resolveTabId(message, sender) {
  if (Number.isInteger(message.tabId)) {
    return message.tabId;
  }

  if (Number.isInteger(sender.tab?.id)) {
    return sender.tab.id;
  }

  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== SOURCE) {
    return false;
  }

  const tabId = resolveTabId(message, sender);

  if (tabId === null) {
    sendResponse({ ok: false, error: "No tab id available." });
    return false;
  }

  (async () => {
    if (message.action === "getTabState") {
      const state = await getTabState(tabId);
      sendResponse({ ok: true, state });
      return;
    }

    if (message.action === "saveTabState") {
      const state = await saveTabState(tabId, message.state);
      sendResponse({ ok: true, state });
      return;
    }

    sendResponse({ ok: false, error: `Unknown action: ${message.action}` });
  })().catch(error => {
    sendResponse({ ok: false, error: error.message });
  });

  return true;
});

chrome.tabs.onRemoved.addListener(tabId => {
  deleteTabState(tabId);
});
