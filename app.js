const MAX_CARDS = 40;
const DB_NAME = "pip-kanpe-tool";
const DB_VERSION = 1;
const IMAGE_STORE = "images";
const SETTINGS_KEY = "pip-kanpe-settings";
const fileNameCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

const state = {
  db: null,
  cards: [],
  currentIndex: 0,
  objectUrls: new Map(),
  pipWindow: null,
  settings: {
    fitMode: "contain",
    pipSize: "640x360",
    pipControlsSize: "medium",
    pipControlsPosition: "bottom",
    pipControlsSeparateFromImage: true,
    showFileExtension: false,
    optimizeImages: true,
    hideGuideOnLaunch: false,
  },
};

const els = {};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  bindElements();
  bindEvents();
  loadSettings();
  applySettingsToControls();
  updateSupportBadge();

  try {
    state.db = await openDatabase();
    state.cards = await loadCards();
    normalizeCurrentIndex();
    render();
    setStatus("準備完了。画像はこのブラウザ内だけに保存されます。");
  } catch (error) {
    console.error(error);
    setStatus("IndexedDBを開けませんでした。ブラウザ設定を確認してください。", true);
  }
}

function bindElements() {
  const ids = [
    "support-badge",
    "open-guide",
    "open-pip",
    "drop-zone",
    "file-input",
    "pick-files",
    "optimize-images",
    "deck-meta",
    "clear-all",
    "thumb-list",
    "empty-state",
    "preview-stage",
    "preview-image",
    "preview-pip-controls",
    "preview-pip-prev",
    "preview-pip-label",
    "preview-pip-next",
    "fit-mode",
    "pip-size",
    "pip-controls-size-small",
    "pip-controls-size-medium",
    "pip-controls-size-large",
    "pip-controls-position-top",
    "pip-controls-position-bottom",
    "pip-controls-separate",
    "show-file-extension",
    "status-line",
    "guide-modal",
    "close-guide",
    "close-guide-icon",
    "hide-guide-next-time",
  ];

  ids.forEach((id) => {
    els[toCamel(id)] = document.getElementById(id);
  });
}

function bindEvents() {
  els.pickFiles.addEventListener("click", (event) => {
    event.stopPropagation();
    els.fileInput.click();
  });
  els.fileInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  els.dropZone.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("button, input")) {
      return;
    }
    els.fileInput.click();
  });
  els.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.fileInput.click();
    }
  });

  els.fileInput.addEventListener("change", async () => {
    await addFiles(els.fileInput.files);
    els.fileInput.value = "";
  });

  window.addEventListener("message", handleExtensionMessage);

  ["dragenter", "dragover"].forEach((name) => {
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((name) => {
    els.dropZone.addEventListener(name, () => {
      els.dropZone.classList.remove("dragging");
    });
  });

  els.dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    await addFiles(event.dataTransfer.files);
  });

  els.previewPipPrev.addEventListener("click", previousCard);
  els.previewPipNext.addEventListener("click", nextCard);
  els.openPip.addEventListener("click", openPip);
  els.openGuide.addEventListener("click", showGuideModal);
  els.clearAll.addEventListener("click", clearAllCards);
  els.closeGuide.addEventListener("click", closeGuideModal);
  els.closeGuideIcon.addEventListener("click", closeGuideModal);
  els.guideModal.addEventListener("click", (event) => {
    const copyButton = event.target instanceof Element ? event.target.closest("[data-copy-url]") : null;
    if (copyButton instanceof HTMLButtonElement) {
      copyGuideUrl(copyButton);
      return;
    }

    if (event.target === els.guideModal) {
      closeGuideModal();
    }
  });

  els.fitMode.addEventListener("change", () => {
    state.settings.fitMode = els.fitMode.value;
    saveSettings();
    updatePreview();
    updatePip();
  });

  els.pipSize.addEventListener("change", () => {
    state.settings.pipSize = els.pipSize.value;
    saveSettings();
  });

  [els.pipControlsSizeSmall, els.pipControlsSizeMedium, els.pipControlsSizeLarge].forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) {
        return;
      }

      state.settings.pipControlsSize = radio.value;
      saveSettings();
      updatePreview();
      updatePip();
    });
  });

  [els.pipControlsPositionTop, els.pipControlsPositionBottom].forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) {
        return;
      }

      state.settings.pipControlsPosition = radio.value;
      saveSettings();
      updatePreview();
      updatePip();
    });
  });

  els.pipControlsSeparate.addEventListener("change", () => {
    state.settings.pipControlsSeparateFromImage = els.pipControlsSeparate.checked;
    saveSettings();
    updatePreview();
    updatePip();
  });

  els.showFileExtension.addEventListener("change", () => {
    state.settings.showFileExtension = els.showFileExtension.checked;
    saveSettings();
    updatePreview();
    updatePip();
  });

  els.optimizeImages.addEventListener("change", () => {
    state.settings.optimizeImages = els.optimizeImages.checked;
    saveSettings();
  });

  window.addEventListener("keydown", (event) => {
    if (!els.guideModal.hidden && event.key === "Escape") {
      closeGuideModal();
      return;
    }

    if (!els.guideModal.hidden) {
      return;
    }

    if (event.target instanceof Element && event.target.matches("input, select, button, textarea")) {
      return;
    }

    if (event.key === "ArrowLeft") {
      previousCard();
    }
    if (event.key === "ArrowRight") {
      nextCard();
    }
  });

  window.addEventListener("beforeunload", revokeAllObjectUrls);
}

