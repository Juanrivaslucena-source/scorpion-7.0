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

  /* Scroll-reveal — subtle, tasteful, and optional */
  .sb-reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.7s ease, transform 0.7s ease; }
  .sb-reveal.is-in { opacity: 1; transform: none; }

  @media (max-width: 720px) {
    .sb-features { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sb-reveal { opacity: 1; transform: none; transition: none; }
    .sb-btn { transition: none; }
  }
`;

const BLOCKS = [
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
    type: "image",
    label: "Image",
    icon: "🖼️",
    template: () => `
      <section class="sb-section sb-image">
        <div class="sb-container">
          <img src="https://placehold.co/760x380/1e232c/ffb347?text=Your+image" alt="" data-img />
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
