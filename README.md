# 🦂 Scorpion — Website Builder

A zero-dependency, browser-based **visual website builder**. Drag blocks onto a
canvas, edit text and images inline, and export a clean, standalone HTML page you
can host anywhere. Everything runs client-side — no build step, no server.

## Features

- **14 drag-and-drop blocks** — Nav bar, Hero, Split (text + image), Heading, Text,
  Features, Logo strip, Stats, Image, Gallery, Quote/testimonial, Pricing,
  Call-to-action, Footer
- **Click-to-append** — click a block in the palette to add it to the bottom
- **Inline editing** — click any text to edit it directly on the canvas
- **Editable images & links** — click an image to set its URL; per-block 🔗 action
  sets real button hrefs
- **Reorder / duplicate / delete** — per-block toolbar plus `Delete` key
- **Undo / redo** — full history stack, with `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`
- **Autosave** — your page is saved to `localStorage` as you work
- **Live preview** — see the exported page in an isolated iframe
- **Export** — download a single, self-contained `.html` file: styles inlined,
  inline SVG image placeholders, and a scroll-reveal script that respects
  `prefers-reduced-motion`

The visual system (typography, palette, spacing, motion) is defined in
[`DESIGN_DNA.md`](./DESIGN_DNA.md) and expressed in `BLOCK_CSS`.

## Run it

No install required. Open `index.html` in a browser:

```bash
# from the project root
python3 -m http.server 8000
# then visit http://localhost:8000
```

Or just double-click `index.html`.

## Project structure

| File          | Purpose                                                            |
| ------------- | ----------------------------------------------------------------- |
| `index.html`  | App shell: top bar, palette, canvas, preview modal                |
| `styles.css`  | Editor (chrome) styling                                            |
| `blocks.js`   | Block library + `BLOCK_CSS` (content styles used in-app & export) |
| `builder.js`  | Runtime: drag/drop, editing, autosave, export, preview            |

## How export works

The canvas is cloned, editor-only nodes (toolbars, `contenteditable`, selection
state) are stripped, and the result is wrapped in a minimal HTML document with
`BLOCK_CSS` inlined in a `<style>` tag. What you see on the canvas is what ships.

## Roadmap

- Undo / redo history
- More blocks (gallery, pricing table, form)
- Theme presets (colors & fonts)
- Direct publish targets

---

Built iteratively with a Fable 5 review agent checking each pass for bugs.
