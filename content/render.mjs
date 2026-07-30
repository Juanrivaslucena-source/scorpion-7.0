/**
 * Scorpion content engine.
 *
 * Renders vertical 9:16 proof clips from any built site — automatically.
 * Every clip is real footage of a real build: no fabricated results, no stock,
 * no slop. Volume without lowering the bar.
 *
 *   node content/render.mjs [path-to-site.html] [outdir]
 *
 * Default: showcase/lumen.html -> content/out/
 * Produces one .webm per shot, plus captions.txt with the hook copy for each.
 */
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { launchOptions } from "../dropship/lib/browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = process.argv[2] || path.join(ROOT, "showcase/lumen.html");
const OUT = process.argv[3] || path.join(ROOT, "content/out");
const URL = SITE.startsWith("http") ? SITE : "file://" + path.resolve(SITE);

// 9:16 vertical, phone-sized.
const W = 1080, H = 1920, SCALE = 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Playwright records .webm (VP8) and ships a stripped ffmpeg that cannot mux
 * MP4. Instagram/TikTok need H.264 MP4, so we transcode with a full ffmpeg.
 * Returns the ffmpeg path, or null if none is available.
 */
function ffmpeg() {
  const candidates = [
    "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2",
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try {
    return execFileSync("python3", [
      "-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())",
    ]).toString().trim() || null;
  } catch { return null; }
}

function toMp4(ff, webm) {
  const mp4 = webm.replace(/\.webm$/, ".mp4");
  execFileSync(ff, [
    "-y", "-loglevel", "error", "-i", webm,
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
           `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,fps=30`,
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-crf", "20", "-movflags", "+faststart", mp4,
  ]);
  return mp4;
}

/**
 * Shot lists are page-specific: a shot that targets `#ba` is meaningless on a
 * product page. Each shot declares a `needs` selector; shots whose target is
 * absent are skipped rather than silently recording a still frame.
 */
async function has(page, sel) {
  try { return (await page.locator(sel).count()) > 0; } catch { return false; }
}

/** Shots that work on any page — the fallback set for product pages. */
const GENERIC_SHOTS = [ /* generic: used only when no page-specific shot fills the role */
  {
    name: "g1-hero",
    role: "hero",
    hook: "Open on the product, not the pitch.",
    async run(p) { await p.goto(URL); await sleep(1400); await p.mouse.move(540, 900);
      for (let i = 0; i < 18; i++) { await p.mouse.wheel(0, 30); await sleep(48); } await sleep(700); },
  },
  {
    name: "g2-fullscroll",
    role: "scroll",
    hook: "The whole page in ten seconds.",
    async run(p) { await p.goto(URL); await sleep(1200); await p.mouse.move(540, 900);
      for (let i = 0; i < 120; i++) { await p.mouse.wheel(0, 80); await sleep(20); } await sleep(700); },
  },
  {
    name: "g3-cta",
    role: "cta",
    hook: "One clear action.",
    needs: ".btn, [href*='cart'], button",
    async run(p) {
      await p.goto(URL); await sleep(1200);
      const b = await p.locator(".btn, button").first().boundingBox();
      if (b) { await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 }); }
      await sleep(1400);
    },
  },
];

const SHOTS = [
  {
    name: "01-loader",
    role: "loader",
    needs: "#loader",
    hook: "Most small-business sites load like it's 2014.",
    async run(p) { await p.goto(URL); await sleep(4200); },
  },
  {
    name: "02-hero",
    role: "hero",
    needs: "h1",
    hook: "One HTML file. No template. No page builder.",
    async run(p) {
      await p.goto(URL); await sleep(3400);
      await p.mouse.move(540, 900);
      for (let i = 0; i < 26; i++) { await p.mouse.wheel(0, 26); await sleep(46); }
      await sleep(900);
    },
  },
  {
    name: "03-beforeafter",
    role: "feature-ba",
    needs: "#ba",
    hook: "Proof beats promises.",
    async run(p) {
      await p.goto(URL); await sleep(3200);
      await p.locator("#results").scrollIntoViewIfNeeded(); await sleep(1500);
      const b = await p.locator("#ba").boundingBox();
      const y = b.y + b.height / 2;
      await p.mouse.move(b.x + b.width * 0.5, y);
      await p.mouse.down();
      await p.mouse.move(b.x + b.width * 0.14, y, { steps: 34 }); await sleep(420);
      await p.mouse.move(b.x + b.width * 0.88, y, { steps: 40 }); await sleep(420);
      await p.mouse.move(b.x + b.width * 0.5, y, { steps: 26 });
      await p.mouse.up(); await sleep(900);
    },
  },
  {
    name: "04-services",
    role: "feature-svc",
    needs: ".svc-row",
    hook: "Every detail is a decision.",
    async run(p) {
      await p.goto(URL); await sleep(3200);
      await p.locator("#treatments").scrollIntoViewIfNeeded(); await sleep(1300);
      const rows = await p.locator(".svc-row").all();
      for (const r of rows) {
        const b = await r.boundingBox();
        if (!b) continue;
        await p.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 8 });
        await sleep(620);
      }
      await sleep(700);
    },
  },
  {
    name: "05-scroll",
    role: "scroll",
    needs: "body",
    hook: "$300/month. No setup fee.",
    async run(p) {
      await p.goto(URL); await sleep(3200);
      await p.mouse.move(540, 900);
      for (let i = 0; i < 130; i++) { await p.mouse.wheel(0, 78); await sleep(20); }
      await sleep(800);
    },
  },
  {
    name: "06-pricing",
    role: "feature-plan",
    needs: ".plan",
    hook: "Agency work. Small-business price.",
    async run(p) {
      await p.goto(URL); await sleep(3200);
      await p.locator("#pricing").scrollIntoViewIfNeeded(); await sleep(1400);
      const plans = await p.locator(".plan").all();
      for (const pl of plans) {
        const b = await pl.boundingBox();
        if (!b) continue;
        await p.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 8 });
        await sleep(760);
      }
      await sleep(700);
    },
  },
  {
    name: "07-reducedmotion",
    role: "motion",
    needs: "body",
    hook: "Accessible isn't a downgrade.",
    reducedMotion: "reduce",
    async run(p) {
      await p.goto(URL); await sleep(1600);
      await p.mouse.move(540, 900);
      for (let i = 0; i < 70; i++) { await p.mouse.wheel(0, 90); await sleep(24); }
      await sleep(700);
    },
  },
];

