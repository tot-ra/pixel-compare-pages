const SOURCE = "pixel-compare-pages";

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

const urlInput = document.getElementById("mockupUrl");
const opacityInput = document.getElementById("opacity");
const opacityValue = document.getElementById("opacityValue");
const showButton = document.getElementById("showOverlay");
const removeButton = document.getElementById("removeOverlay");
const resetButton = document.getElementById("resetPosition");
const statusText = document.getElementById("status");

let overlayVisible = false;
let activeTabState = { ...DEFAULT_STATE };

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function setBusy(isBusy) {
  showButton.disabled = isBusy;
  removeButton.disabled = isBusy;
  resetButton.disabled = isBusy;
}

function opacityFromInput() {
  return Number(opacityInput.value) / 100;
}

function updateOpacityLabel() {
  opacityValue.textContent = `${opacityInput.value}%`;
}

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

function normalizeUrl(value) {
  const text = value.trim();

  if (!text) {
    throw new Error("Enter a mockup page URL.");
  }

  if (/^(https?:|file:|data:|blob:)/i.test(text)) {
    return text;
  }

  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(text)) {
    return `http://${text}`;
  }

  return `https://${text}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  return tab;
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  const response = await sendToTab(tab.id, message);

  return { tab, response };
}

async function sendToTab(tabId, message) {
  await ensureContentScript(tabId);

  return chrome.tabs.sendMessage(tabId, {
    source: SOURCE,
    ...message
  });
}

async function getTabState(tabId) {
  const response = await chrome.runtime.sendMessage({
    source: SOURCE,
    action: "getTabState",
    tabId
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not read saved state.");
  }

  return normalizeState(response.state);
}

async function saveTabState(tabId, state) {
  const response = await chrome.runtime.sendMessage({
    source: SOURCE,
    action: "saveTabState",
    tabId,
    state
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not save state.");
  }

  activeTabState = normalizeState(response.state);
  return activeTabState;
}

function stateFromOverlayResponse(response, fallback = activeTabState) {
  if (!response?.ok) {
    throw new Error(response?.error || "Overlay command failed.");
  }

  return normalizeState({
    ...fallback,
    visible: response.visible,
    url: response.url,
    opacity: response.opacity,
    x: response.x,
    y: response.y,
    controlsX: response.controlsX,
    controlsY: response.controlsY,
    frameVisible: response.frameVisible,
    controlsExpanded: response.controlsExpanded
  });
}

function applyStatus(state) {
  activeTabState = normalizeState(state);
  overlayVisible = activeTabState.visible;
  showButton.textContent = overlayVisible ? "Update overlay" : "Show overlay";
}

async function showOverlay() {
  setBusy(true);

  try {
    const tab = await getActiveTab();
    const url = normalizeUrl(urlInput.value);
    const opacity = opacityFromInput();

    await chrome.storage.local.set({ mockupUrl: url, opacity });
    urlInput.value = url;

    const response = await sendToTab(tab.id, {
      action: "show",
      url,
      opacity,
      x: activeTabState.x,
      y: activeTabState.y,
      controlsX: activeTabState.controlsX,
      controlsY: activeTabState.controlsY,
      frameVisible: true,
      controlsExpanded: activeTabState.controlsExpanded
    });
    const nextState = stateFromOverlayResponse(response, {
      ...activeTabState,
      visible: true,
      url,
      opacity
    });

    await saveTabState(tab.id, nextState);
    applyStatus(nextState);
    setStatus("Overlay visible.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function removeOverlay() {
  setBusy(true);

  try {
    const { tab, response } = await sendToActiveTab({ action: "remove" });
    const nextState = stateFromOverlayResponse(response, {
      ...activeTabState,
      visible: false
    });

    await saveTabState(tab.id, nextState);
    applyStatus(nextState);
    setStatus("Overlay removed.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function resetPosition() {
  setBusy(true);

  try {
    const { tab, response } = await sendToActiveTab({ action: "resetPosition" });
    const nextState = stateFromOverlayResponse(response, {
      ...activeTabState,
      x: 0,
      y: 0,
      controlsX: 0,
      controlsY: 0
    });

    await saveTabState(tab.id, nextState);
    applyStatus(nextState);
    setStatus(nextState.visible ? "Position reset." : "No overlay on this tab.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function syncOpacityToOverlay() {
  updateOpacityLabel();
  await chrome.storage.local.set({ opacity: opacityFromInput() });

  if (!overlayVisible) {
    activeTabState.opacity = opacityFromInput();
    return;
  }

  try {
    const { tab, response } = await sendToActiveTab({
      action: "setOpacity",
      opacity: opacityFromInput()
    });
    const nextState = stateFromOverlayResponse(response, {
      ...activeTabState,
      opacity: opacityFromInput()
    });

    await saveTabState(tab.id, nextState);
    applyStatus(nextState);
  } catch {
    overlayVisible = false;
    showButton.textContent = "Show overlay";
  }
}

async function initialize() {
  updateOpacityLabel();

  const saved = await chrome.storage.local.get({
    mockupUrl: "",
    opacity: 0.5
  });

  urlInput.value = saved.mockupUrl;
  opacityInput.value = Math.round(saved.opacity * 100);
  updateOpacityLabel();

  try {
    const tab = await getActiveTab();
    const savedTabState = await getTabState(tab.id);
    const hasSavedTabState = Boolean(savedTabState.visible || savedTabState.url);

    activeTabState = hasSavedTabState
      ? savedTabState
      : normalizeState({ ...savedTabState, opacity: saved.opacity });

    if (hasSavedTabState) {
      if (savedTabState.url) {
        urlInput.value = savedTabState.url;
      }

      opacityInput.value = Math.round(savedTabState.opacity * 100);
      updateOpacityLabel();
    }

    if (savedTabState.visible && savedTabState.url) {
      const response = await sendToTab(tab.id, {
        action: "show",
        ...savedTabState
      });
      const restoredState = stateFromOverlayResponse(response, savedTabState);

      await saveTabState(tab.id, restoredState);
      applyStatus(restoredState);
      setStatus("Overlay is active on this tab.");
      return;
    }

    const response = await sendToTab(tab.id, { action: "status" });
    const currentState = stateFromOverlayResponse(response, savedTabState);

    await saveTabState(tab.id, currentState);
    applyStatus(currentState);
    setStatus(currentState.visible ? "Overlay is active on this tab." : "");
  } catch (error) {
    setStatus(error.message || "Open a regular webpage to use this extension.", true);
  }
}

showButton.addEventListener("click", showOverlay);
removeButton.addEventListener("click", removeOverlay);
resetButton.addEventListener("click", resetPosition);
opacityInput.addEventListener("input", syncOpacityToOverlay);

initialize();
