# UI Tweaks Reference
> Safe places to adjust colours, fonts, and sizes. Every entry here uses
> the `var(--)` token system or is a single isolated value — one change
> ripples everywhere it should, nothing breaks.
>
> ⚠️ If it is not listed here, don't touch it.

---

## 1 · Design Tokens — the master dial

**File:** `css/bitxapp-base.css`
**Lines:** 68 – 117 (`:root { }` block)

This is the single source of truth for the entire app's look.
Change a value once → every component that uses `var(--x)` updates automatically.

### 1a · Dark theme (default)

| Token | Line | Current value | What it colours |
|---|---|---|---|
| `--bg` | 70 | `#06090f` | Outermost page background |
| `--surf` | 71 | `#0b1120` | Cards, topbar, sidebar, modals |
| `--surf2` | 72 | `#101928` | Hover rows, secondary panels |
| `--surf3` | 73 | `#162034` | Nested backgrounds, inputs |
| `--b1` | 76 | `#162038` | Subtle borders and dividers |
| `--b2` | 77 | `#1e2f4a` | Stronger borders, button outlines |
| `--text` | 80 | `#e4ecff` | Primary text everywhere |
| `--text2` | 81 | `#a0b3d4` | Secondary / label text |
| `--muted` | 82 | `#6b7fa2` | Placeholder, hint, icon text |
| `--dim` | 83 | `#3d5170` | Table headers, very faint text |
| `--blue` | 86 | `#5b9cff` | Active states, links, primary accent |
| `--green` | 87 | `#00dba8` | Gains, success, live indicators |
| `--red` | 88 | `#ff3d5a` | Losses, errors, destructive actions |
| `--amber` | 89 | `#ffaa20` | Warnings, pending, Ember accent |
| `--purple` | 90 | `#a07cf8` | Secondary accent |
| `--orange` | 91 | `#ff9848` | Current-price markers |
| `--violet` | 92 | `#8b5cf6` | Aurora glow (background fx only) |
| `--teal` | 93 | `#14d9c5` | Aurora glow (background fx only) |
| `--blue-bg` | 94 | `rgba(91,156,255,0.09)` | Blue-tinted chip / badge fills |

### 1b · Light theme overrides

**File:** `css/bitxapp-base.css`
**Lines:** 123 – 150 (`[data-theme="light"] { }` block)

Same token names, different values. Only tokens that actually change
from the dark theme need to be here — everything else inherits.

| Token | Line | Current value |
|---|---|---|
| `--bg` | 125 | `#f0f4fb` |
| `--surf` | 126 | `#ffffff` |
| `--surf2` | 127 | `#f7f9fe` |
| `--surf3` | 128 | `#eef2fa` |
| `--b1` | 131 | `#dde5f5` |
| `--b2` | 132 | `#c8d6ee` |
| `--blue` | 141 | `#2563eb` |
| `--green` | 142 | `#059669` |
| `--red` | 143 | `#dc2626` |
| `--amber` | 144 | `#b45309` |
| `--purple` | 145 | `#7c3aed` |
| `--orange` | 146 | `#c2410c` |

> Text tokens (`--text`, `--text2`, `--muted`, `--dim`) are the same
> in both themes and only defined once in `:root`.

---

## 2 · Spacing & Radius tokens

**File:** `css/bitxapp-base.css`
**Lines:** 101 – 110 (inside `:root`)

These feed button corners, card roundness, and paddings across every module.

| Token | Line | Value | Used for |
|---|---|---|---|
| `--radius-xs` | 101 | `4px` | Tiny chips, badges |
| `--radius-sm` | 102 | `6px` | Buttons, small inputs |
| `--radius-md` | 103 | `10px` | Cards, modals |
| `--radius-lg` | 104 | `14px` | Large panels |
| `--radius-xl` | 105 | `18px` | KPI cards, drawers |
| `--space-xs` | 106 | `6px` | Tight gaps |
| `--space-sm` | 107 | `10px` | Standard inner padding |
| `--space-md` | 108 | `16px` | Section padding |
| `--space-lg` | 109 | `22px` | Module-level gaps |
| `--space-xl` | 110 | `32px` | Large section spacing |

