/**
 * CSS color parsing and WCAG relative luminance.
 *
 * The previous implementation lived inline in contrast-rule.js and understood only
 * `#hex` and `rgb(...)`. Anything else — including the `rgba(...)` that Chromium
 * returns for any color with alpha, and for the default transparent background —
 * fell through to `return 0`, i.e. pure black. Combined with a background helper
 * that defaulted to white, unparsed text read as black-on-white, or 21:1: a perfect
 * score. The bug therefore *hid* contrast failures, and every historical finding
 * count produced by this tool is biased low.
 *
 * Two rules follow from that:
 *   1. Unparseable input returns null. It never degrades to a number, because a
 *      wrong number is indistinguishable from a real measurement downstream.
 *   2. Alpha is composited against a real backdrop rather than ignored.
 */

// The CSS named colors that realistically appear in computed styles, plus the
// keywords Chromium emits. Chromium normally normalizes names to rgb()/rgba(),
// but authored stylesheets and some CDP paths still surface them.
const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  silver: { r: 192, g: 192, b: 192, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  maroon: { r: 128, g: 0, b: 0, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  purple: { r: 128, g: 0, b: 128, a: 1 },
  fuchsia: { r: 255, g: 0, b: 255, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  lime: { r: 0, g: 255, b: 0, a: 1 },
  olive: { r: 128, g: 128, b: 0, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  navy: { r: 0, g: 0, b: 128, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  teal: { r: 0, g: 128, b: 128, a: 1 },
  aqua: { r: 0, g: 255, b: 255, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  orange: { r: 255, g: 165, b: 0, a: 1 },
  pink: { r: 255, g: 192, b: 203, a: 1 },
  brown: { r: 165, g: 42, b: 42, a: 1 },
  gold: { r: 255, g: 215, b: 0, a: 1 },
  indigo: { r: 75, g: 0, b: 130, a: 1 },
  violet: { r: 238, g: 130, b: 238, a: 1 },
  beige: { r: 245, g: 245, b: 220, a: 1 },
  ivory: { r: 255, g: 255, b: 240, a: 1 },
  khaki: { r: 240, g: 230, b: 140, a: 1 },
  salmon: { r: 250, g: 128, b: 114, a: 1 },
  crimson: { r: 220, g: 20, b: 60, a: 1 },
  coral: { r: 255, g: 127, b: 80, a: 1 },
  turquoise: { r: 64, g: 224, b: 208, a: 1 },
  tan: { r: 210, g: 180, b: 140, a: 1 },
  plum: { r: 221, g: 160, b: 221, a: 1 },
  orchid: { r: 218, g: 112, b: 214, a: 1 },
  lavender: { r: 230, g: 230, b: 250, a: 1 },
  whitesmoke: { r: 245, g: 245, b: 245, a: 1 },
  gainsboro: { r: 220, g: 220, b: 220, a: 1 },
  slategray: { r: 112, g: 128, b: 144, a: 1 },
  slategrey: { r: 112, g: 128, b: 144, a: 1 },
  darkgray: { r: 169, g: 169, b: 169, a: 1 },
  darkgrey: { r: 169, g: 169, b: 169, a: 1 },
  lightgray: { r: 211, g: 211, b: 211, a: 1 },
  lightgrey: { r: 211, g: 211, b: 211, a: 1 },
  dimgray: { r: 105, g: 105, b: 105, a: 1 },
  dimgrey: { r: 105, g: 105, b: 105, a: 1 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Parse an alpha component, which may be a number or a percentage. */
function parseAlpha(raw) {
  if (raw === undefined || raw === null || raw === '') return 1;
  const text = String(raw).trim();
  if (text.endsWith('%')) {
    const pct = parseFloat(text.slice(0, -1));
    return Number.isFinite(pct) ? clamp(pct / 100, 0, 1) : null;
  }
  const num = parseFloat(text);
  return Number.isFinite(num) ? clamp(num, 0, 1) : null;
}

/** Parse an r/g/b channel, which may be 0-255 or a percentage. */
function parseChannel(raw) {
  const text = String(raw).trim();
  if (text.endsWith('%')) {
    const pct = parseFloat(text.slice(0, -1));
    return Number.isFinite(pct) ? clamp(Math.round(pct * 255 / 100), 0, 255) : null;
  }
  const num = parseFloat(text);
  return Number.isFinite(num) ? clamp(Math.round(num), 0, 255) : null;
}

/** Convert HSL to RGB. h in degrees, s and l in 0..1. */
function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toChannel = (t) => {
    let temp = t;
    if (temp < 0) temp += 1;
    if (temp > 1) temp -= 1;
    if (temp < 1 / 6) return p + (q - p) * 6 * temp;
    if (temp < 1 / 2) return q;
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
    return p;
  };
  return {
    r: Math.round(toChannel(hue + 1 / 3) * 255),
    g: Math.round(toChannel(hue) * 255),
    b: Math.round(toChannel(hue - 1 / 3) * 255),
  };
}

/**
 * Parse a CSS color string.
 *
 * @param {string} input
 * @returns {{r:number,g:number,b:number,a:number}|null} null when unparseable —
 *   callers must treat null as "unknown", never as a color.
 */
function parseColor(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (!value) return null;

  if (Object.hasOwn(NAMED_COLORS, value)) {
    return { ...NAMED_COLORS[value] };
  }

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    const expand = (c) => parseInt(c + c, 16);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]), g: expand(hex[1]), b: expand(hex[2]),
        a: hex.length === 4 ? expand(hex[3]) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  // rgb()/rgba(), both comma and space separated (`rgb(0 0 0 / 50%)`).
  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgbMatch) {
    const parts = rgbMatch[1].replace(/\//g, ' / ').split(/[\s,]+/).filter(Boolean);
    const slash = parts.indexOf('/');
    const channels = slash === -1 ? parts.slice(0, 3) : parts.slice(0, slash);
    const alphaRaw = slash === -1 ? parts[3] : parts[slash + 1];
    if (channels.length < 3) return null;
    const r = parseChannel(channels[0]);
    const g = parseChannel(channels[1]);
    const b = parseChannel(channels[2]);
    const a = parseAlpha(alphaRaw);
    if (r === null || g === null || b === null || a === null) return null;
    return { r, g, b, a };
  }

  const hslMatch = /^hsla?\(([^)]+)\)$/.exec(value);
  if (hslMatch) {
    const parts = hslMatch[1].replace(/\//g, ' / ').split(/[\s,]+/).filter(Boolean);
    const slash = parts.indexOf('/');
    const core = slash === -1 ? parts.slice(0, 3) : parts.slice(0, slash);
    const alphaRaw = slash === -1 ? parts[3] : parts[slash + 1];
    if (core.length < 3) return null;
    const h = parseFloat(core[0]);
    const s = parseFloat(core[1]) / 100;
    const l = parseFloat(core[2]) / 100;
    const a = parseAlpha(alphaRaw);
    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l) || a === null) {
      return null;
    }
    return { ...hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1)), a };
  }

  return null;
}

/**
 * Composite a possibly-transparent color over an opaque backdrop.
 * @returns {{r:number,g:number,b:number,a:number}} an opaque color
 */
function compositeOver(fg, bg) {
  const alpha = fg.a;
  if (alpha >= 1) return { ...fg, a: 1 };
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    a: 1,
  };
}

/**
 * WCAG 2.x relative luminance.
 * @param {{r:number,g:number,b:number}} color
 * @returns {number} 0..1
 */
function relativeLuminance(color) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r)
       + 0.7152 * channel(color.g)
       + 0.0722 * channel(color.b);
}

/**
 * WCAG contrast ratio between two opaque colors.
 * @returns {number} 1..21
 */
function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

module.exports = {
  parseColor,
  compositeOver,
  relativeLuminance,
  contrastRatio,
  NAMED_COLORS,
};
