(() => {
  "use strict";

  const SOURCE_LANGUAGE = "de";
  const TARGET_LANGUAGE = "en";

  const MAX_TEXT_LENGTH = 3000;

  let translatorPromise = null;
  let popupHost = null;
  let popupAbortController = null;
  let selectionTimer = null;
  let currentRequestId = 0;

  // ------------------------------------------------------------
  // Selection handling
  // ------------------------------------------------------------

  document.addEventListener("mouseup", () => {
    queueSelectionCheck();
  });

  document.addEventListener("keyup", (event) => {
    // Allows keyboard-based text selection, such as Shift + Arrow.
    if (
      event.key === "Shift" ||
      event.shiftKey ||
      event.key.startsWith("Arrow")
    ) {
      queueSelectionCheck();
    }
  });

  function queueSelectionCheck() {
    clearTimeout(selectionTimer);

    selectionTimer = setTimeout(() => {
      handleSelection();
    }, 30);
  }

  async function handleSelection() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const selectedText = selection.toString().trim();

    if (!selectedText) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return;
    }

    const requestId = ++currentRequestId;

    if (selectedText.length > MAX_TEXT_LENGTH) {
      showPopup(
        rect,
        "Selection too long",
        `Please select fewer than ${MAX_TEXT_LENGTH} characters.`,
        true,
      );

      return;
    }

    showPopup(rect, "German → English", "Translating…", false);

    try {
      const translator = await getTranslator((percent) => {
        if (requestId !== currentRequestId) {
          return;
        }

        updatePopupMessage(`Preparing translator… ${Math.round(percent)}%`);
      });

      const translatedText = await translator.translate(selectedText);

      // Ignore results from an older selection.
      if (requestId !== currentRequestId) {
        return;
      }

      showPopup(rect, "German → English", translatedText, false);
    } catch (error) {
      console.error("[German Highlight Translator] Translation failed:", error);

      if (requestId !== currentRequestId) {
        return;
      }

      showPopup(rect, "Translation unavailable", getFriendlyError(error), true);
    }
  }

  // ------------------------------------------------------------
  // Chrome Translator API
  // ------------------------------------------------------------

  async function getTranslator(onDownloadProgress) {
    if (translatorPromise) {
      return translatorPromise;
    }

    translatorPromise = createTranslator(onDownloadProgress);

    try {
      return await translatorPromise;
    } catch (error) {
      // Allow another attempt later if creation fails.
      translatorPromise = null;
      throw error;
    }
  }

  async function createTranslator(onDownloadProgress) {
    if (!("Translator" in globalThis)) {
      throw new Error("TRANSLATOR_NOT_SUPPORTED");
    }

    const availability = await Translator.availability({
      sourceLanguage: SOURCE_LANGUAGE,
      targetLanguage: TARGET_LANGUAGE,
    });

    if (availability === "unavailable") {
      throw new Error("LANGUAGE_PAIR_UNAVAILABLE");
    }

    return await Translator.create({
      sourceLanguage: SOURCE_LANGUAGE,
      targetLanguage: TARGET_LANGUAGE,

      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          if (typeof onDownloadProgress === "function") {
            onDownloadProgress(event.loaded * 100);
          }
        });
      },
    });
  }

  function getFriendlyError(error) {
    const message = error?.message || "";

    if (message.includes("TRANSLATOR_NOT_SUPPORTED")) {
      return (
        "Your version of Chrome does not support the built-in " +
        "Translator API. Chrome 138 or newer is required."
      );
    }

    if (message.includes("LANGUAGE_PAIR_UNAVAILABLE")) {
      return (
        "German to English translation is currently unavailable " +
        "in this Chrome installation."
      );
    }

    return "The text could not be translated. Try selecting it again.";
  }

  // ------------------------------------------------------------
  // Popup UI
  // ------------------------------------------------------------

  function showPopup(rect, title, message, isError) {
    closePopup();

    const host = document.createElement("div");

    popupHost = host;

    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.zIndex = "2147483647";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.border = "0";
    host.style.background = "transparent";

    const shadow = host.attachShadow({
      mode: "open",
    });

    const style = document.createElement("style");

    style.textContent = `
      :host {
        all: initial;
      }

      .translator-card {
        box-sizing: border-box;
        width: 340px;
        max-width: calc(100vw - 24px);

        padding: 14px 16px 16px;

        background: #ffffff;
        color: #202124;

        border: 1px solid rgba(60, 64, 67, 0.18);
        border-radius: 10px;

        box-shadow:
          0 4px 8px rgba(60, 64, 67, 0.18),
          0 8px 24px rgba(60, 64, 67, 0.12);

        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          Roboto,
          Arial,
          sans-serif;

        font-size: 14px;
        line-height: 1.5;
      }

      .translator-header {
        display: flex;
        align-items: center;
        justify-content: space-between;

        margin-bottom: 9px;
      }

      .translator-title {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;

        color: #5f6368;
      }

      .translator-close {
        display: flex;
        align-items: center;
        justify-content: center;

        width: 26px;
        height: 26px;

        margin: -5px -7px -5px 8px;
        padding: 0;

        border: none;
        border-radius: 50%;

        background: transparent;
        color: #5f6368;

        font-family: Arial, sans-serif;
        font-size: 20px;
        line-height: 1;

        cursor: pointer;
      }

      .translator-close:hover {
        background: #f1f3f4;
        color: #202124;
      }

      .translator-message {
        white-space: pre-wrap;
        overflow-wrap: anywhere;

        font-size: 15px;
        color: #202124;
      }

      .translator-message.error {
        color: #b3261e;
      }
    `;

    const card = document.createElement("div");
    card.className = "translator-card";

    const header = document.createElement("div");
    header.className = "translator-header";

    const titleElement = document.createElement("div");
    titleElement.className = "translator-title";
    titleElement.textContent = title;

    const closeButton = document.createElement("button");
    closeButton.className = "translator-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close translation");
    closeButton.textContent = "×";

    const messageElement = document.createElement("div");

    messageElement.className = "translator-message" + (isError ? " error" : "");

    // textContent prevents selected webpage content from injecting HTML.
    messageElement.textContent = message;

    closeButton.addEventListener("mousedown", (event) => {
      // Prevent this interaction from triggering our page selection handler.
      event.stopPropagation();
    });

    closeButton.addEventListener("mouseup", (event) => {
      event.stopPropagation();
    });

    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      clearTextSelection();
      closePopup();
    });

    header.appendChild(titleElement);
    header.appendChild(closeButton);

    card.appendChild(header);
    card.appendChild(messageElement);

    shadow.appendChild(style);
    shadow.appendChild(card);

    document.documentElement.appendChild(host);

    positionPopup(host, rect);

    installPopupDismissHandlers(host);
  }

  function updatePopupMessage(message) {
    if (!popupHost || !popupHost.shadowRoot) {
      return;
    }

    const messageElement = popupHost.shadowRoot.querySelector(
      ".translator-message",
    );

    if (messageElement) {
      messageElement.textContent = message;
    }
  }

  function clearTextSelection() {
    const selection = window.getSelection();

    if (selection) {
      selection.removeAllRanges();
    }
  }

  function positionPopup(host, selectionRect) {
    const GAP = 8;
    const EDGE_PADDING = 12;

    let left = selectionRect.left;
    let top = selectionRect.bottom + GAP;

    host.style.left = `${left}px`;
    host.style.top = `${top}px`;

    // Measure after the popup exists in the DOM.
    const popupRect = host.getBoundingClientRect();

    // Keep popup from leaving the right edge.
    if (popupRect.right > window.innerWidth - EDGE_PADDING) {
      left = window.innerWidth - popupRect.width - EDGE_PADDING;
    }

    // Keep popup from leaving the left edge.
    if (left < EDGE_PADDING) {
      left = EDGE_PADDING;
    }

    // If there isn't enough space underneath the selection,
    // place the popup above it.
    if (popupRect.bottom > window.innerHeight - EDGE_PADDING) {
      top = selectionRect.top - popupRect.height - GAP;
    }

    if (top < EDGE_PADDING) {
      top = EDGE_PADDING;
    }

    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
  }

  function installPopupDismissHandlers(host) {
    popupAbortController = new AbortController();

    const signal = popupAbortController.signal;

    document.addEventListener(
      "mousedown",
      (event) => {
        const path = event.composedPath();

        if (!path.includes(host)) {
          closePopup();
        }
      },
      {
        capture: true,
        signal,
      },
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          closePopup();
        }
      },
      {
        signal,
      },
    );

    window.addEventListener(
      "scroll",
      () => {
        closePopup();
      },
      {
        capture: true,
        signal,
      },
    );

    window.addEventListener(
      "resize",
      () => {
        closePopup();
      },
      {
        signal,
      },
    );
  }

  function closePopup() {
    if (popupAbortController) {
      popupAbortController.abort();
      popupAbortController = null;
    }

    if (popupHost) {
      popupHost.remove();
      popupHost = null;
    }
  }
})();
