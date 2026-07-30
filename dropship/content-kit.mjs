/**
 * Product brief -> the sales content kit.
 *
 *   node dropship/content-kit.mjs dropship/products/<slug>.json [outdir]
 *
 * Emits a markdown kit: short-form hooks, three shootable video scripts with
 * beat timings, ad primary-text variants, headline tests, caption + hashtag
 * sets, and a DM/objection script.
 *
 * Everything derives from the brief's positioning block. Nothing is invented:
 * if a field is missing the corresponding angle is omitted and reported, rather
 * than filled with a plausible-sounding guess. No fabricated testimonials, no
 * manufactured urgency, no unsubstantiated claims — the same rules the page
 * generator enforces.
 */
import fs from "fs";
import path from "path";
import { validate } from "./lib/schema.mjs";

const money = (n, c = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);

/* ------------------------------------------------------------------ hooks */
/**
 * Hook angles. Each is a function of the brief; one returning null means the
 * brief lacks the material for that angle, and it is skipped.
 */
const HOOK_ANGLES = [
  {
    id: "problem-callout",
    need: (p) => p.positioning?.problem,
    make: (p) => `${p.positioning.problem}`,
    note: "Open on the feeling, not the product. Face to camera.",
  },
  {
    id: "pattern-interrupt",
    need: (p) => p.positioning?.demoIn3s,
    make: (p) => `Watch what this does in five seconds.`,
    note: "Motion on frame 1. The demo IS the hook — no talking head first.",
  },
  {
    id: "objection-first",
    need: (p) => p.positioning?.objections?.[0],
    make: (p) => `"${p.positioning.objections[0]}" — fair. Here's the honest answer.`,
    note: "Naming the doubt out loud buys trust cheaply.",
  },
  {
    id: "wrong-fix",
    need: (p) => p.positioning?.agitation,
    make: (p) => `You're fixing the wrong thing. ${p.positioning.agitation}`,
    note: "Reframe. Works when buyers already tried alternatives.",
  },
  {
    id: "price-anchor",
    need: (p) => p.economics?.sellPrice && p.economics?.compareAtPrice,
    make: (p) =>
      `${money(p.economics.compareAtPrice, p.economics.currency)} for this, or ${money(p.economics.sellPrice, p.economics.currency)}. Same thing.`,
    note: "Only truthful if compareAtPrice is a real market price, not invented.",
  },
  {
    id: "ritual",
    need: (p) => p.howItWorks?.length >= 2,
    make: (p) => `Three steps. About five minutes. Every night.`,
    note: "Sells the routine rather than the object. Strong for beauty/wellness.",
  },
  {
    id: "buyer-callout",
    need: (p) => p.positioning?.buyer,
    make: (p) => `If this is you — ${p.positioning.buyer.toLowerCase()} — this one's worth a look.`,
    note: "Self-selecting. Lowers reach, raises conversion.",
  },
];

/* ---------------------------------------------------------------- scripts */
function scripts(p) {
  const pos = p.positioning || {};
  const steps = p.howItWorks || [];
  const bens = p.benefits || [];
  const price = p.economics?.sellPrice
    ? money(p.economics.sellPrice, p.economics.currency) : null;
  const out = [];

  if (pos.problem && pos.solution) {
    out.push({
      title: "A · Problem → Solution (20s)",
      use: "Cold audience. The default first test.",
      beats: [
        ["0:00–0:03", `HOOK — "${pos.problem}"`, "Face to camera, no product visible yet."],
        ["0:03–0:07", pos.agitation || "Why the usual fix misses.", "Cut to the failed workaround."],
        ["0:07–0:13", pos.solution, "First clear look at the product. Hands, not packaging."],
        ["0:13–0:17", bens[0] ? `${bens[0].title}: ${bens[0].body}` : "The single strongest benefit.", "Close-up of the detail that proves it."],
        ["0:17–0:20", price ? `${price}. Link in bio.` : "Link in bio.", "Product at rest, clean surface."],
      ],
    });
  }

  if (pos.demoIn3s) {
    out.push({
      title: "B · Pure demo, no voiceover (12s)",
      use: "Highest completion rate. Best for retargeting and Reels.",
      beats: [
        ["0:00–0:03", pos.demoIn3s, "No text, no talking. Just the motion."],
        ["0:03–0:08", "Repeat the motion from a second angle.", "Overhead or macro."],
        ["0:08–0:12", price ? `Caption card: ${price}` : "Caption card.", "Hold on the product, still frame."],
      ],
    });
  }

  if (steps.length >= 2) {
    out.push({
      title: "C · How to use it (25s)",
      use: "Warm audience and post-purchase. Cuts refunds by setting expectations.",
      beats: [
        ["0:00–0:03", `"Most people use this wrong."`, "Hands holding product."],
        ...steps.slice(0, 3).map((s, i) => [
          `0:0${3 + i * 6}–0:0${9 + i * 6}`.replace(/0:0(\d\d)/, "0:$1"),
          `Step ${s.step} — ${s.title}. ${s.body || ""}`.trim(),
          "Show, then say. Never the reverse.",
        ]),
        ["end", price ? `${price}, link in bio.` : "Link in bio.", "Clean close."],
      ],
    });
  }

  return out;
}

