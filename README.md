# 🦂 Scorpion — Website Builder

A zero-dependency, browser-based **visual website builder**. Drag blocks onto a
canvas, edit text and images inline, and export a clean, standalone HTML page you
can host anywhere. Everything runs client-side — no build step, no server.

## Features

- **Drag-and-drop blocks** — Hero, Heading, Text, Features, Image, Call-to-action, Footer
- **Click-to-append** — click a block in the palette to add it to the bottom
- **Inline editing** — click any text to edit it directly on the canvas
- **Image replacement** — click an image to set its URL
- **Reorder / duplicate / delete** — per-block toolbar plus `Delete` key
- **Autosave** — your page is saved to `localStorage` as you work
- **Live preview** — see the exported page in an isolated iframe
- **Export** — download a single, self-contained `.html` file (styles inlined)

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
