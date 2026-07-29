/**
 * scripts/lib/design-rules.js
 * The audit rules, as a single browser-side function.
 *
 * This runs inside the page via Runtime.evaluate, so it must be
 * self-contained — no imports, no closures over Node scope. It returns plain
 * JSON findings that the Node side formats.
 *
 * Every rule here exists because it caught a real defect. The first four were
 * found by eyeballing screenshots; encoding them means they never come back.
 */

const AUDIT_SOURCE = `(() => {
  const findings = [];
  const seen = new Set();

  const add = (f) => {
    // collapse duplicates of the same rule+element
    const key = f.rule + '|' + f.selector;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  const describe = (el) => {
    if (!el || el === document.body) return 'body';
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
      : '';
    return (el.tagName || '').toLowerCase() + id + cls;
  };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const inViewport = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };

  const text = (el) => (el.textContent || '').trim();

  /* -- R1: unsized inline SVG ------------------------------------------------
     The KPI icon bug. An <svg> with no width/height attribute and no CSS
     constraint expands to fill its container. Flags any icon that renders
     far larger than its own font-size implies. */
  document.querySelectorAll('svg').forEach((svg) => {
    if (!visible(svg)) return;
    const r = svg.getBoundingClientRect();
    const parent = svg.parentElement;
    const fontSize = parent ? parseFloat(getComputedStyle(parent).fontSize) || 16 : 16;
    // An inline icon should not exceed ~5x the surrounding text size.
    const limit = Math.max(fontSize * 5, 64);
    if (r.width > limit || r.height > limit) {
      add({
        rule: 'oversized-icon',
        severity: 'error',
        selector: describe(svg),
        parent: describe(parent),
        detail: Math.round(r.width) + 'x' + Math.round(r.height) + 'px rendered, ' +
                'parent font-size ' + Math.round(fontSize) + 'px',
        hint: 'Inline SVG has no width/height and no CSS constraint, so it fills its container.',
      });
    }
  });

  /* -- R2: horizontal overflow ----------------------------------------------
     The clipped Margin column. An element whose scrollWidth exceeds its
     clientWidth is hiding content the user cannot reach.
     Uses one bulk pass and skips leaf nodes, which cannot clip children. */
  const allElements = [...document.querySelectorAll('*')];
  allElements.forEach((el) => {
    if (el.childElementCount === 0) return;
    const overflowX = el.scrollWidth - el.clientWidth;
    if (overflowX <= 2 || el.clientWidth === 0) return;
    if (!visible(el) || !inViewport(el)) return;

    const style = getComputedStyle(el);
    // Deliberate scroll containers are fine; hidden/visible overflow is not.
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') return;

    // scrollWidth counts column-gap and right-edge padding on flex/grid
    // containers even when nothing is actually clipped, so verify against
    // real child geometry before reporting.
    const box = el.getBoundingClientRect();
    const padRight = parseFloat(style.paddingRight) || 0;
    let childMax = 0;
    for (const child of el.children) {
      const cr = child.getBoundingClientRect();
      if (cr.width === 0 && cr.height === 0) continue;
      const cs = getComputedStyle(child);
      // Out-of-flow children (tooltips, popovers) do not clip their parent,
      // and hidden ones are not visible to the user at all.
      if (cs.position === 'absolute' || cs.position === 'fixed') continue;
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      childMax = Math.max(childMax, cr.right);
    }
    if (childMax === 0) return;
    const spill = Math.round(childMax - (box.right - padRight));
    if (spill <= 2) return;

    add({
      rule: 'horizontal-overflow',
      severity: 'error',
      selector: describe(el),
      detail: 'children extend ' + spill + 'px past the content box (scrollWidth ' +
              el.scrollWidth + ' vs clientWidth ' + el.clientWidth + ')',
      hint: 'Content is clipped or forcing a page-level scrollbar.',
    });
  });

  /* -- R3: page-level horizontal scroll -------------------------------------
     Almost always a responsive bug on narrow viewports. */
  if (document.documentElement.scrollWidth > innerWidth + 2) {
    add({
      rule: 'page-horizontal-scroll',
      severity: 'error',
      selector: 'html',
      detail: 'document is ' + document.documentElement.scrollWidth +
              'px wide in a ' + innerWidth + 'px viewport',
      hint: 'Something is wider than the viewport; check min-width on tables and cards.',
    });
  }

  /* -- R4: text collision ---------------------------------------------------
     The login-footer bug: two text nodes whose boxes overlap. Only compares
     siblings, to avoid flagging intentional parent/child nesting. */
  const textish = [...document.querySelectorAll('p, h1, h2, h3, h4, span, div, a, button, label')]
    .filter((el) => text(el).length > 0)
    .filter((el) => ![...el.children].some((c) => text(c).length > 0)) // leaf text only
    .filter((el) => visible(el) && inViewport(el));

  // Cache rects once, then compare only within a shared parent. Comparing
  // every pair globally is O(n^2) and dominated runtime on dense views.
  const rects = new Map();
  textish.forEach((el) => rects.set(el, el.getBoundingClientRect()));

  const byParent = new Map();
  textish.forEach((el) => {
    const p = el.parentElement;
    if (!p) return;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(el);
  });

  byParent.forEach((siblings) => {
    if (siblings.length < 2) return;
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i], b = siblings[j];
        const ra = rects.get(a), rb = rects.get(b);
        const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (overlapX > 2 && overlapY > 2) {
          add({
            rule: 'text-collision',
            severity: 'error',
            selector: describe(a),
            detail: 'overlaps sibling ' + describe(b) + ' by ' +
                    Math.round(overlapX) + 'x' + Math.round(overlapY) + 'px',
            hint: 'Two text elements occupy the same space.',
          });
        }
      }
    }
  });

  /* -- R5: contrast ---------------------------------------------------------
     WCAG AA: 4.5:1 for body text, 3:1 for large text. Only checks text drawn
     over a solid resolvable background. */
  const parseColor = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((n) => parseFloat(n));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // Backgrounds repeat heavily across siblings; memoize per element.
  const bgCache = new Map();
  const backdrop = (el) => {
    let node = el;
    const chain = [];
    while (node && node !== document.documentElement) {
      if (bgCache.has(node)) {
        const hit = bgCache.get(node);
        chain.forEach((n) => bgCache.set(n, hit));
        return hit;
      }
      const bg = parseColor(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.95) {
        chain.forEach((n) => bgCache.set(n, bg));
        bgCache.set(node, bg);
        return bg;
      }
      chain.push(node);
      node = node.parentElement;
    }
    const fallback = { r: 10, g: 10, b: 15, a: 1 }; // --bg
    chain.forEach((n) => bgCache.set(n, fallback));
    return fallback;
  };

  textish.forEach((el) => {
    const style = getComputedStyle(el);
    const fg = parseColor(style.color);
    if (!fg || fg.a < 0.95) return;
    const bg = backdrop(el);
    const l1 = luminance(fg), l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(style.fontSize);
    const bold = parseInt(style.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const required = large ? 3 : 4.5;
    if (ratio < required) {
      // Group by the colour pair, not the element: one failing CSS variable
      // shows up on dozens of nodes but is a single fix.
      const pair = style.color + ' on rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')';
      add({
        rule: 'low-contrast',
        severity: ratio < required - 1 ? 'error' : 'warning',
        selector: describe(el),
        groupKey: pair + ' @' + required,
        detail: ratio.toFixed(2) + ':1 (needs ' + required + ':1) — ' + pair,
        sample: text(el).slice(0, 40),
        hint: 'Fails WCAG AA for this text size.',
      });
    }
  });

  /* -- R6: touch target size ------------------------------------------------
     WCAG 2.5.5 / platform guidance: interactive targets >= 24px, ideally 44. */
  document.querySelectorAll('button, a, input, select, [role="button"]').forEach((el) => {
    if (!visible(el) || !inViewport(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) {
      add({
        rule: 'small-touch-target',
        severity: 'warning',
        selector: describe(el),
        detail: Math.round(r.width) + 'x' + Math.round(r.height) + 'px',
        hint: 'Interactive targets should be at least 24x24px.',
      });
    }
  });

  /* -- R7: accessible names -------------------------------------------------- */
  document.querySelectorAll('button, a[href]').forEach((el) => {
    if (!visible(el)) return;
    const name = text(el) || el.getAttribute('aria-label') || el.getAttribute('title');
    if (!name) {
      add({
        rule: 'missing-accessible-name',
        severity: 'warning',
        selector: describe(el),
        detail: 'no text content, aria-label or title',
        hint: 'Screen readers announce this control as unlabeled.',
      });
    }
  });
  document.querySelectorAll('img').forEach((el) => {
    if (!visible(el)) return;
    if (el.getAttribute('alt') === null) {
      add({
        rule: 'missing-alt',
        severity: 'warning',
        selector: describe(el),
        detail: 'img without an alt attribute',
        hint: 'Add alt="" for decorative images, or a description.',
      });
    }
  });

  /* -- R8: unrendered template artifacts -------------------------------------
     Catches undefined/NaN/[object Object] leaking into visible copy. */
  const bodyText = document.body.innerText || '';
  [['undefined', /\\bundefined\\b/], ['NaN', /\\bNaN\\b/], ['[object Object]', /\\[object Object\\]/]]
    .forEach(([label, re]) => {
      if (!re.test(bodyText)) return;
      const culprit = textish.find((el) => re.test(text(el)));
      add({
        rule: 'template-artifact',
        severity: 'error',
        selector: culprit ? describe(culprit) : 'body',
        detail: 'rendered text contains "' + label + '"',
        sample: culprit ? text(culprit).slice(0, 60) : '',
        hint: 'A value is missing or a template expression did not resolve.',
      });
    });

  /* -- R9: empty interactive surface ------------------------------------------
     A view that renders nothing is usually a silent data failure. */
  const main = document.querySelector('.view.active') || document.querySelector('main');
  if (main && text(main).length < 20) {
    add({
      rule: 'empty-view',
      severity: 'error',
      selector: describe(main),
      detail: 'active view rendered ' + text(main).length + ' characters of text',
      hint: 'View rendered blank — check the data load and render path.',
    });
  }

  return {
    findings,
    stats: {
      elements: document.querySelectorAll('*').length,
      textNodes: textish.length,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    },
  };
})()`;

module.exports = { AUDIT_SOURCE };