function showGuideModal() {
  els.hideGuideNextTime.checked = state.settings.hideGuideOnLaunch;
  els.guideModal.hidden = false;
  document.body.classList.add("modal-open");
  els.closeGuide.focus();
}

function closeGuideModal() {
  state.settings.hideGuideOnLaunch = els.hideGuideNextTime.checked;
  saveSettings();
  els.guideModal.hidden = true;
  document.body.classList.remove("modal-open");
  els.openGuide.focus();
}

async function copyGuideUrl(button) {
  const url = button.dataset.copyUrl;
  if (!url) {
    return;
  }

  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = "コピー済み";
    setStatus(`${url} をコピーしました。Chromeのアドレスバーに貼り付けて開いてください。`);
  } catch (error) {
    console.error(error);
    button.textContent = "コピー失敗";
    setStatus("コピーできませんでした。表示されているURLをChromeのアドレスバーに入力してください。", true);
  }

  window.setTimeout(() => {
    button.textContent = originalText;
  }, 1600);
}

function handleExtensionMessage(event) {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  const data = event.data;
  if (!data || data.source !== "pip-kanpe-hotkeys" || data.type !== "command") {
    return;
  }

  if (data.command === "next") {
    nextCard();
    setStatus("拡張機能ショートカット: 次のカンペへ");
  }

  if (data.command === "previous") {
    previousCard();
    setStatus("拡張機能ショートカット: 前のカンペへ");
  }
}

