/**
 * Second brain tests.
 *
 * The brain's job is to be trustworthy across sessions, so the tests focus on
 * the properties that make it so: provenance cannot be faked, contradictions
 * surface, stale knowledge is marked, and recall explains itself.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, serialize, lint, isStale, TYPES, TTL_DAYS, today } from "../brain/lib/note.mjs";
import { load, graph, write, health, slugify } from "../brain/lib/store.mjs";
import { search, tokenize, neighbourhood } from "../brain/lib/query.mjs";
import { buildBrief } from "../brain/lib/brief.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Build an in-memory note without touching disk. */
const note = (id, meta = {}, body = "A body long enough to pass lint.") => ({
  id, meta: { title: id, type: "fact", created: today(), source: "juan", confidence: "medium", ...meta }, body,
});

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "brain-"));

/* ------------------------------------------------------------------ format */
describe("note format", () => {
  test("round-trips through serialize and parse", () => {
    const meta = { title: "T", type: "fact", tags: ["a", "b"], created: "2026-01-01", source: "juan" };
    const p = parse(serialize(meta, "Body here."));
    assert.equal(p.meta.title, "T");
    assert.deepEqual(p.meta.tags, ["a", "b"]);
    assert.equal(p.body, "Body here.");
  });

  test("parses numbers and booleans", () => {
    const p = parse("---\nttl: 30\npinned: true\n---\nBody.");
    assert.equal(p.meta.ttl, 30);
    assert.equal(p.meta.pinned, true);
  });

  test("survives a file with no frontmatter", () => {
    const p = parse("just text", "x");
    assert.deepEqual(p.meta, {});
    assert.equal(p.body, "just text");
  });

  test("strips quotes from values", () => {
    assert.equal(parse(`---\ntitle: "Quoted"\n---\nBody.`).meta.title, "Quoted");
  });
});

/* -------------------------------------------------------------------- lint */
describe("lint — provenance cannot be faked", () => {
  test("a well-formed note passes", () => {
    assert.deepEqual(lint(note("a")), []);
  });

  test("a fact must declare a source", () => {
    const n = note("a"); delete n.meta.source;
    assert.ok(lint(n).some((p) => /must declare a source/.test(p)));
  });

  test("inferred claims cannot be high confidence", () => {
    const n = note("a", { source: "inferred", confidence: "high" });
    assert.ok(lint(n).some((p) => /inferred claims cannot be high confidence/.test(p)));
  });

  test("an external source without a URL is rejected", () => {
    const n = note("a", { source: "external" });
    assert.ok(lint(n).some((p) => /no URL/.test(p)));
  });

  test("external with a URL passes", () => {
    assert.deepEqual(lint(note("a", { source: "external", sources: ["https://x.example"] })), []);
  });

  test("rejects unknown type, source, and confidence", () => {
    assert.ok(lint(note("a", { type: "wat" })).some((p) => /unknown type/.test(p)));
    assert.ok(lint(note("a", { source: "vibes" })).some((p) => /unknown source/.test(p)));
    assert.ok(lint(note("a", { confidence: "总" })).some((p) => /unknown confidence/.test(p)));
  });

  test("rejects an empty body", () => {
    assert.ok(lint(note("a", {}, "hi")).some((p) => /body is empty/.test(p)));
  });
});

/* ----------------------------------------------------------------- staleness */
describe("staleness", () => {
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

  test("a freshly verified note is not stale", () => {
    assert.equal(isStale(note("a", { verified: today() })), false);
  });

  test("a fact goes stale after its ttl", () => {
    assert.equal(isStale(note("a", { type: "fact", verified: ago(TTL_DAYS.fact + 5) })), true);
  });

  test("decisions outlive facts", () => {
    const old = ago(TTL_DAYS.fact + 5);
    assert.equal(isStale(note("a", { type: "fact", verified: old })), true);
    assert.equal(isStale(note("b", { type: "decision", verified: old })), false);
  });

  test("an explicit ttl overrides the type default", () => {
    assert.equal(isStale(note("a", { type: "decision", ttl: 1, verified: ago(5) })), true);
  });

  test("a note with no dates is treated as stale", () => {
    const n = note("a"); delete n.meta.created; delete n.meta.verified;
    assert.equal(isStale(n), true);
  });
});

