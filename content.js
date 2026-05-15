(() => {
  const INSTALL_KEY = "__pixelComparePagesContentInstalled__";

  if (globalThis[INSTALL_KEY]) {
    return;
  }

  globalThis[INSTALL_KEY] = true;

  const SOURCE = "pixel-compare-pages";
  const HOST_ID = "__pixel_compare_pages_overlay__";

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

  let overlay = null;
  let state = { ...DEFAULT_STATE };
  let scrollSyncScheduled = false;
  let frameSizeScheduled = false;

  function clampOpacity(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 0.5;
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

  function getStatus() {
    return {
      ok: true,
      visible: Boolean(overlay?.host?.isConnected),
      url: state.url,
      opacity: state.opacity,
      x: state.x,
      y: state.y,
      controlsX: state.controlsX,
      controlsY: state.controlsY,
      frameVisible: state.frameVisible,
      controlsExpanded: state.controlsExpanded
    };
  }

  function persistState(patch = {}) {
    const nextState = normalizeState({
      ...state,
      visible: Boolean(overlay?.host?.isConnected),
      ...patch
    });

    chrome.runtime.sendMessage({
      source: SOURCE,
      action: "saveTabState",
      state: nextState
    }, () => {
      chrome.runtime.lastError;
    });

    chrome.storage.local.set({
      mockupUrl: nextState.url,
      opacity: nextState.opacity
    });
  }

  function updatePosition() {
    if (!overlay) return;

    overlay.frameBox.style.transform = `translate(${state.x}px, ${state.y}px)`;
    syncFrameToScroll();
  }

  function getScrollableDocumentHeight() {
    const { body, documentElement } = document;

    return Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      documentElement?.clientHeight || 0,
      documentElement?.scrollHeight || 0,
      documentElement?.offsetHeight || 0,
      window.innerHeight || 0
    );
  }

  function updateFrameSize() {
    if (!overlay) return;

    overlay.frameBox.style.height = `${getScrollableDocumentHeight()}px`;
    syncFrameToScroll();
  }

  function requestFrameSizeUpdate() {
    if (frameSizeScheduled) return;

    frameSizeScheduled = true;
    requestAnimationFrame(() => {
      frameSizeScheduled = false;
      updateFrameSize();
    });
  }

  function syncFrameToScroll() {
    if (!overlay) return;

    overlay.iframe.style.transform = `translateY(${-window.scrollY}px)`;
  }

  function requestScrollSync() {
    if (scrollSyncScheduled) return;

    scrollSyncScheduled = true;
    requestAnimationFrame(() => {
      scrollSyncScheduled = false;
      syncFrameToScroll();
    });
  }

  function updateControlsPosition() {
    if (!overlay) return;

    overlay.panel.style.transform = `translate(${state.controlsX}px, ${state.controlsY}px)`;
  }

  function updateOpacity() {
    if (!overlay) return;

    overlay.iframe.style.opacity = String(state.opacity);
    updateControls();
  }

  function updateFrameVisibility() {
    if (!overlay) return;

    overlay.iframe.style.display = state.frameVisible ? "block" : "none";
    overlay.iframe.setAttribute("aria-hidden", String(!state.frameVisible));
    updateControls();
  }

  function updateControls() {
    if (!overlay) return;

    const opacityPercent = Math.round(state.opacity * 100);

    overlay.opacityInput.value = String(opacityPercent);
    overlay.opacityValue.textContent = `${opacityPercent}%`;
    overlay.frameButton.textContent = state.frameVisible ? "Hide" : "Show";
    overlay.frameButton.title = state.frameVisible ? "Hide iframe" : "Show iframe";
    overlay.frameButton.setAttribute("aria-pressed", String(!state.frameVisible));
    overlay.moreButton.textContent = state.controlsExpanded ? "Less" : "More";
    overlay.moreButton.title = state.controlsExpanded ? "Hide advanced controls" : "Show advanced controls";
    overlay.moreButton.setAttribute("aria-expanded", String(state.controlsExpanded));
    overlay.advancedPanel.hidden = !state.controlsExpanded;
  }

  function removeOverlay() {
    window.removeEventListener("scroll", requestScrollSync);
    window.removeEventListener("resize", requestFrameSizeUpdate);
    overlay?.resizeObserver?.disconnect();
    overlay?.host.remove();
    document.getElementById(HOST_ID)?.remove();
    overlay = null;
  }

  function createOverlay() {
    removeOverlay();

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "pointer-events: none",
      "width: 100vw",
      "height: 100vh"
    ].join(";");

    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
      }

      .frame-box {
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        min-height: 100vh;
        pointer-events: none;
        will-change: transform;
      }

      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: transparent;
        pointer-events: none;
        will-change: transform;
      }

      .panel {
        position: absolute;
        bottom: 12px;
        left: 12px;
        display: grid;
        gap: 8px;
        width: min(220px, calc(100vw - 24px));
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 6px;
        padding: 8px;
        color: #fff;
        background: rgba(18, 18, 18, 0.88);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
        font: 12px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
        user-select: none;
      }

      .drag-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 24px;
        cursor: grab;
      }

      .drag-bar.is-dragging {
        cursor: grabbing;
      }

      .title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 650;
      }

      .drag-text {
        flex: 0 0 auto;
        color: rgba(255, 255, 255, 0.64);
        font-size: 11px;
      }

      .label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: rgba(255, 255, 255, 0.74);
      }

      .field {
        display: grid;
        gap: 4px;
      }

      input[type="range"] {
        width: 100%;
        margin: 0;
        accent-color: #19c2ff;
      }

      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
      }

      .advanced {
        display: grid;
        gap: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        padding-top: 8px;
      }

      .advanced[hidden] {
        display: none;
      }

      button,
      .frame-handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        height: 28px;
        border: 0;
        border-radius: 4px;
        padding: 0 5px;
        color: #fff;
        background: rgba(255, 255, 255, 0.16);
        font: 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-weight: 650;
        cursor: pointer;
        user-select: none;
      }

      .frame-handle {
        cursor: grab;
      }

      .frame-handle.is-dragging {
        cursor: grabbing;
      }

      button:hover,
      .frame-handle:hover {
        background: rgba(255, 255, 255, 0.24);
      }
    `;

    const frameBox = document.createElement("div");
    frameBox.className = "frame-box";

    const iframe = document.createElement("iframe");
    iframe.title = "Pixel comparison overlay";
    iframe.setAttribute("aria-hidden", "true");

    const panel = document.createElement("div");
    panel.className = "panel";

    const dragBar = document.createElement("div");
    dragBar.className = "drag-bar";
    dragBar.title = "Drag overlay controls";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = "Controls";

    const dragText = document.createElement("span");
    dragText.className = "drag-text";
    dragText.textContent = "Drag controls";

    const opacityField = document.createElement("label");
    opacityField.className = "field";

    const opacityLabel = document.createElement("span");
    opacityLabel.className = "label-row";
    opacityLabel.textContent = "Opacity";

    const opacityValue = document.createElement("output");

    const opacityInput = document.createElement("input");
    opacityInput.type = "range";
    opacityInput.min = "0";
    opacityInput.max = "100";
    opacityInput.step = "1";

    const frameButton = document.createElement("button");
    frameButton.type = "button";

    const frameHandle = document.createElement("div");
    frameHandle.className = "frame-handle";
    frameHandle.title = "Drag iframe";
    frameHandle.textContent = "Move";

    const moreButton = document.createElement("button");
    moreButton.type = "button";

    const actions = document.createElement("div");
    actions.className = "actions";

    const advancedPanel = document.createElement("div");
    advancedPanel.className = "advanced";

    dragBar.append(title, dragText);
    opacityLabel.append(opacityValue);
    opacityField.append(opacityLabel, opacityInput);
    actions.append(frameButton, frameHandle, moreButton);
    advancedPanel.append(opacityField);
    panel.append(dragBar, actions, advancedPanel);
    frameBox.append(iframe);
    shadow.append(style, frameBox, panel);
    document.documentElement.append(host);

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(requestFrameSizeUpdate)
      : null;

    if (resizeObserver) {
      resizeObserver.observe(document.documentElement);
      if (document.body) {
        resizeObserver.observe(document.body);
      }
    }

    overlay = {
      host,
      frameBox,
      iframe,
      frameHandle,
      panel,
      dragBar,
      opacityInput,
      opacityValue,
      frameButton,
      moreButton,
      advancedPanel,
      resizeObserver
    };
    updateControls();

    let frameDrag = null;
    let controlsDrag = null;

    frameHandle.addEventListener("pointerdown", event => {
      frameDrag = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: state.x,
        y: state.y
      };

      frameHandle.classList.add("is-dragging");
      frameHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    frameHandle.addEventListener("pointermove", event => {
      if (!frameDrag || frameDrag.pointerId !== event.pointerId) {
        return;
      }

      state.x = frameDrag.x + event.clientX - frameDrag.clientX;
      state.y = frameDrag.y + event.clientY - frameDrag.clientY;
      updatePosition();
      event.preventDefault();
    });

    const endFrameDrag = event => {
      if (!frameDrag || frameDrag.pointerId !== event.pointerId) {
        return;
      }

      frameDrag = null;
      frameHandle.classList.remove("is-dragging");
      persistState();
    };

    frameHandle.addEventListener("pointerup", endFrameDrag);
    frameHandle.addEventListener("pointercancel", endFrameDrag);

    dragBar.addEventListener("pointerdown", event => {
      controlsDrag = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: state.controlsX,
        y: state.controlsY
      };

      dragBar.classList.add("is-dragging");
      dragBar.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    dragBar.addEventListener("pointermove", event => {
      if (!controlsDrag || controlsDrag.pointerId !== event.pointerId) {
        return;
      }

      state.controlsX = controlsDrag.x + event.clientX - controlsDrag.clientX;
      state.controlsY = controlsDrag.y + event.clientY - controlsDrag.clientY;
      updateControlsPosition();
      event.preventDefault();
    });

    const endControlsDrag = event => {
      if (!controlsDrag || controlsDrag.pointerId !== event.pointerId) {
        return;
      }

      controlsDrag = null;
      dragBar.classList.remove("is-dragging");
      persistState();
    };

    dragBar.addEventListener("pointerup", endControlsDrag);
    dragBar.addEventListener("pointercancel", endControlsDrag);

    opacityInput.addEventListener("input", () => {
      state.opacity = clampOpacity(Number(opacityInput.value) / 100);
      updateOpacity();
      persistState();
    });

    frameButton.addEventListener("click", event => {
      event.stopPropagation();
      state.frameVisible = !state.frameVisible;
      updateFrameVisibility();
      persistState();
    });

    moreButton.addEventListener("click", event => {
      event.stopPropagation();
      state.controlsExpanded = !state.controlsExpanded;
      updateControls();
      persistState();
    });

    updateControlsPosition();
    updateFrameSize();

    window.addEventListener("scroll", requestScrollSync, { passive: true });
    window.addEventListener("resize", requestFrameSizeUpdate, { passive: true });
  }

  function showOverlay(payload = {}) {
    const { url, opacity } = payload;

    if (!url) {
      throw new Error("Missing mockup URL.");
    }

    state.url = url;
    state.opacity = clampOpacity(opacity);

    if ("x" in payload) {
      state.x = finiteNumber(payload.x, state.x);
    }

    if ("y" in payload) {
      state.y = finiteNumber(payload.y, state.y);
    }

    if ("controlsX" in payload) {
      state.controlsX = finiteNumber(payload.controlsX, state.controlsX);
    }

    if ("controlsY" in payload) {
      state.controlsY = finiteNumber(payload.controlsY, state.controlsY);
    }

    if ("frameVisible" in payload) {
      state.frameVisible = payload.frameVisible !== false;
    }

    if ("controlsExpanded" in payload) {
      state.controlsExpanded = Boolean(payload.controlsExpanded);
    }

    if (!overlay?.host?.isConnected) {
      createOverlay();
    }

    overlay.iframe.src = state.url;
    updateOpacity();
    updateFrameVisibility();
    updatePosition();
    updateControlsPosition();
    updateFrameSize();
    updateControls();
    persistState({ visible: true });
  }

  function restoreOverlay() {
    chrome.runtime.sendMessage({
      source: SOURCE,
      action: "getTabState"
    }, response => {
      if (chrome.runtime.lastError || !response?.ok) {
        return;
      }

      const savedState = normalizeState(response.state);

      if (!savedState.visible || !savedState.url) {
        return;
      }

      showOverlay(savedState);
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.source !== SOURCE) {
      return false;
    }

    try {
      if (message.action === "show") {
        showOverlay(message);
      }

      if (message.action === "remove") {
        removeOverlay();
      }

      if (message.action === "setOpacity") {
        state.opacity = clampOpacity(message.opacity);
        updateOpacity();
        persistState();
      }

      if (message.action === "resetPosition") {
        state.x = 0;
        state.y = 0;
        state.controlsX = 0;
        state.controlsY = 0;
        updatePosition();
        updateControlsPosition();
        persistState();
      }

      sendResponse(getStatus());
    } catch (error) {
      sendResponse({
        ok: false,
        visible: Boolean(overlay?.host?.isConnected),
        error: error.message
      });
    }

    return false;
  });

  restoreOverlay();
})();
