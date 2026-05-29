# /mocks

Central source for all design mocks in Gorilla. Every visual exploration — design system directions, individual screens, redesigns, design reviews — lives under this directory going forward.

## Run

```bash
npm run mocks
```

Serves the directory at `http://localhost:5050`. Open `/` for the index, or any subdirectory's HTML file directly.

## Conventions

- One folder per exploration (`NN-name/`, e.g. `01-inkwell`, `12-segment-builder`).
- Each mock is a **single self-contained `.html` file**: inline `<style>`, inline SVG icons, Google Fonts via `<link>` is the only external allowed.
- No CSS frameworks (no Tailwind, no Bootstrap). No JS frameworks. Mocks are static.
- New mocks register themselves in `index.html` so they're discoverable from the landing page.

### Theming

- **Chrome / navigation / index / utility pages** use the canonical **light theme**. Tokens live in `index.html`'s `:root` block — copy them when building a new utility page so all chrome reads as one system:

  ```css
  --bg:        #FAFAFB;   /* page */
  --surface:   #FFFFFF;   /* card */
  --surface-2: #F4F5F7;   /* hover / inset */
  --ink:       #0F1115;
  --ink-soft:  #5A6068;
  --ink-dim:   #8B919E;
  --rule:      #E5E7EB;
  --rule-strong: #D1D5DB;
  ```

  Type: **Inter** for UI, **JetBrains Mono** for tabular numerals and metadata. Both via Google Fonts.

- **Direction mocks** (each `NN-name/` folder) define their own themes — that's their job. They are exempt from the light-theme rule.

## Current explorations

### Direction locked: Pop

Hot coral as architectural color. Manrope display + Inter body + JetBrains Mono numerals. Brand identity is iron-gorilla (Fe = iron, element 26).

**Single source of truth:** [`_pop/tokens.css`](./_pop/tokens.css) — every Pop mock `<link>`s this file and consumes design values via `var(--…)` only. Color, type, space, radius, shadow, motion, and component tokens (`--btn-primary-bg`, `--field-border-focus`, etc.) all live there. Change a token, all downstream Pop mocks update.

### Pop surfaces

| # | Surface | Route | Notes |
|---|---|---|---|
| 07 | [Marketing homepage](./07-pop-home/index.html) | `/` | Iron-gorilla brand identity. Hero in coral band, feature trio, dark inverted final CTA. |
| 08 | [Sign up](./08-pop-signup/index.html) | `/signup` | Two-column split. Form left, value-prop panel right. Pre-rendered validated state. |

### Direction explorations · archived

The six direction round before Pop was locked. Kept for reference; not extended.

| # | Direction | Pitch |
|---|---|---|
| 01 | [Apollo](./01-apollo/campaign-report.html) | Confident modern tech. Indigo accent. |
| 02 | [Tide](./02-tide/campaign-report.html) | Premium calm. Cool ocean blue. |
| 03 | [Pop](./03-pop/campaign-report.html) | **Chosen direction.** Campaign report mock. |
| 04 | [Vapor](./04-vapor/campaign-report.html) | AI-futurist. Aurora gradient. Dark. |
| 05 | [Press](./05-press/campaign-report.html) | Modern editorial. Fraunces serif. |
| 06 | [Tower](./06-tower/campaign-report.html) | Architectural slab. Ink borders. Safety orange. |
