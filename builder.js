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
      persist();
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

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "block-toolbar";
    toolbar.contentEditable = "false";
    toolbar.innerHTML =
      '<button type="button" data-act="up" title="Move up">↑</button>' +
      '<button type="button" data-act="down" title="Move down">↓</button>' +
      '<button type="button" data-act="dup" title="Duplicate">⧉</button>' +
      '<button type="button" data-act="del" title="Delete">✕</button>';
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

    if (act === "del") {
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
    persist();
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
    persist();
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
    persist();
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

  function buildDocument() {
    const body = serializePage();
    return (
      "<!DOCTYPE html>\n" +
      '<html lang="en">\n<head>\n<meta charset="UTF-8" />\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
      "<title>My Scorpion Site</title>\n<style>\n" +
      "body{margin:0;}\n" +
      BLOCK_CSS +
      "\n</style>\n</head>\n<body>\n" +
      body +
      "\n</body>\n</html>\n"
    );
  }

  /* ---------- Persistence ---------- */
  let saveTimer = null;
  function persist() {
    saveStatus.textContent = "Saving…";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, serializePage());
        saveStatus.textContent = "Saved";
      } catch (err) {
        saveStatus.textContent = "Save failed";
      }
    }, 300);
  }

  function restore() {
    let html;
    try {
      html = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      html = null;
    }
    if (!html) {
      updateEmptyState();
      return;
    }
    // Parse saved block markup and rebuild interactive blocks.
    const temp = document.createElement("div");
    temp.innerHTML = html;
    temp.querySelectorAll(".block").forEach(function (savedBlock) {
      const type = savedBlock.dataset.type;
      const el = createBlockEl(type);
      if (!el) return;
      // Replace fresh template content with the saved content, then re-add
      // the toolbar (createBlockEl already appended one; we rebuild cleanly).
      el.innerHTML = savedBlock.innerHTML;
      restoreToolbar(el);
      // Restore editability on fields.
      el.querySelectorAll("[data-field]").forEach(function (f) {
        f.setAttribute("contenteditable", "true");
      });
      canvas.appendChild(el);
    });
    updateEmptyState();
  }

  function restoreToolbar(wrap) {
    // Saved markup has toolbar stripped (serialize removes it). Re-add one.
    let toolbar = wrap.querySelector(".block-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "block-toolbar";
      toolbar.contentEditable = "false";
      toolbar.innerHTML =
        '<button type="button" data-act="up" title="Move up">↑</button>' +
        '<button type="button" data-act="down" title="Move down">↓</button>' +
        '<button type="button" data-act="dup" title="Duplicate">⧉</button>' +
        '<button type="button" data-act="del" title="Delete">✕</button>';
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
    if (!window.confirm("Clear the whole page? This cannot be undone.")) return;
    canvas.querySelectorAll(".block").forEach(function (b) {
      b.remove();
    });
    selectedBlock = null;
    updateEmptyState();
    persist();
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
      persist();
    }
  });

  /* ---------- Boot ---------- */
  restore();
})();