/* ------------------------------------------------------------------- graph */
describe("link graph", () => {
  const set = () => [
    note("a", { links: ["b"] }),
    note("b", {}, "Points back at [[a]] and to [[c]]."),
    note("c"),
  ];

  test("derives backlinks without declaring them", () => {
    const g = graph(set());
    assert.ok(g.back.get("b").has("a"));
    assert.ok(g.back.get("c").has("b"));
  });

  test("reads inline wikilinks", () => {
    assert.ok(graph(set()).out.get("b").has("a"));
  });

  test("reports broken links instead of dropping them", () => {
    const g = graph([note("a", { links: ["ghost"] })]);
    assert.equal(g.broken.length, 1);
    assert.equal(g.broken[0].to, "ghost");
  });

  test("neighbourhood walks both directions", () => {
    const near = neighbourhood("a", set(), 1).map((n) => n.id);
    assert.ok(near.includes("b"));
  });

  test("neighbourhood depth 2 reaches further", () => {
    const near = neighbourhood("a", set(), 2).map((n) => n.id);
    assert.ok(near.includes("c"), "depth 2 should reach c via b");
  });
});

/* --------------------------------------------------------------- integrity */
describe("health checks", () => {
  test("detects contradicting claims", () => {
    const h = health([
      note("a", { claim: "price", value: "$300" }),
      note("b", { claim: "price", value: "$900" }),
    ]);
    assert.equal(h.contradictions.length, 1);
    assert.equal(h.contradictions[0].claim, "price");
  });

  test("agreeing notes are not a contradiction", () => {
    const h = health([
      note("a", { claim: "price", value: "$300" }),
      note("b", { claim: "price", value: "$300" }),
    ]);
    assert.deepEqual(h.contradictions, []);
  });

  test("flags orphans", () => {
    const h = health([note("a"), note("b", { links: ["c"] }), note("c")]);
    assert.ok(h.orphans.some((n) => n.id === "a"));
    assert.ok(!h.orphans.some((n) => n.id === "c"), "c is linked, not an orphan");
  });

  test("collects inferred notes separately", () => {
    const h = health([note("a", { source: "inferred", confidence: "low" }), note("b")]);
    assert.equal(h.unverified.length, 1);
  });

  test("surfaces lint failures", () => {
    const bad = note("a"); delete bad.meta.title;
    assert.equal(health([bad]).linted.length, 1);
  });
});

/* ------------------------------------------------------------------ recall */
describe("recall", () => {
  const corpus = () => [
    note("pricing", { title: "Pricing", confidence: "high", source: "juan" },
      "We charge three hundred to four hundred dollars per month for websites."),
    note("shipping", { title: "Shipping", confidence: "medium" },
      "Supplier shipping takes ten to fourteen days."),
    note("guess", { title: "Pricing guess", source: "inferred", confidence: "low" },
      "Maybe we could charge more for websites someday."),
  ];

  test("tokenize drops stopwords", () => {
    assert.deepEqual(tokenize("the and of websites"), ["websites"]);
  });

  test("finds the relevant note", () => {
    const r = search("pricing per month", corpus());
    assert.equal(r[0].note.id, "pricing");
  });

  test("ranks a sourced note above an inferred one on the same topic", () => {
    const r = search("websites", corpus());
    const ids = r.map((x) => x.note.id);
    assert.ok(ids.indexOf("pricing") < ids.indexOf("guess"),
      "high-confidence juan note must outrank a low-confidence inference");
  });

  test("explains every result", () => {
    for (const r of search("pricing", corpus())) {
      assert.ok(r.why.length, "each hit must say why it ranked");
      assert.match(r.why[0], /matched:/);
    }
  });

  test("filters by type and tag", () => {
    const notes = [note("a", { type: "task", tags: ["x"] }, "Ship the thing today.")];
    assert.equal(search("ship", notes, { type: "fact" }).length, 0);
    assert.equal(search("ship", notes, { type: "task" }).length, 1);
    assert.equal(search("ship", notes, { tag: "nope" }).length, 0);
  });

  test("returns nothing rather than noise for an unmatched query", () => {
    assert.deepEqual(search("xylophone quantum", corpus()), []);
  });

  test("penalises stale notes", () => {
    const old = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
    const fresh = note("f", { title: "Widget" }, "The widget does a thing.");
    const stale = note("s", { title: "Widget", verified: old, created: old }, "The widget does a thing.");
    const r = search("widget thing", [fresh, stale]);
    assert.equal(r[0].note.id, "f");
  });
});

