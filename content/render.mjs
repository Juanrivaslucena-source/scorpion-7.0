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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = process.argv[2] || path.join(ROOT, "showcase/lumen.html");
const OUT = process.argv[3] || path.join(ROOT, "content/out");
const URL = SITE.startsWith("http") ? SITE : "file://" + path.resolve(SITE);

// 9:16 vertical, phone-sized.
const W = 1080, H = 1920, SCALE = 1;

function exe() {
  const base = "/opt/pw-browsers";
  const dir = fs.readdirSync(base).find((d) => d.startsWith("chromium-"))
    || fs.readdirSync(base).find((d) => d.startsWith("chromium_headless_shell"));
  const full = path.join(base, dir, "chrome-linux", "chrome");
  return fs.existsSync(full) ? full : path.join(base, dir, "chrome-linux", "headless_shell");
}

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
 * Shot list. Each shot: a name, the hook caption, and a director function that
 * drives the page while the recorder runs.
 */
const SHOTS = [
  {
    name: "01-loader",
    hook: "Most small-business sites load like it's 2014.",
    async run(p) { await p.goto(URL); await sleep(4200); },
  },
  {
    name: "02-hero",
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
  const browser = await chromium.launch({ executablePath: exe() });
  const ff = ffmpeg();
  if (!ff) console.warn("! no full ffmpeg found — leaving clips as .webm");
  const made = [];

  for (const shot of SHOTS) {
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