function updateSupportBadge() {
  const supported = "documentPictureInPicture" in window;
  els.supportBadge.textContent = supported ? "PiP対応" : "PiP非対応";
  els.supportBadge.classList.toggle("ok", supported);
  els.supportBadge.classList.toggle("warn", !supported);
  els.openPip.disabled = !supported;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadCards() {
  return new Promise((resolve, reject) => {
    const store = getImageStore("readonly");
    const request = store.getAll();

    request.onsuccess = () => {
      const cards = request.result
        .map((card, index) => ({ ...card, order: card.order ?? index }))
        .sort((a, b) => a.order - b.order);
      resolve(cards);
    };
    request.onerror = () => reject(request.error);
  });
}

function putCard(card) {
  return new Promise((resolve, reject) => {
    const store = getImageStore("readwrite");
    const request = store.put(card);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteCardFromDb(id) {
  return new Promise((resolve, reject) => {
    const store = getImageStore("readwrite");
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearImageStore() {
  return new Promise((resolve, reject) => {
    const store = getImageStore("readwrite");
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getImageStore(mode) {
  return state.db.transaction(IMAGE_STORE, mode).objectStore(IMAGE_STORE);
}

async function addFiles(fileList) {
  if (!state.db) {
    setStatus("保存領域の準備がまだ終わっていません。", true);
    return;
  }

  const imageFiles = Array.from(fileList)
    .filter((file) => file.type.startsWith("image/"))
    .sort(compareFilesByName);
  if (imageFiles.length === 0) {
    setStatus("画像ファイルを選択してください。", true);
    return;
  }

  const remaining = MAX_CARDS - state.cards.length;
  if (remaining <= 0) {
    setStatus(`登録できる画像は最大${MAX_CARDS}枚です。`, true);
    return;
  }

  const accepted = imageFiles.slice(0, remaining);
  if (accepted.length < imageFiles.length) {
    setStatus(`上限のため${accepted.length}枚だけ追加します。`, true);
  } else {
    setStatus(`${accepted.length}枚をファイル名順で追加中...`);
  }

  const baseOrder = state.cards.length > 0 ? Math.max(...state.cards.map((card) => card.order)) + 1 : 0;

  for (const [index, file] of accepted.entries()) {
    try {
      const storedBlob = state.settings.optimizeImages ? await optimizeImage(file) : file;
      const card = {
        id: crypto.randomUUID(),
        name: file.name,
        type: storedBlob.type || file.type,
        size: storedBlob.size,
        originalSize: file.size,
        order: baseOrder + index,
        createdAt: Date.now(),
        blob: storedBlob,
      };

      await putCard(card);
      state.cards.push(card);
    } catch (error) {
      console.error(error);
      setStatus(`${file.name} の追加に失敗しました。`, true);
    }
  }

  state.currentIndex = Math.max(0, state.cards.length - accepted.length);
  render();
  setStatus(`${accepted.length}枚追加しました。`);
}

function compareFilesByName(a, b) {
  const byName = fileNameCollator.compare(a.name, b.name);
  if (byName !== 0) {
    return byName;
  }
  return a.lastModified - b.lastModified;
}

function optimizeImage(file) {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);

      const maxEdge = 2048;
      const sourceWidth = image.naturalWidth;
      const sourceHeight = image.naturalHeight;
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));

      if (scale === 1 && file.size < 1_200_000) {
        resolve(file);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));

      const context = canvas.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size > file.size) {
            resolve(file);
            return;
          }
          resolve(blob);
        },
        "image/webp",
        0.92,
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    image.src = url;
  });
}

function render() {
  normalizeCurrentIndex();
  renderDeckMeta();
  renderThumbList();
  updatePreview();
  updateControls();
  updatePip();
}

function renderDeckMeta() {
  const totalSize = state.cards.reduce((sum, card) => sum + (card.size || 0), 0);
  els.deckMeta.textContent = `${state.cards.length} / ${MAX_CARDS} · ${formatBytes(totalSize)}`;
}

function renderThumbList() {
  els.thumbList.textContent = "";

  if (state.cards.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-line";
    empty.textContent = "まだ画像がありません。";
    els.thumbList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  state.cards.forEach((card, index) => {
    const item = document.createElement("article");
    item.className = `thumb-item${index === state.currentIndex ? " active" : ""}`;

    const image = document.createElement("img");
    image.src = getObjectUrl(card);
    image.alt = "";

    const body = document.createElement("div");
    const name = document.createElement("div");
    name.className = "thumb-name";
    name.textContent = card.name;

    const sub = document.createElement("div");
    sub.className = "thumb-sub";
    sub.textContent = `${index + 1}枚目 · ${formatBytes(card.size || 0)}`;

    body.append(name, sub);

    const actions = document.createElement("div");
    actions.className = "thumb-actions";
    actions.append(
      makeMiniButton("選", "この画像を表示", () => selectCard(index)),
      makeMiniButton("×", "削除", () => removeCard(index), "danger"),
      makeMiniButton("↑", "前へ移動", () => moveCard(index, -1), "", index === 0),
      makeMiniButton("↓", "後ろへ移動", () => moveCard(index, 1), "", index === state.cards.length - 1),
    );

    item.append(image, body, actions);
    fragment.append(item);
  });

  els.thumbList.append(fragment);
}

function makeMiniButton(label, title, onClick, extraClass = "", disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `mini-button ${extraClass}`.trim();
  button.textContent = label;
  button.title = title;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function updatePreview() {
  const card = getCurrentCard();
  const hasCards = Boolean(card);

  els.emptyState.style.display = hasCards ? "none" : "block";
  els.previewImage.style.display = hasCards ? "block" : "none";
  els.previewImage.classList.toggle("cover", state.settings.fitMode === "cover");
  els.previewStage.classList.toggle("separate", state.settings.pipControlsSeparateFromImage);
  els.previewPipControls.style.display = hasCards ? "grid" : "none";
  applyPipControlClasses(els.previewPipControls, state.settings);

  if (hasCards) {
    els.previewImage.src = getObjectUrl(card);
    els.previewImage.alt = card.name;
    els.previewPipLabel.textContent = formatPipLabel(card);
    els.previewPipPrev.disabled = state.cards.length <= 1;
    els.previewPipNext.disabled = state.cards.length <= 1;
  } else {
    els.previewImage.removeAttribute("src");
    els.previewImage.alt = "";
    els.previewPipLabel.textContent = "";
    els.previewPipPrev.disabled = true;
    els.previewPipNext.disabled = true;
  }
}

function updateControls() {
  const hasCards = state.cards.length > 0;

  els.openPip.disabled = !hasCards || !("documentPictureInPicture" in window);
  els.clearAll.disabled = !hasCards;
}

async function openPip() {
  if (!("documentPictureInPicture" in window)) {
    setStatus("このブラウザはDocument Picture-in-Pictureに対応していません。", true);
    return;
  }

  if (!getCurrentCard()) {
    setStatus("PiPで表示する画像を登録してください。", true);
    return;
  }

  try {
    const [width, height] = state.settings.pipSize.split("x").map(Number);
    state.pipWindow = await window.documentPictureInPicture.requestWindow({
      width,
      height,
      disallowReturnToOpener: true,
      preferInitialWindowPlacement: true,
    });

    buildPipDocument();
    updatePip();
    setStatus("PiPを開きました。FF14は仮想フルスクリーンまたはウィンドウモードで表示できます。");
  } catch (error) {
    console.error(error);
    setStatus("PiPを開けませんでした。ボタン操作からもう一度試してください。", true);
  }
}

function buildPipDocument() {
  const pip = state.pipWindow;
  if (!pip || pip.closed) {
    return;
  }

  pip.document.title = "PiP カンペ";
  pip.document.body.className = "pip-body";

  const style = pip.document.createElement("style");
  style.textContent = getPipCss();

  const shell = pip.document.createElement("main");
  shell.className = "pip-shell";
  shell.id = "pip-shell";

  const image = pip.document.createElement("img");
  image.id = "pip-image";
  image.alt = "";

  const controls = pip.document.createElement("div");
  controls.className = "pip-controls";
  controls.id = "pip-controls";

  const prev = pip.document.createElement("button");
  prev.id = "pip-prev";
  prev.className = "pip-button";
  prev.type = "button";
  prev.textContent = "←";
  prev.title = "前の画像";

  const label = pip.document.createElement("div");
  label.id = "pip-label";
  label.className = "pip-label";

  const next = pip.document.createElement("button");
  next.id = "pip-next";
  next.className = "pip-button";
  next.type = "button";
  next.textContent = "→";
  next.title = "次の画像";

  controls.append(prev, label, next);
  shell.append(image, controls);
  pip.document.head.replaceChildren(style);
  pip.document.body.replaceChildren(shell);

  prev.addEventListener("click", previousCard);
  next.addEventListener("click", nextCard);
  pip.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      previousCard();
    }
    if (event.key === "ArrowRight") {
      nextCard();
    }
  });
  pip.addEventListener("pagehide", () => {
    state.pipWindow = null;
  });
}

function getPipCss() {
  const cssRules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.cssText.includes("pip-") || rule.cssText.includes("body.pip-body")) {
          cssRules.push(rule.cssText);
        }
      }
    } catch (error) {
      console.warn("PiP CSS copy skipped", error);
    }
  }
  return cssRules.join("\n");
}

