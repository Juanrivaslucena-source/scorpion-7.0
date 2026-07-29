/*
 * Scorpion builder runtime.
 * Handles palette rendering, drag-and-drop, block toolbars (move/duplicate/
 * delete), inline editing, image replacement, autosave to localStorage, and
 * export/preview of a standalone HTML page.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "scorpion.page.v1";

  const canvas = document.getElementById("canvas");
  const emptyState = document.getElementById("empty-state");
  const paletteList = document.getElementById("palette-list");
  const saveStatus = document.getElementById("save-status");

  // Inject block content CSS into the editor so the canvas renders like export.
  const styleEl = document.createElement("style");
  styleEl.textContent = BLOCK_CSS;
  document.head.appendChild(styleEl);

  let selectedBlock = null;

  /* ---------- Toolbar markup ---------- */
  function toolbarHTML(hasLink) {
    return (
      (hasLink
        ? '<button type="button" data-act="link" title="Set button link">🔗</button>'
        : "") +
      '<button type="button" data-act="up" title="Move up">↑</button>' +
      '<button type="button" data-act="down" title="Move down">↓</button>' +
      '<button type="button" data-act="dup" title="Duplicate">⧉</button>' +
      '<button type="button" data-act="del" title="Delete">✕</button>'
    );
  }

  /* ---------- Palette ---------- */
  BLOCKS.forEach(function (def) {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.setAttribute("draggable", "true");
    item.dataset.type = def.type;
    item.innerHTML =
      '<span class="pi-icon">' + def.icon + "</span><span>" + def.label + "</span>";

    item.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/scorpion-type", def.type);
      e.dataTransfer.effectAllowed = "copy";
    });
    // Click to append (accessibility / convenience).
    item.addEventListener("click", function () {
      addBlock(def.type, null);
      commit();
    });
    paletteList.appendChild(item);
  });

  /* ---------- Block creation ---------- */
  function createBlockEl(type) {
    const def = BLOCK_MAP[type];
    if (!def) return null;

    const wrap = document.createElement("div");
    wrap.className = "block";
    wrap.dataset.type = type;
    wrap.innerHTML = def.template();

    // Toolbar (link action only shown for blocks that contain a button)
    const toolbar = document.createElement("div");
    toolbar.className = "block-toolbar";
    toolbar.contentEditable = "false";
    toolbar.innerHTML = toolbarHTML(!!wrap.querySelector(".sb-btn"));
    wrap.appendChild(toolbar);

    wrap.addEventListener("click", function (e) {
      // Image replacement on click.
      if (e.target && e.target.matches("[data-img]")) {
        replaceImage(e.target);
      }
      selectBlock(wrap);
    });

    // Persist edits.
    wrap.addEventListener("input", persist);
    wrap.addEventListener("blur", persist, true);

    return wrap;
  }

  function addBlock(type, beforeEl) {
    const el = createBlockEl(type);
    if (!el) return null;
    if (beforeEl) {
      canvas.insertBefore(el, beforeEl);
    } else {
      canvas.appendChild(el);
    }
    updateEmptyState();
    selectBlock(el);
    return el;
  }

  /* ---------- Selection & toolbar actions ---------- */
  function selectBlock(el) {
    if (selectedBlock && selectedBlock !== el) {
      selectedBlock.classList.remove("selected");
    }
    selectedBlock = el;
    el.classList.add("selected");
  }

  canvas.addEventListener("click", function (e) {
    const btn = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn) return;
    const block = btn.closest(".block");
    if (!block) return;
    e.stopPropagation();
    const act = btn.dataset.act;

    if (act === "link") {
      const linkBtn = block.querySelector(".sb-btn");
      if (linkBtn) {
        const url = window.prompt(
          "Button link URL:",
          linkBtn.getAttribute("href") || ""
        );
        if (url !== null) {
          const t = url.trim();
          linkBtn.setAttribute("href", t || "#");
        }
      }
    } else if (act === "del") {
      block.remove();
      if (selectedBlock === block) selectedBlock = null;
    } else if (act === "dup") {
      const clone = block.cloneNode(true);
      wireBlock(clone);
      block.parentNode.insertBefore(clone, block.nextSibling);
      selectBlock(clone);
    } else if (act === "up") {
      const prev = block.previousElementSibling;
      if (prev && prev.classList.contains("block")) {
        canvas.insertBefore(block, prev);
      }
    } else if (act === "down") {
      const next = block.nextElementSibling;
      if (next && next.classList.contains("block")) {
        canvas.insertBefore(next, block);
      }
    }
    updateEmptyState();
    commit();
  });

  // Re-attach listeners to a block created via cloneNode or deserialization.
  function wireBlock(wrap) {
    wrap.addEventListener("click", function (e) {
      if (e.target && e.target.matches("[data-img]")) {
        replaceImage(e.target);
      }
      selectBlock(wrap);
    });
    wrap.addEventListener("input", persist);
    wrap.addEventListener("blur", persist, true);
  }

  /* ---------- Image replacement ---------- */
  function replaceImage(img) {
    const url = window.prompt("Image URL:", img.getAttribute("src") || "");
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed) img.setAttribute("src", trimmed);
    commit();
  }

  /* ---------- Drag & drop onto canvas ---------- */
  function getDragAfterElement(y) {
    const blocks = Array.prototype.slice.call(
      canvas.querySelectorAll(".block")
    );
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    blocks.forEach(function (child) {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = { offset: offset, element: child };
      }
    });
    return closest.element;
  }

  canvas.addEventListener("dragover", function (e) {
    if (!hasScorpionType(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    canvas.classList.add("drag-over");
  });

  canvas.addEventListener("dragleave", function (e) {
    if (e.target === canvas) canvas.classList.remove("drag-over");
  });

  canvas.addEventListener("drop", function (e) {
    const type = e.dataTransfer.getData("text/scorpion-type");
    if (!type) return;
    e.preventDefault();
    canvas.classList.remove("drag-over");
    const after = getDragAfterElement(e.clientY);
    addBlock(type, after);
    commit();
  });

  function hasScorpionType(e) {
    const types = e.dataTransfer && e.dataTransfer.types;
    if (!types) return false;
    return Array.prototype.indexOf.call(types, "text/scorpion-type") !== -1;
  }

  /* ---------- Empty state ---------- */
  function updateEmptyState() {
    const hasBlocks = canvas.querySelector(".block") !== null;
    emptyState.style.display = hasBlocks ? "none" : "flex";
  }

  /* ---------- Serialization ---------- */
  // Produce clean page HTML (no editor chrome) from the current canvas.
  function serializePage() {
    const clone = canvas.cloneNode(true);
    // Remove editor-only nodes.
    const es = clone.querySelector("#empty-state");
    if (es) es.remove();
    clone.querySelectorAll(".block-toolbar").forEach(function (t) {
      t.remove();
    });
    clone.querySelectorAll("[contenteditable]").forEach(function (n) {
      n.removeAttribute("contenteditable");
    });
    clone.querySelectorAll(".block").forEach(function (b) {
      b.classList.remove("selected");
    });
    // Return only the inner block markup.
    return clone.innerHTML.trim();
  }

  // Small IntersectionObserver that honors reduced-motion; embedded in export.
  const REVEAL_SCRIPT =
    "<script>\n(function(){var els=document.querySelectorAll('.sb-reveal');" +
    "if(!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches){" +
    "els.forEach(function(e){e.classList.add('is-in');});return;}" +
    "var io=new IntersectionObserver(function(entries){entries.forEach(function(en){" +
    "if(en.isIntersecting){en.target.classList.add('is-in');io.unobserve(en.target);}});}," +
    "{threshold:0.12});els.forEach(function(e){io.observe(e);});})();\n<\/script>";

  function buildDocument() {
    // Start from the persisted-style serialization, then produce clean,
    // unwrapped semantic markup: drop editor data-* markers, remove the
    // .block wrappers, and add a scroll-reveal class to each section.
    const tmp = document.createElement("div");
    tmp.innerHTML = serializePage();
    ["data-field", "data-href", "data-img"].forEach(function (attr) {
      tmp.querySelectorAll("[" + attr + "]").forEach(function (n) {
        n.removeAttribute(attr);
      });
    });

    const parts = [];
    Array.prototype.forEach.call(tmp.children, function (block) {
      Array.prototype.forEach.call(block.children, function (node) {
        node.classList.add("sb-reveal");
        parts.push(node.outerHTML);
      });
    });
    const body = parts.join("\n");

    return (
      "<!DOCTYPE html>\n" +
      '<html lang="en">\n<head>\n<meta charset="UTF-8" />\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
      "<title>My Scorpion Site</title>\n<style>\n" +
      "body{margin:0;}\n" +
      BLOCK_CSS +
      "\n</style>\n</head>\n<body>\n" +
      body +
      "\n" +
      REVEAL_SCRIPT +
      "\n</body>\n</html>\n"
    );
  }

  /* ---------- Persistence & history (undo/redo) ---------- */
  const undoBtn = document.getElementById("btn-undo");
  const redoBtn = document.getElementById("btn-redo");
  let saveTimer = null;
  let isRestoring = false; // guards history capture during undo/redo/restore
  const history = [];
  let histIndex = -1;
  const HISTORY_CAP = 80;

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, serializePage());
      saveStatus.textContent = "Saved";
    } catch (err) {
      saveStatus.textContent = "Save failed";
    }
  }

  function snapshot() {
    if (isRestoring) return;
    const html = serializePage();
    if (history[histIndex] === html) return; // no real change
    history.splice(histIndex + 1); // drop any redo tail
    history.push(html);
    if (history.length > HISTORY_CAP) history.shift();
    histIndex = history.length - 1;
    updateHistoryButtons();
  }

  // Immediate commit — structural actions (add/dup/move/delete/link/image).
  function commit() {
    saveNow();
    snapshot();
  }

  // Debounced commit — text typing (one history entry per idle pause).
  function persist() {
    saveStatus.textContent = "Saving…";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(commit, 350);
  }

  function updateHistoryButtons() {
    if (undoBtn) undoBtn.disabled = histIndex <= 0;
    if (redoBtn) redoBtn.disabled = histIndex >= history.length - 1;
  }

  // Rebuild interactive canvas blocks from serialized HTML.
  function rebuildFromHTML(html) {
    isRestoring = true;
    canvas.querySelectorAll(".block").forEach(function (b) {
      b.remove();
    });
    selectedBlock = null;
    const temp = document.createElement("div");
    temp.innerHTML = html || "";
    temp.querySelectorAll(".block").forEach(function (savedBlock) {
      const type = savedBlock.dataset.type;
      const el = createBlockEl(type);
      if (!el) return;
      el.innerHTML = savedBlock.innerHTML;
      restoreToolbar(el);
      el.querySelectorAll("[data-field]").forEach(function (f) {
        f.setAttribute("contenteditable", "true");
      });
      canvas.appendChild(el);
    });
    updateEmptyState();
    isRestoring = false;
  }

  function undo() {
    if (histIndex <= 0) return;
    histIndex--;
    rebuildFromHTML(history[histIndex]);
    saveNow();
    updateHistoryButtons();
  }

  function redo() {
    if (histIndex >= history.length - 1) return;
    histIndex++;
    rebuildFromHTML(history[histIndex]);
    saveNow();
    updateHistoryButtons();
  }

  function restore() {
    let html = null;
    try {
      html = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      html = null;
    }
    if (html) rebuildFromHTML(html);
    else updateEmptyState();
    // Seed history with the initial state so the first edit is undoable.
    history.length = 0;
    history.push(serializePage());
    histIndex = 0;
    updateHistoryButtons();
  }

  function restoreToolbar(wrap) {
    // Saved markup has toolbar stripped (serialize removes it). Re-add one.
    let toolbar = wrap.querySelector(".block-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "block-toolbar";
      toolbar.contentEditable = "false";
      toolbar.innerHTML = toolbarHTML(!!wrap.querySelector(".sb-btn"));
      wrap.appendChild(toolbar);
    }
  }

  /* ---------- Top bar actions ---------- */
  document.getElementById("btn-export").addEventListener("click", function () {
    const doc = buildDocument();
    const blob = new Blob([doc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scorpion-site.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  });

  const previewModal = document.getElementById("preview-modal");
  const previewFrame = document.getElementById("preview-frame");

  document.getElementById("btn-preview").addEventListener("click", function () {
    previewFrame.srcdoc = buildDocument();
    previewModal.hidden = false;
  });
  document
    .getElementById("btn-close-preview")
    .addEventListener("click", function () {
      previewModal.hidden = true;
      previewFrame.srcdoc = "";
    });
  previewModal.addEventListener("click", function (e) {
    if (e.target === previewModal) {
      previewModal.hidden = true;
      previewFrame.srcdoc = "";
    }
  });

  document.getElementById("btn-clear").addEventListener("click", function () {
    if (!window.confirm("Clear the whole page? You can undo this.")) return;
    canvas.querySelectorAll(".block").forEach(function (b) {
      b.remove();
    });
    selectedBlock = null;
    updateEmptyState();
    commit();
  });

  // Keyboard: Delete removes the selected block when not editing text.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const active = document.activeElement;
    const editing =
      active && active.getAttribute && active.hasAttribute("contenteditable");
    if (editing) return;
    if (selectedBlock) {
      e.preventDefault();
      selectedBlock.remove();
      selectedBlock = null;
      updateEmptyState();
      commit();
    }
  });

  /* ---------- Undo / redo wiring ---------- */
  if (undoBtn) undoBtn.addEventListener("click", undo);
  if (redoBtn) redoBtn.addEventListener("click", redo);

  document.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === "z") {
      // Inside a text field, let the browser's native text undo win.
      const active = document.activeElement;
      if (active && active.hasAttribute && active.hasAttribute("contenteditable")) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (key === "y") {
      e.preventDefault();
      redo();
    }
  });

  /* ---------- Boot ---------- */
  restore();
})();