const only = process.env.SHOT;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(launchOptions());
  const ff = ffmpeg();
  if (!ff) console.warn("! no full ffmpeg found — leaving clips as .webm");
  const made = [];

  // Probe the page once, then keep only shots whose target actually exists.
  // A product page has no #ba or .svc-row; without this it would record
  // seven near-identical still frames and report success.
  const probe = await browser.newPage({ viewport: { width: W, height: H } });
  await probe.goto(URL);
  await sleep(1200);
  const applicable = [];
  for (const s of [...SHOTS, ...GENERIC_SHOTS]) {
    if (!s.needs || (await has(probe, s.needs))) applicable.push(s);
  }
  // Dedupe by role, preferring the page-specific shot. A generic shot still
  // runs when it fills a role nothing else covers (e.g. the CTA hover on a
  // product page), so we neither duplicate coverage nor lose a useful clip.
  const byRole = new Map();
  for (const s of applicable) {
    const generic = s.name.startsWith("g");
    const held = byRole.get(s.role);
    if (!held || (held.name.startsWith("g") && !generic)) byRole.set(s.role, s);
  }
  const chosen = [...byRole.values()];
  await probe.close();

  const skipped = [...SHOTS, ...GENERIC_SHOTS].length - chosen.length;
  if (skipped) console.log(`· ${chosen.length} applicable shots (${skipped} not present on this page)`);

  for (const shot of chosen) {
    if (only && shot.name !== only) continue;
    const dir = path.join(OUT, shot.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: SCALE,
      reducedMotion: shot.reducedMotion || "no-preference",
      recordVideo: { dir, size: { width: W, height: H } },
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));

    try {
      await shot.run(page);
    } catch (e) {
      errs.push("SHOT: " + e.message);
    }

    const vid = page.video();
    await ctx.close(); // finalizes the video file
    const src = vid ? await vid.path() : null;
    let final = null;
    if (src && fs.existsSync(src)) {
      final = path.join(OUT, shot.name + ".webm");
      fs.renameSync(src, final);
      fs.rmSync(dir, { recursive: true, force: true });
      if (ff) {
        try {
          const mp4 = toMp4(ff, final);
          fs.rmSync(final, { force: true }); // keep only the postable file
          final = mp4;
        } catch (e) {
          errs.push("MP4: " + e.message);
        }
      }
    }
    const size = final ? fs.statSync(final).size : 0;
    made.push({ name: shot.name, hook: shot.hook, file: final, size, errs });
    console.log(
      (final ? "✓" : "✗") + " " + shot.name +
      " " + (size / 1024 / 1024).toFixed(2) + "MB" +
      (errs.length ? "  ERRORS: " + errs.join(" | ") : "")
    );
  }

  await browser.close();

  // Caption sheet — hooks paired with their clip, ready to post.
  const sheet = made
    .map((m) => `${m.name}\n  hook: ${m.hook}\n  file: ${path.basename(m.file || "FAILED")}\n`)
    .join("\n");
  fs.writeFileSync(path.join(OUT, "captions.txt"), sheet);

  const ok = made.filter((m) => m.file && m.size > 20000).length;
  console.log(`\n${ok}/${made.length} clips rendered -> ${OUT}`);
  process.exit(ok === made.length ? 0 : 1);
})();