---

## 3 · Fonts

### 3a · Font tokens (which font is used)

**File:** `css/bitxapp-base.css`
**Lines:** 97 – 98 (inside `:root`)

```css
--font-ui:   'DM Sans', system-ui, sans-serif;   /* all UI text */
--font-mono: 'DM Mono', 'Courier New', monospace; /* numbers, prices, code */
```

To swap the UI font, change the value here **and** update the Google Fonts
`<link>` in `index.html` line 11 to load the new family.

### 3b · Google Fonts loader

**File:** `index.html`
**Line:** 11

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900
            &family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
```

Add a new `&family=…` segment here to load additional font families,
then reference them in the token above.

### 3c · Global base font size

**File:** `css/bitxapp-base.css`
**Line:** 189 — `font-size: 15px;` (inside `body { }`)

This is the root `em` reference. Making it larger scales most of the UI
proportionally because many components use `em`-relative sizing.

---

## 4 · App logo / title gradient

**File:** `css/bitxapp-base.css`
**Line:** 1457

```css
background: linear-gradient(135deg, #4f8ef7 0%, #8b5cf6 100%);
```

The two hex values are the start and end colour of the "BiT PleB" text gradient
in the topbar. Change either stop, the angle (`135deg`), or both.

---

## 5 · Ambient background glow

**File:** `css/bitxapp-base.css`
**Lines:** 197 – 200 (inside `body::before { }`)

```css
radial-gradient(ellipse 70% 40% at 20% -10%, rgba(79,142,247,0.08) …),
radial-gradient(ellipse 50% 30% at 80% 100%, rgba(139,92,246,0.06) …)
```

These are the subtle blue and violet glows behind everything.
Safe to adjust: the `rgba` opacity value (last number in each `rgba()`).
Raise it to make the glow more vivid, lower it to make the background flatter.
Leave the position (`at 20% -10%`) and size (`70% 40%`) alone.

---

## 6 · Shell dimensions

### Topbar height
**File:** `css/bitxapp-base.css` · **Line:** 1444 — `height: 62px`

### Sidebar width
**File:** `css/bitxapp-base.css` · **Line:** 1476 — `width: 88px`

### Module sub-header height
**File:** `css/bitxapp-base.css` · **Line:** 1727 — `height: 52px` (inside `.mod-header`)

---

## 7 · Portfolio KPI card numbers

**File:** `css/bitxapp-base.css`
**Line:** 430

```css
.kpi-val { font-size: 24px; … }
```

The large metric values on the Overview tab. Subtitle below them:
**Line:** 433 — `.kpi-sub { font-size: 13px; … }`

---

## 8 · Ember highlight text sizes

Both values are currently `16px` so Library, Books, and Daily all match.
Change them together to keep parity, or independently for a deliberate difference.

| Context | File | Line | Property |
|---|---|---|---|
| Library / Books (card view) | `css/modules/ember.css` | 1187 | `font-size: 16px` |
| Daily / Review (full-card view) | `css/modules/ember.css` | 1479 | `font-size: 16px` |
| Daily / Review on small screens | `css/modules/ember.css` | 1993 | `font-size: 16px` |

Line-height for both is `1.75` on the line immediately below each `font-size`.

---

## 9 · Quick example — darken the whole dark theme

Open `css/bitxapp-base.css`, find `:root` (line 68), change:

```css
--bg:    #06090f;   →  #020408   /* even darker page */
--surf:  #0b1120;   →  #080e1a   /* darker cards */
```

Reload. Every card, sidebar, and modal updates.
No JavaScript touched, no class renamed, nothing breaks.