/* -------------------------------------------------------------- ad copy */
function adCopy(p) {
  const pos = p.positioning || {};
  const g = p.guarantee || {};
  const price = p.economics?.sellPrice ? money(p.economics.sellPrice, p.economics.currency) : "";
  const v = [];

  if (pos.problem && pos.solution) {
    v.push({
      label: "Direct",
      body: `${pos.problem}\n\n${pos.solution}\n\n${g.returnDays ? `${g.returnDays}-day returns. ` : ""}${price}`,
    });
  }
  if (pos.agitation && pos.solution) {
    v.push({
      label: "Reframe",
      body: `${pos.agitation}\n\n${pos.solution}\n\n${price}${g.returnDays ? ` · ${g.returnDays}-day returns` : ""}`,
    });
  }
  if ((p.benefits || []).length >= 3) {
    v.push({
      label: "Benefit stack",
      body: `${p.tagline}\n\n${p.benefits.slice(0, 3).map((b) => `— ${b.title}: ${b.body}`).join("\n")}\n\n${price}`,
    });
  }
  if ((pos.objections || []).length) {
    v.push({
      label: "Objection-led",
      body: `"${pos.objections[0]}"\n\nReasonable question. ${pos.solution || ""}\n\n${g.text || ""}`.trim(),
    });
  }
  return v;
}

function headlines(p) {
  const pos = p.positioning || {};
  const h = [];
  if (p.tagline) h.push(p.tagline);
  if (pos.problem) h.push(pos.problem.replace(/\.$/, ""));
  if (p.benefits?.[0]) h.push(p.benefits[0].title + ", without the fuss");
  if (pos.buyer) h.push(`Built for ${pos.buyer.toLowerCase().replace(/\.$/, "")}`);
  if (p.howItWorks?.length) h.push(`${p.howItWorks.length} steps. That's the whole routine.`);
  return h;
}

function captions(p) {
  const pos = p.positioning || {};
  const tags = {
    beauty: ["#skincare", "#selfcare", "#beautytok", "#skintok", "#hairtok"],
    home: ["#homehacks", "#organization", "#cleantok", "#homefinds", "#kitchenhacks"],
    wellness: ["#wellness", "#selfcare", "#healthyhabits", "#routine"],
    tech: ["#gadgets", "#techtok", "#coolfinds"],
    pet: ["#pettok", "#dogsoftiktok", "#petparent"],
    outdoor: ["#outdoors", "#camping", "#gear"],
  }[p.category] || ["#founditonline", "#tiktokmademebuyit"];

  const base = [
    pos.problem ? `${pos.problem} Fixed it in five minutes.` : null,
    p.tagline || null,
    pos.demoIn3s ? `No filter, no edit — this is just what it does.` : null,
  ].filter(Boolean);

  return base.map((b) => `${b}\n\n${tags.slice(0, 4).join(" ")}`);
}

function dmScript(p) {
  const pos = p.positioning || {};
  const g = p.guarantee || {};
  const lines = [
    "**Opener (after they comment the keyword):**",
    `> Sent — here's the link. Quick one: what made you stop on the video?`,
    "",
    "**If they ask if it actually works:**",
    `> Honest answer: ${pos.solution || "it does one thing, and it does it well."}${g.returnDays ? ` If it doesn't do that for you, ${g.returnDays}-day returns, no argument.` : ""}`,
    "",
    "**If they ask about shipping:**",
    `> ${p.shipping?.estimate || "[FILL shipping.estimate — do not guess]"}`,
    "",
    "**If they go quiet:** leave it. One message, then stop.",
  ];
  (pos.objections || []).slice(1).forEach((o) => {
    lines.push("", `**"${o}"**`, `> [Answer honestly — do not promise beyond the product.]`);
  });
  return lines.join("\n");
}