function updatePip() {
  const pip = state.pipWindow;
  if (!pip || pip.closed) {
    return;
  }

  const image = pip.document.getElementById("pip-image");
  const shell = pip.document.getElementById("pip-shell");
  const label = pip.document.getElementById("pip-label");
  const prev = pip.document.getElementById("pip-prev");
  const next = pip.document.getElementById("pip-next");
  const controls = pip.document.getElementById("pip-controls");
  const card = getCurrentCard();

  if (!image || !label || !prev || !next || !controls || !shell || !card) {
    return;
  }

  image.src = getObjectUrl(card);
  image.alt = card.name;
  image.classList.toggle("cover", state.settings.fitMode === "cover");
  shell.classList.toggle("separate", state.settings.pipControlsSeparateFromImage);
  applyPipControlClasses(controls, state.settings);
  label.textContent = formatPipLabel(card);
  prev.disabled = state.cards.length <= 1;
  next.disabled = state.cards.length <= 1;
}

function applyPipControlClasses(element, settings) {
  element.classList.remove("small", "medium", "large", "top", "bottom", "separate");
  element.classList.add(settings.pipControlsSize, settings.pipControlsPosition);
  if (settings.pipControlsSeparateFromImage) {
    element.classList.add("separate");
  }
}

function formatPipLabel(card) {
  const name = state.settings.showFileExtension ? card.name : stripFileExtension(card.name);
  return `${state.currentIndex + 1} / ${state.cards.length}　${name}`;
}