/* ------------------------------------------------------------------- brief */
describe("boot brief", () => {
  const corpus = () => [
    note("who", { type: "entity", title: "Juan" }, "The founder of the operation."),
    note("dec", { type: "decision", title: "Charge monthly" }, "Retainer pricing, not project fees."),
    note("con", { type: "decision", title: "No uploads", tags: ["constraint"] }, "Never upload anything anywhere."),
    note("shaky", { type: "fact", title: "Maybe true", source: "inferred", confidence: "low" }, "This was inferred, not confirmed."),
    note("solid", { type: "fact", title: "Definitely true", source: "measured", confidence: "high" }, "This was measured directly."),
    note("todo", { type: "task", title: "Do the thing", status: "open" }, "Something that still needs doing."),
    note("stuck", { type: "task", title: "Blocked thing", status: "blocked" }, "Waiting on Juan for this one."),
    note("learn", { type: "insight", title: "A lesson" }, "Do not repeat this mistake again."),
  ];

  test("separates established facts from assumptions", () => {
    const md = buildBrief(corpus());
    const solidAt = md.indexOf("Definitely true");
    const shakyAt = md.indexOf("Maybe true");
    assert.ok(md.includes("## Established facts"));
    assert.ok(md.includes("## Unverified — treat as assumptions"));
    assert.ok(solidAt < shakyAt, "established facts come before assumptions");
  });

  test("never presents an inference as established", () => {
    const md = buildBrief(corpus());
    const established = md.slice(md.indexOf("## Established facts"), md.indexOf("## Unverified"));
    assert.ok(!established.includes("Maybe true"));
  });

  test("separates blocked work from open work", () => {
    const md = buildBrief(corpus());
    assert.match(md, /## Open work[\s\S]*Do the thing/);
    assert.match(md, /## Blocked — needs Juan[\s\S]*Blocked thing/);
  });

  test("surfaces constraints as their own section", () => {
    assert.match(buildBrief(corpus()), /## Hard constraints[\s\S]*No uploads/);
  });

  test("reports contradictions in the health block", () => {
    const md = buildBrief([
      note("a", { claim: "price", value: "$300" }),
      note("b", { claim: "price", value: "$900" }),
    ]);
    assert.match(md, /Contradictions/);
    assert.match(md, /price/);
  });

  test("reports clean when the brain is healthy", () => {
    assert.match(buildBrief([note("a", { links: ["b"] }), note("b", { links: ["a"] })]), /✓ clean/);
  });

  test("handles an empty brain without throwing", () => {
    assert.match(buildBrief([]), /BOOT BRIEF/);
  });
});

/* --------------------------------------------------------------- roundtrip */
describe("store on disk", () => {
  test("write then load preserves metadata", () => {
    const dir = tmpdir();
    try {
      write({ title: "Round Trip", type: "fact", source: "juan", tags: ["x"] }, "A body long enough.", dir);
      const [n] = load(dir);
      assert.equal(n.id, "round-trip");
      assert.equal(n.meta.type, "fact");
      assert.deepEqual(n.meta.tags, ["x"]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("slugify produces safe ids", () => {
    assert.equal(slugify("Pricing: $300–400 / month!"), "pricing-300-400-month");
  });

  test("loading a missing directory returns empty", () => {
    assert.deepEqual(load(path.join(os.tmpdir(), "definitely-not-here-" + Date.now())), []);
  });
});

/* ------------------------------------------------------- the real brain --- */
describe("the seeded brain", () => {
  const notes = load();

  test("has notes", () => {
    assert.ok(notes.length >= 20, `expected a seeded brain, got ${notes.length}`);
  });

  test("every note passes lint", () => {
    const bad = notes.map((n) => ({ id: n.id, p: lint(n) })).filter((x) => x.p.length);
    assert.deepEqual(bad, [], JSON.stringify(bad, null, 1));
  });

  test("has no contradictions", () => {
    assert.deepEqual(health(notes).contradictions, []);
  });

  test("has no broken links", () => {
    assert.deepEqual(graph(notes).broken, []);
  });

  test("every type in use is a known type", () => {
    for (const n of notes) assert.ok(TYPES.includes(n.meta.type), `${n.id}: ${n.meta.type}`);
  });

  test("records the hard constraints", () => {
    const md = buildBrief(notes);
    assert.match(md, /Never upload to Instagram/);
    assert.match(md, /Personal account is off-limits/);
  });

  test("BOOT.md is committed and current", () => {
    const f = path.join(ROOT, "brain/BOOT.md");
    assert.ok(fs.existsSync(f), "run: npm run brain:brief");
    const disk = fs.readFileSync(f, "utf8");
    // Compare structure, not the generation date.
    const strip = (s) => s.replace(/> Generated \d{4}-\d{2}-\d{2}.*\n/, "");
    assert.equal(strip(disk), strip(buildBrief(notes)),
      "BOOT.md is out of date — run: npm run brain:brief");
  });
});