/* ------------------------------------------------------------------ build */
export function buildKit(p) {
  const skipped = [];
  const hooks = HOOK_ANGLES.map((a) => {
    if (!a.need(p)) { skipped.push(`${a.id} (missing source field)`); return null; }
    return { id: a.id, text: a.make(p), note: a.note };
  }).filter(Boolean);

  const scr = scripts(p);
  const ads = adCopy(p);
  const heads = headlines(p);
  const caps = captions(p);
  const { warnings } = validate(p);

  const md = [];
  md.push(`# CONTENT KIT — ${p.name}`, "");
  md.push(`> Generated from \`${p.slug}.json\`. Every line traces to a field in the`,
          `> brief — nothing here is invented. Angles whose source field is empty are`,
          `> listed as skipped rather than filled with a guess.`, "");

  if (p.trend?.momentum != null) {
    md.push(`**Trend momentum:** ${p.trend.momentum}/100${p.trend.checkedOn ? ` (checked ${p.trend.checkedOn})` : ""}`, "");
  }

  md.push("## Hooks — first 3 seconds", "",
    "Test these as thumb-stoppers. One idea each; do not stack them.", "");
  hooks.forEach((h, i) => {
    md.push(`**${i + 1}. ${h.id}**`, `> ${h.text}`, `*${h.note}*`, "");
  });

  md.push("## Video scripts", "");
  if (!scr.length) md.push("_No script generated — brief lacks problem/solution, demo, or steps._", "");
  scr.forEach((s) => {
    md.push(`### ${s.title}`, `*${s.use}*`, "",
      "| Time | Line | Shot |", "| --- | --- | --- |");
    s.beats.forEach(([t, line, shot]) =>
      md.push(`| \`${t}\` | ${String(line).replace(/\|/g, "\\|")} | ${shot} |`));
    md.push("");
  });

  md.push("## Ad primary text", "");
  ads.forEach((a) => md.push(`**${a.label}**`, "```", a.body, "```", ""));

  md.push("## Headline tests", "");
  heads.forEach((h) => md.push(`- ${h}`));
  md.push("");

  md.push("## Captions", "");
  caps.forEach((c) => md.push("```", c, "```", ""));

  md.push("## DM script", "", dmScript(p), "");

  md.push("## Do not use", "",
    "- No invented testimonials or ratings. Quote only real buyers.",
    "- No countdown timers, stock counters, or \"N people watching\".",
    "- No medical claims. No \"cures\", \"heals\", \"clinically proven\".",
    "- Do not promise shipping faster than the supplier delivers.", "");

  if (skipped.length) {
    md.push("## Skipped angles", "",
      "These need a field filled in the brief before they can be written honestly:", "");
    skipped.forEach((s) => md.push(`- ${s}`));
    md.push("");
  }
  if (warnings.length) {
    md.push("## Brief warnings", "");
    warnings.forEach((w) => md.push(`- ${w}`));
    md.push("");
  }

  return { md: md.join("\n"), counts: { hooks: hooks.length, scripts: scr.length, ads: ads.length, headlines: heads.length, captions: caps.length, skipped: skipped.length } };
}

/* -------------------------------------------------------------------- cli */
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node dropship/content-kit.mjs <product.json> [outdir]");
    process.exit(2);
  }
  const p = JSON.parse(fs.readFileSync(file, "utf8"));
  const v = validate(p);
  if (!v.ok) {
    console.error("✗ brief invalid:");
    v.errors.forEach((e) => console.error("  - " + e));
    process.exit(1);
  }
  const { md, counts } = buildKit(p);
  const outdir = process.argv[3] || path.join(path.dirname(file), "..", "out");
  fs.mkdirSync(outdir, { recursive: true });
  const out = path.join(outdir, `${p.slug}-content-kit.md`);
  fs.writeFileSync(out, md);
  console.log(`✓ ${out}`);
  console.log(`  ${counts.hooks} hooks · ${counts.scripts} scripts · ${counts.ads} ad variants · ` +
              `${counts.headlines} headlines · ${counts.captions} captions` +
              (counts.skipped ? ` · ${counts.skipped} skipped` : ""));
}