function stripFileExtension(name) {
  return name.replace(/\.[^.]+$/, "");
}

function selectCard(index) {
  state.currentIndex = index;
  render();
}

function previousCard() {
  if (state.cards.length <= 1) {
    return;
  }
  state.currentIndex = (state.currentIndex - 1 + state.cards.length) % state.cards.length;
  render();
}

function nextCard() {
  if (state.cards.length <= 1) {
    return;
  }
  state.currentIndex = (state.currentIndex + 1) % state.cards.length;
  render();
}

async function removeCard(index) {
  const card = state.cards[index];
  if (!card) {
    return;
  }

  await deleteCardFromDb(card.id);
  revokeObjectUrl(card.id);
  state.cards.splice(index, 1);
  normalizeCurrentIndex();
  await persistOrder();
  render();
  setStatus("画像を削除しました。");
}

async function moveCard(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.cards.length) {
    return;
  }

  const [card] = state.cards.splice(index, 1);
  state.cards.splice(targetIndex, 0, card);

  if (state.currentIndex === index) {
    state.currentIndex = targetIndex;
  } else if (state.currentIndex === targetIndex) {
    state.currentIndex = index;
  }

  await persistOrder();
  render();
}

async function persistOrder() {
  const updates = state.cards.map((card, index) => {
    card.order = index;
    return putCard(card);
  });
  await Promise.all(updates);
}

async function clearAllCards() {
  if (state.cards.length === 0) {
    return;
  }

  const ok = confirm("登録画像をすべて削除します。よろしいですか？");
  if (!ok) {
    return;
  }

  await clearImageStore();
  revokeAllObjectUrls();
  state.cards = [];
  state.currentIndex = 0;
  render();
  setStatus("すべて削除しました。");
}

function normalizeCurrentIndex() {
  if (state.cards.length === 0) {
    state.currentIndex = 0;
    return;
  }
  state.currentIndex = Math.min(Math.max(state.currentIndex, 0), state.cards.length - 1);
}

function getCurrentCard() {
  return state.cards[state.currentIndex] || null;
}

function getObjectUrl(card) {
  if (!state.objectUrls.has(card.id)) {
    state.objectUrls.set(card.id, URL.createObjectURL(card.blob));
  }
  return state.objectUrls.get(card.id);
}

function revokeObjectUrl(id) {
  const url = state.objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    state.objectUrls.delete(id);
  }
}

function revokeAllObjectUrls() {
  for (const url of state.objectUrls.values()) {
    URL.revokeObjectURL(url);
  }
  state.objectUrls.clear();
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      state.settings = { ...state.settings, ...JSON.parse(raw) };
    }
  } catch (error) {
    console.warn("Settings load failed", error);
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function applySettingsToControls() {
  els.fitMode.value = state.settings.fitMode;
  els.pipSize.value = state.settings.pipSize;
  els.pipControlsSizeSmall.checked = state.settings.pipControlsSize === "small";
  els.pipControlsSizeMedium.checked = state.settings.pipControlsSize === "medium";
  els.pipControlsSizeLarge.checked = state.settings.pipControlsSize === "large";
  els.pipControlsPositionTop.checked = state.settings.pipControlsPosition === "top";
  els.pipControlsPositionBottom.checked = state.settings.pipControlsPosition !== "top";
  els.pipControlsSeparate.checked = state.settings.pipControlsSeparateFromImage;
  els.showFileExtension.checked = state.settings.showFileExtension;
  els.optimizeImages.checked = state.settings.optimizeImages;
  els.hideGuideNextTime.checked = state.settings.hideGuideOnLaunch;

  const guideForced = new URLSearchParams(window.location.search).get("guide") === "1";
  if (guideForced || !state.settings.hideGuideOnLaunch) {
    requestAnimationFrame(showGuideModal);
  }
}

function setStatus(message, isError = false) {
  els.statusLine.textContent = message;
  els.statusLine.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
