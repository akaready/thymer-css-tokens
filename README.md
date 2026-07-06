# Thymer CSS tokens

A machine-readable catalog of **CSS custom properties** for every built-in Thymer theme.

> **This is a community resource, not a plugin.** Installable plugins live in separate `thymer-<name>` repos (e.g. [thymer-collection-colors](https://github.com/akaready/thymer-collection-colors)). This repo is JSON + a refresh script only.

The [Thymer plugin SDK](https://github.com/thymerapp/thymer-plugin-sdk) does not document UI CSS variables. Plugin authors still need to know what Thymer exposes — `--text-default`, `--logo-color`, `--enum-blue-fg`, and hundreds more. This repo rips those definitions directly from Thymer's shipped stylesheet so you don't have to guess or scrape the DOM.

**Public repo:** [github.com/akaready/thymer-css-tokens](https://github.com/akaready/thymer-css-tokens)  
**Maintained from:** [thymer-plugins](https://github.com/akaready/thymer-plugins) (`library/css-tokens/`)

---

## What's in here

| File | Contents |
|------|----------|
| `thymer-themes.index.json` | Manifest — theme ids, rip date, appearance |
| `<theme-id>.json` | Full `--*` variable list for one theme (e.g. `thymer-dark-neon-noir.json`) |
| `rip-theme-tokens.mjs` | Refresh tool (Node 18+, no dependencies) |

**15 themes** at last rip (matches `data-theme=*` in Thymer's app CSS):

`thymer-light` · `thymer-light-sans` · `thymer-light-paper` · `thymer-light-warm-sans` · `thymer-light-dark` · `thymer-dark` · `thymer-dark-sans` · `thymer-dark-paper` · `thymer-dark-night` · `thymer-dark-neon-noir` · `thymer-dark-tokyo-techno` · `thymer-dark-early-ember` · `thymer-dark-basalt-bedrock` · `basic-light-omarchy-auto` · `basic-dark-omarchy-auto`

---

## Source (how this is built)

Thymer ships one hashed stylesheet (`css/app-<HASH>.css`) from its web app. The hash changes every deploy — this library stores **when** tokens were ripped, not which build file was used. To refresh, run the rip script against any Thymer origin you can reach (e.g. `https://app.thymer.com`).

Themes are CSS selector blocks:

```css
html[data-theme=thymer-light] { --text-default: …; }
html.basic-light, html[data-theme=thymer-light], … { --logo-color: …; }
```

We parse those blocks — **not** `getComputedStyle()` from a live tab. That avoids plugin-injected vars (`--tps-*`) and DOM noise.

---

## Use the data

### Lookup a variable

```js
import thymerDark from './thymer-dark.json' with { type: 'json' };

const accent = thymerDark.variables.find((v) => v.name === '--logo-color')?.value;
// → "#04d1ab" (or var(...) chain — definitions, not always resolved hex)
```

### Plugin CSS

Map your panel tokens to Thymer's real names:

```css
.my-plugin-panel {
  color: var(--text-default);
  background: var(--panel-bg-color);
  border-color: var(--divider-color);
  accent-color: var(--logo-color);
}
```

### Compare themes

```bash
jq '.variables[] | select(.name == "--logo-color")' thymer-*.json
```

---

## JSON shape

```json
{
  "source": "thymer-css",
  "rippedAt": "July 6, 2026",
  "themeId": "thymer-light",
  "appearance": "light",
  "variables": [
    { "name": "--text-default", "value": "var(--color-text-400)" },
    { "name": "--logo-color", "value": "#03b093" }
  ],
  "stats": {
    "totalVariables": 879,
    "colorVariables": 471
  }
}
```

Index (`thymer-themes.index.json`):

```json
{
  "rippedAt": "July 6, 2026",
  "themeCount": 15,
  "availableThemes": ["thymer-light", "thymer-dark", "..."],
  "rips": [
    { "themeId": "thymer-light", "appearance": "light", "rippedAt": "...", "stats": { "totalVariables": 879, "colorVariables": 471 } }
  ]
}
```

Values are **CSS source text** — often `var(--color-text-400)` rather than a hex. That's intentional; it's what Thymer's stylesheet actually says.

---

## Refresh locally

```bash
npm run rip
# or
node rip-theme-tokens.mjs --all --quiet
node rip-theme-tokens.mjs --theme thymer-dark-neon-noir
node rip-theme-tokens.mjs --base https://app.thymer.com --save-css
```

From the monorepo root:

```bash
npm run rip:theme-tokens
```

Re-run after Thymer updates, then commit the new JSON files.

---

## What this is not

- **Not Thymer's CSS file** — only extracted variable names/values; Thymer's stylesheet remains their IP.
- **Not resolved runtime colors** — no `color-mix` / `var()` expansion.
- **Not your Custom CSS** — workspace overrides are separate.
- **Not plugin tokens** — `--tps-*` from third-party plugins are excluded by design.

---

## Contributing

Improvements to the ripper or docs: open a PR on [thymer-plugins](https://github.com/akaready/thymer-plugins). This mirror auto-syncs from `library/css-tokens/` on push to `main`.

---

## License

MIT — see [LICENSE](LICENSE). Thymer itself and its stylesheet are © Thymer; this repo documents public CSS custom property names for interoperability.
