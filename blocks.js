/*
 * Scorpion block library.
 * Each block has: type, label, icon, and a `template` factory returning the
 * inner HTML for the block. Editable text uses [contenteditable] with a
 * data-field attribute so content survives serialization.
 *
 * BLOCK_CSS is the stylesheet for rendered block content. It is injected into
 * the editor at load time AND embedded into exported pages, so what you see is
 * what you ship.
 */

const BLOCK_CSS = `
  /* ===== Scorpion content system — expresses DESIGN_DNA.md =====
     Editorial palette: ink / paper / one accent. Modular type scale (~1.25).
     Generous rhythm, restrained motion. */
  :root {
    --sb-ink: #16151a;
    --sb-ink-soft: #4a4852;
    --sb-paper: #f7f5f1;
    --sb-paper-2: #ffffff;
    --sb-accent: #c8532b;
    --sb-line: rgba(22, 21, 26, 0.10);
    --sb-display: "Georgia", "Times New Roman", serif;
    --sb-text: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    --sb-maxw: 68ch;
  }
  .sb-section { padding: clamp(56px, 9vw, 128px) clamp(20px, 6vw, 64px); font-family: var(--sb-text); color: var(--sb-ink); background: var(--sb-paper); }
  .sb-container { max-width: var(--sb-maxw); margin: 0 auto; }

  /* Hero — editorial, quiet luxury */
  .sb-hero { text-align: left; background: var(--sb-ink); color: var(--sb-paper); padding: clamp(96px, 16vw, 200px) clamp(20px, 6vw, 64px); }
  .sb-hero h1 { font-family: var(--sb-display); font-weight: 500; font-size: clamp(40px, 8vw, 82px); margin: 0 0 24px; line-height: 1.04; letter-spacing: -0.02em; max-width: 16ch; }
  .sb-hero p { font-size: clamp(17px, 2.2vw, 21px); line-height: 1.6; margin: 0 0 40px; max-width: 46ch; color: rgba(247, 245, 241, 0.72); }

  /* Buttons — physical, real destinations */
  .sb-btn { display: inline-block; background: var(--sb-accent); color: #fff; padding: 15px 30px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 15px; letter-spacing: 0.01em; transition: transform 0.2s ease, background 0.2s ease; }
  .sb-btn:hover { background: #a8421f; transform: translateY(-2px); }

  .sb-heading h2 { font-family: var(--sb-display); font-weight: 500; font-size: clamp(30px, 5vw, 46px); margin: 0; line-height: 1.1; letter-spacing: -0.015em; }
  .sb-text p { font-size: clamp(17px, 2vw, 19px); line-height: 1.75; color: var(--sb-ink-soft); margin: 0; }

  /* Features — restrained editorial grid */
  .sb-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(28px, 4vw, 56px); max-width: 1080px; margin: 0 auto; }
  .sb-feature { text-align: left; }
  .sb-feature .sb-ico { font-size: 28px; display: block; }
  .sb-feature h3 { font-family: var(--sb-display); font-weight: 500; font-size: 21px; margin: 18px 0 10px; letter-spacing: -0.01em; }
  .sb-feature p { font-size: 16px; color: var(--sb-ink-soft); line-height: 1.65; margin: 0; }

  .sb-image img { max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 6px; }

  /* CTA — one clear focal point */
  .sb-cta { text-align: center; background: var(--sb-paper-2); border-top: 1px solid var(--sb-line); border-bottom: 1px solid var(--sb-line); }
  .sb-cta h2 { font-family: var(--sb-display); font-weight: 500; font-size: clamp(28px, 4.5vw, 44px); margin: 0 0 16px; letter-spacing: -0.015em; line-height: 1.1; }
  .sb-cta p { font-size: clamp(16px, 2vw, 19px); color: var(--sb-ink-soft); margin: 0 0 32px; }

  .sb-footer { text-align: center; background: var(--sb-ink); color: rgba(247, 245, 241, 0.6); padding: 48px 32px; font-size: 14px; letter-spacing: 0.01em; }
  .sb-footer a { color: var(--sb-paper); text-decoration: none; border-bottom: 1px solid rgba(247, 245, 241, 0.3); padding-bottom: 1px; }

  /* Navbar */
  .sb-nav { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 20px clamp(20px, 6vw, 64px); background: var(--sb-paper); border-bottom: 1px solid var(--sb-line); font-family: var(--sb-text); }
  .sb-nav .sb-brand { font-family: var(--sb-display); font-size: 20px; letter-spacing: -0.01em; color: var(--sb-ink); }
  .sb-nav .sb-links { display: flex; gap: clamp(16px, 3vw, 30px); align-items: center; }
  .sb-nav .sb-links a { color: var(--sb-ink-soft); text-decoration: none; font-size: 15px; }
  .sb-nav .sb-links a:hover { color: var(--sb-ink); }
  .sb-nav .sb-links .sb-btn { padding: 10px 20px; }

  /* Split — text + image, editorial */
  .sb-split { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(28px, 5vw, 72px); align-items: center; max-width: 1120px; margin: 0 auto; }
  .sb-split .sb-copy h2 { font-family: var(--sb-display); font-weight: 500; font-size: clamp(28px, 4.5vw, 46px); margin: 0 0 18px; letter-spacing: -0.015em; line-height: 1.1; }
  .sb-split .sb-copy p { font-size: clamp(16px, 2vw, 19px); color: var(--sb-ink-soft); line-height: 1.7; margin: 0 0 28px; }
  .sb-split img { width: 100%; height: auto; border-radius: 6px; display: block; }

  /* Logo strip */
  .sb-logos { text-align: center; }
  .sb-logos .sb-eyebrow { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sb-ink-soft); margin: 0 0 28px; }
  .sb-logos .sb-row { display: flex; flex-wrap: wrap; gap: clamp(24px, 5vw, 56px); align-items: center; justify-content: center; }
  .sb-logos .sb-row span { font-family: var(--sb-display); font-size: clamp(18px, 2.4vw, 26px); color: var(--sb-ink); opacity: 0.5; }

  /* Stats */
  .sb-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(24px, 4vw, 48px); max-width: 1000px; margin: 0 auto; text-align: center; }
  .sb-stat .sb-num { font-family: var(--sb-display); font-size: clamp(34px, 5vw, 52px); letter-spacing: -0.02em; color: var(--sb-ink); line-height: 1; }
  .sb-stat .sb-lbl { font-size: 14px; color: var(--sb-ink-soft); margin-top: 8px; letter-spacing: 0.02em; }

  /* Quote / testimonial */
  .sb-quote { background: var(--sb-ink); color: var(--sb-paper); text-align: center; }
  .sb-quote blockquote { font-family: var(--sb-display); font-weight: 500; font-size: clamp(24px, 3.6vw, 38px); line-height: 1.3; letter-spacing: -0.01em; margin: 0 auto 22px; max-width: 26ch; }
  .sb-quote .sb-cite { font-size: 15px; color: rgba(247, 245, 241, 0.6); letter-spacing: 0.02em; }

  /* Pricing */
  .sb-pricing { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(20px, 3vw, 32px); max-width: 1040px; margin: 0 auto; }
  .sb-plan { border: 1px solid var(--sb-line); border-radius: 10px; padding: 34px 30px; background: var(--sb-paper-2); display: flex; flex-direction: column; }
  .sb-plan .sb-tier { font-family: var(--sb-display); font-size: 20px; margin: 0 0 10px; }
  .sb-plan .sb-price { font-family: var(--sb-display); font-size: 42px; letter-spacing: -0.02em; margin: 0 0 4px; line-height: 1; }
  .sb-plan .sb-per { font-size: 13px; color: var(--sb-ink-soft); margin: 0 0 22px; }
  .sb-plan ul { list-style: none; padding: 0; margin: 0 0 26px; }
  .sb-plan li { font-size: 15px; color: var(--sb-ink-soft); padding: 9px 0; border-bottom: 1px solid var(--sb-line); }
  .sb-plan .sb-btn { margin-top: auto; text-align: center; }
  .sb-plan.sb-featured { background: var(--sb-ink); border-color: var(--sb-ink); }
  .sb-plan.sb-featured .sb-tier, .sb-plan.sb-featured .sb-price { color: var(--sb-paper); }
  .sb-plan.sb-featured .sb-per, .sb-plan.sb-featured li { color: rgba(247, 245, 241, 0.7); border-color: rgba(247, 245, 241, 0.16); }

  /* Gallery */
  .sb-gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(12px, 2vw, 20px); max-width: 1120px; margin: 0 auto; }
  .sb-gallery img { width: 100%; height: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 6px; display: block; }

  /* Scroll-reveal — subtle, tasteful, and optional */
  .sb-reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.7s ease, transform 0.7s ease; }
  .sb-reveal.is-in { opacity: 1; transform: none; }

  @media (max-width: 860px) {
    .sb-stats { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 720px) {
    .sb-features, .sb-split, .sb-pricing, .sb-gallery { grid-template-columns: 1fr; }
    .sb-nav { flex-direction: column; gap: 14px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sb-reveal { opacity: 1; transform: none; transition: none; }
    .sb-btn { transition: none; }
  }
`;

