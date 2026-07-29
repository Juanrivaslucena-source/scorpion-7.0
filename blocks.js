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
  .sb-section { padding: 64px 32px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .sb-container { max-width: 760px; margin: 0 auto; }
  .sb-hero { text-align: center; background: linear-gradient(135deg, #1e232c 0%, #ff7a45 140%); color: #fff; padding: 96px 32px; }
  .sb-hero h1 { font-size: 44px; margin: 0 0 16px; line-height: 1.1; }
  .sb-hero p { font-size: 19px; margin: 0 0 28px; opacity: 0.92; }
  .sb-btn { display: inline-block; background: #ff7a45; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .sb-heading h2 { font-size: 32px; margin: 0 0 12px; }
  .sb-text p { font-size: 17px; line-height: 1.7; color: #333; margin: 0; }
  .sb-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 960px; margin: 0 auto; }
  .sb-feature { text-align: center; padding: 16px; }
  .sb-feature .sb-ico { font-size: 34px; }
  .sb-feature h3 { font-size: 18px; margin: 12px 0 8px; }
  .sb-feature p { font-size: 15px; color: #555; line-height: 1.6; margin: 0; }
  .sb-image img { max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 8px; }
  .sb-cta { text-align: center; background: #171a21; color: #fff; }
  .sb-cta h2 { font-size: 30px; margin: 0 0 12px; }
  .sb-cta p { font-size: 17px; opacity: 0.85; margin: 0 0 24px; }
  .sb-footer { text-align: center; background: #0f1115; color: #9aa3b2; padding: 32px; font-size: 14px; }
  .sb-footer a { color: #ffb347; text-decoration: none; }
  @media (max-width: 640px) {
    .sb-features { grid-template-columns: 1fr; }
    .sb-hero h1 { font-size: 32px; }
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