// Inline SVG placeholder (data URI) — keeps blocks & exports fully self-contained
// with no external image requests, honoring the "self-contained output" standard.
function phSVG(label, w, h) {
  const fs = Math.round(Math.min(w, h) / 9);
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='" + h + "'>" +
    "<rect width='100%' height='100%' fill='#e7e3db'/>" +
    "<rect x='0.5' y='0.5' width='" + (w - 1) + "' height='" + (h - 1) + "' fill='none' stroke='#c9c3b8'/>" +
    "<text x='50%' y='50%' font-family='Georgia, serif' font-size='" + fs + "' fill='#8a857b' " +
    "text-anchor='middle' dominant-baseline='middle'>" + label + "</text></svg>";
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

const BLOCKS = [
  {
    type: "navbar",
    label: "Nav bar",
    icon: "🧭",
    template: () => `
      <nav class="sb-nav">
        <span class="sb-brand" contenteditable="true" data-field>Studio</span>
        <span class="sb-links">
          <a href="#" contenteditable="true" data-field>Work</a>
          <a href="#" contenteditable="true" data-field>About</a>
          <a href="#" contenteditable="true" data-field>Contact</a>
          <a class="sb-btn" href="#" data-href contenteditable="true" data-field>Let’s talk</a>
        </span>
      </nav>`,
  },
  {
    type: "hero",
    label: "Hero",
    icon: "🌄",
    template: () => `
      <section class="sb-section sb-hero">
        <div class="sb-container">
          <h1 contenteditable="true" data-field>Build something people love</h1>
          <p contenteditable="true" data-field>A clean, fast landing page you can ship in minutes.</p>
          <a class="sb-btn" href="#" data-href contenteditable="true" data-field>Get started</a>
        </div>
      </section>`,
  },
  {
    type: "split",
    label: "Split (text + image)",
    icon: "▤",
    template: () => `
      <section class="sb-section">
        <div class="sb-split">
          <div class="sb-copy">
            <h2 contenteditable="true" data-field>Design with intent, ship with confidence.</h2>
            <p contenteditable="true" data-field>Every project starts with strategy and ends with a build that feels considered from the first scroll to the last.</p>
            <a class="sb-btn" href="#" data-href contenteditable="true" data-field>See the work</a>
          </div>
          <img src="${phSVG('Image', 640, 520)}" alt="" data-img />
        </div>
      </section>`,
  },
  {
    type: "heading",
    label: "Heading",
    icon: "🔠",
    template: () => `
      <section class="sb-section sb-heading">
        <div class="sb-container">
          <h2 contenteditable="true" data-field>A section heading</h2>
        </div>
      </section>`,
  },
  {
    type: "text",
    label: "Text",
    icon: "📝",
    template: () => `
      <section class="sb-section sb-text">
        <div class="sb-container">
          <p contenteditable="true" data-field>Write a paragraph here. Click to edit this text and describe your product, service, or story in your own words.</p>
        </div>
      </section>`,
  },
  {
    type: "features",
    label: "Features",
    icon: "🧩",
    template: () => `
      <section class="sb-section">
        <div class="sb-features">
          <div class="sb-feature">
            <div class="sb-ico" contenteditable="true" data-field>⚡</div>
            <h3 contenteditable="true" data-field>Fast</h3>
            <p contenteditable="true" data-field>Loads instantly, no bloat, no waiting.</p>
          </div>
          <div class="sb-feature">
            <div class="sb-ico" contenteditable="true" data-field>🎨</div>
            <h3 contenteditable="true" data-field>Beautiful</h3>
            <p contenteditable="true" data-field>Thoughtful defaults that look good out of the box.</p>
          </div>
          <div class="sb-feature">
            <div class="sb-ico" contenteditable="true" data-field>🔒</div>
            <h3 contenteditable="true" data-field>Reliable</h3>
            <p contenteditable="true" data-field>Static output you can host anywhere.</p>
          </div>
        </div>
      </section>`,
  },
  {
    type: "logos",
    label: "Logo strip",
    icon: "🏷️",
    template: () => `
      <section class="sb-section sb-logos">
        <p class="sb-eyebrow" contenteditable="true" data-field>Trusted by teams at</p>
        <div class="sb-row">
          <span contenteditable="true" data-field>Northwind</span>
          <span contenteditable="true" data-field>Aperture</span>
          <span contenteditable="true" data-field>Monarch</span>
          <span contenteditable="true" data-field>Vela</span>
        </div>
      </section>`,
  },
  {
    type: "stats",
    label: "Stats",
    icon: "📊",
    template: () => `
      <section class="sb-section">
        <div class="sb-stats">
          <div class="sb-stat"><div class="sb-num" contenteditable="true" data-field>120+</div><div class="sb-lbl" contenteditable="true" data-field>Projects shipped</div></div>
          <div class="sb-stat"><div class="sb-num" contenteditable="true" data-field>15</div><div class="sb-lbl" contenteditable="true" data-field>Years of craft</div></div>
          <div class="sb-stat"><div class="sb-num" contenteditable="true" data-field>98%</div><div class="sb-lbl" contenteditable="true" data-field>Client retention</div></div>
          <div class="sb-stat"><div class="sb-num" contenteditable="true" data-field>30+</div><div class="sb-lbl" contenteditable="true" data-field>Awards won</div></div>
        </div>
      </section>`,
  },
  {
    type: "image",
    label: "Image",
    icon: "🖼️",
    template: () => `
      <section class="sb-section sb-image">
        <div class="sb-container">
          <img src="${phSVG('Your image', 760, 380)}" alt="" data-img />
        </div>
      </section>`,
  },
  {
    type: "gallery",
    label: "Gallery",
    icon: "🎞️",
    template: () => `
      <section class="sb-section">
        <div class="sb-gallery">
          <img src="${phSVG('01', 600, 750)}" alt="" data-img />
          <img src="${phSVG('02', 600, 750)}" alt="" data-img />
          <img src="${phSVG('03', 600, 750)}" alt="" data-img />
        </div>
      </section>`,
  },
  {
    type: "quote",
    label: "Quote / testimonial",
    icon: "❝",
    template: () => `
      <section class="sb-section sb-quote">
        <div class="sb-container">
          <blockquote contenteditable="true" data-field>They translated a vague idea into a brand that finally feels like us — and a site we’re proud to send anyone to.</blockquote>
          <div class="sb-cite" contenteditable="true" data-field>— Alex Rivera, Founder at Monarch</div>
        </div>
      </section>`,
  },
  {
    type: "pricing",
    label: "Pricing",
    icon: "💲",
    template: () => `
      <section class="sb-section">
        <div class="sb-pricing">
          <div class="sb-plan">
            <div class="sb-tier" contenteditable="true" data-field>Starter</div>
            <div class="sb-price" contenteditable="true" data-field>$0</div>
            <div class="sb-per" contenteditable="true" data-field>per month</div>
            <ul>
              <li contenteditable="true" data-field>1 project</li>
              <li contenteditable="true" data-field>Community support</li>
              <li contenteditable="true" data-field>Standard export</li>
            </ul>
            <a class="sb-btn" href="#" data-href contenteditable="true" data-field>Choose Starter</a>
          </div>
          <div class="sb-plan sb-featured">
            <div class="sb-tier" contenteditable="true" data-field>Pro</div>
            <div class="sb-price" contenteditable="true" data-field>$24</div>
            <div class="sb-per" contenteditable="true" data-field>per month</div>
            <ul>
              <li contenteditable="true" data-field>Unlimited projects</li>
              <li contenteditable="true" data-field>Priority support</li>
              <li contenteditable="true" data-field>Custom domains</li>
            </ul>
            <a class="sb-btn" href="#" data-href contenteditable="true" data-field>Choose Pro</a>
          </div>
          <div class="sb-plan">
            <div class="sb-tier" contenteditable="true" data-field>Studio</div>
            <div class="sb-price" contenteditable="true" data-field>$79</div>
            <div class="sb-per" contenteditable="true" data-field>per month</div>
            <ul>
              <li contenteditable="true" data-field>Team seats</li>
              <li contenteditable="true" data-field>Dedicated manager</li>
              <li contenteditable="true" data-field>White-glove onboarding</li>
            </ul>
            <a class="sb-btn" href="#" data-href contenteditable="true" data-field>Choose Studio</a>
          </div>
        </div>
      </section>`,
  },
  {
    type: "cta",
    label: "Call to action",
    icon: "📣",
    template: () => `
      <section class="sb-section sb-cta">
        <div class="sb-container">
          <h2 contenteditable="true" data-field>Ready to get started?</h2>
          <p contenteditable="true" data-field>Join today and ship your first page in minutes.</p>
          <a class="sb-btn" href="#" data-href contenteditable="true" data-field>Sign up free</a>
        </div>
      </section>`,
  },
  {
    type: "footer",
    label: "Footer",
    icon: "🔻",
    template: () => `
      <footer class="sb-footer">
        <p contenteditable="true" data-field>© 2026 Your Company · <a href="#">Privacy</a> · <a href="#">Terms</a></p>
      </footer>`,
  },
];

const BLOCK_MAP = BLOCKS.reduce((acc, b) => {
  acc[b.type] = b;
  return acc;
}, {});
