# hyperfx DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 20 · Fonts: 3 · Components: 9
> Icon library: not detected · State: not detected
> Primary theme: light · Dark mode toggle: yes · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![hyperfx Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **light-themed** interface with a neutral, approachable feel. The light background emphasizes content clarity. Typography pairs **Geist** for display/headings with **Inter** for body text, creating clear visual hierarchy through type contrast. Spacing follows a **4px base grid** (compact density), with scale: 2, 4, 6, 8, 10, 12, 14, 16px. Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| color-white | `#ffffff` | background | Page background, darkest surface |
| color-teal-50 | `#f0fdfa` | surface | Card and panel backgrounds |
| color-zinc-900 | `#111111` | text-primary | Headings and body text |
| color-zinc-500 | `#777777` | text-muted | Captions, placeholders, secondary info |
| color-zinc-800 | `#2a2a2a` | border | Dividers, card borders, outlines |
| color-red-100 | `#ffe2e2` | danger | Error states, destructive actions |
| color-emerald-500 | `#00bb7f` | success | Success states, positive indicators |
| warning | `#22170b` | warning | Warning states, caution indicators |
| info | `#0081f2` | info | Informational highlights |
| color-green-50 | `#f0f0f0` | unknown | Palette color |
| color-zinc-200 | `#e4e4e7` | unknown | Palette color |
| color-gray-300 | `#d1d5dc` | unknown | Palette color |
| color-zinc-400 | `#9f9fa9` | unknown | Palette color |
| color-black | `#000000` | unknown | Palette color |
| color-gray-500 | `#6a7282` | unknown | Palette color |
| theme-color | `#1c1c1c` | unknown | Palette color |
| color-slate-700 | `#314158` | unknown | Palette color |
| color-gray-600 | `#4a5565` | unknown | Palette color |
| color-orange-50 | `#fff7ed` | unknown | Palette color |
| color-sky-200 | `#b8e6fe` | unknown | Palette color |

### Dark Mode Token Mapping

| Variable | Light | Dark |
|---|---|---|
| `--background` | `#fafafa` | `lab(2.75381% 0 0)` |
| `--foreground` | `lab(2.75381% 0 0)` | `lab(98.26% 0 0)` |
| `--text-strong` | `#0a0a0a` | `#fafafa` |
| `--text-default` | `#111827` | `#e5e7eb` |
| `--text-muted` | `#4b5563` | `#9ca3af` |
| `--text-soft` | `#6b7280` | `#7d8693` |
| `--text-subtle` | `#9ca3af` | `#6b7280` |
| `--card` | `lab(100% 0 0)` | `lab(7.78201% -.0000149012 0)` |
| `--card-foreground` | `lab(2.75381% 0 0)` | `lab(98.26% 0 0)` |
| `--popover` | `lab(100% 0 0)` | `lab(7.78201% -.0000149012 0)` |
| `--popover-foreground` | `lab(2.75381% 0 0)` | `lab(98.26% 0 0)` |
| `--primary` | `lab(7.78201% -.0000149012 0)` | `lab(90.952% 0 -.0000119209)` |
| `--primary-foreground` | `lab(98.26% 0 0)` | `lab(7.78201% -.0000149012 0)` |
| `--secondary` | `lab(96.52% -.0000298023 .0000119209)` | `lab(15.204% 0 -.00000596046)` |
| `--secondary-foreground` | `lab(7.78201% -.0000149012 0)` | `lab(98.26% 0 0)` |
| `--muted` | `lab(94.2% 0 0)` | `lab(15.204% 0 -.00000596046)` |
| `--muted-foreground` | `lab(37.36% .0000149012 -.00000596046)` | `lab(66.128% -.0000298023 .0000119209)` |
| `--accent` | `lab(96.52% -.0000298023 .0000119209)` | `lab(15.204% 0 -.00000596046)` |
| `--accent-foreground` | `lab(7.78201% -.0000149012 0)` | `lab(98.26% 0 0)` |
| `--destructive` | `lab(48.4493% 77.4328 61.5452)` | `lab(63.7053% 60.745 31.3109)` |

### CSS Variable Tokens

```css
--color-background: var(--background);
--color-foreground: var(--foreground);
--color-border: var(--border);
--color-muted: var(--muted);
--color-secondary: var(--secondary);
--color-primary: var(--primary);
--color-card: var(--card);
--tw-prose-quote-borders: #e5e7eb;
--tw-prose-th-borders: #d1d5dc;
--tw-prose-td-borders: #e5e7eb;
--tw-prose-invert-quote-borders: #364153;
--tw-prose-invert-th-borders: #4a5565;
--tw-prose-invert-td-borders: #364153;
--tw-prose-quote-borders: lab(91.6229% -.159115-2.26791);
--tw-prose-th-borders: lab(85.1236% -.612259-3.7138);
--tw-prose-td-borders: lab(91.6229% -.159115-2.26791);
--tw-prose-invert-quote-borders: lab(27.1134% -.956401-12.3224);
--tw-prose-invert-th-borders: lab(35.6337% -1.58697-10.8425);
--tw-prose-invert-td-borders: lab(27.1134% -.956401-12.3224);
--tw-border-spacing-x: calc(var(--spacing)*4);
```


---

## 3. Typography Rules

**Font Stack:**
- **Inter** — Heading 1, Heading 2, Heading 3
- **Geist** — Body, Caption
- **Geist Mono** — Code

**Font Sources:**

```css
@font-face {
  font-family: "Geist";
  src: url("https://www.hyperfx.ai/_next/static/media/fef07dbb0973bf53.518e079e.woff2") format("woff2");
  font-weight: 100;
}
@font-face {
  font-family: "Geist Mono";
  src: url("https://www.hyperfx.ai/_next/static/media/5ce348bf30bf5439.56c1f21e.woff2") format("woff2");
  font-weight: 100;
}
@font-face {
  font-family: "Inter";
  src: url("https://www.hyperfx.ai/_next/static/media/a440747434783fbe.bbfb9501.woff2") format("woff2");
  font-weight: 100;
}
@font-face {
  font-family: "Inter Tight";
  src: url("https://www.hyperfx.ai/_next/static/media/13ae3e01af63c0ce.3ec27879.woff2") format("woff2");
  font-weight: 100;
}
@font-face {
  font-family: "DM Sans";
  src: url("https://www.hyperfx.ai/_next/static/media/c3cb240f9c892514.d8e4bce2.woff2") format("woff2");
  font-weight: 100;
}
@font-face {
  font-family: "Manrope";
  src: url("https://www.hyperfx.ai/_next/static/media/a342834df7752944.bb140f9f.woff2") format("woff2");
  font-weight: 200;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | Inter | 80px | 700 |
| Heading 2 | Inter | 72px | 700 |
| Heading 3 | Inter | 68px | 700 |
| Body | Geist | 13px | 400 |
| Caption | Geist | 20px | 400 |
| Code | Geist Mono | 14px | 400 |

**Typographic Rules:**
- Limit to 3 font families max per screen
- Use **Inter** for body/UI text, **Geist** for display/headings
- Maintain consistent hierarchy: no more than 3-4 font sizes per screen
- Headings use bold (600-700), body uses regular (400)
- Line height: 1.5 for body text, 1.2 for headings
- Use color and opacity for secondary hierarchy, not additional font sizes


---

## 4. Component Stylings

### Layout (1)

**Footer** — `html`

### Navigation (1)

**Navigation** — `html`

### Data Display (2)

**Card** — `html`

**List** — `html`

### Data Input (2)

**Button** — `html`
- Animation: 

**Input** — `html`
- State: :focus, :placeholder

### Media (3)

**Image** — `html`

**Icon** — `html`

**Map/Canvas** — `html`



---

## 5. Layout Principles

- **Base spacing unit:** 4px
- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24
- **Border radius:** .25rem, .3125rem, .375rem, 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 14px, 16px, 18px, 20px, 24px, inherit
- **Max content width:** 1200px

**Spacing as Meaning:**
| Spacing | Use |
|---|---|
| 4-8px | Tight: related items within a group |
| 12-16px | Medium: between groups |
| 24-32px | Wide: between sections |
| 48px+ | Vast: major section breaks |


---

## 6. Depth & Elevation

### Raised — cards, buttons, interactive elements

- `0 0 0 1px rgb(var(--tw-prose-kbd-shadows)/10%),0 3px 0 rgb(var(--tw-prose-kbd-shadows)/10%)`

### Z-Index Scale

`0, 1, 2, 10, 19, 20, 30, 50, 60, 100, 9999`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes hero-logo-strip-fade-in`
- `@keyframes slide-up-fade`
- `@keyframes scroll-slow`
- `@keyframes spin`
- `@keyframes ping`
- `@keyframes pulse`
- `@keyframes enter`
- `@keyframes exit`

### Animated Components

- **Button**: 

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#ffffff` as the primary page background
- Pair **Inter** (body) with **Geist** (display) — these are the only allowed fonts
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: .25rem, .3125rem, .375rem, 1px, 2px
- Reuse existing components from Section 4 before creating new ones
- Always use CSS variables for colors — never hardcode hex
- Test both light and dark modes for contrast

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't introduce additional font families beyond Inter and Geist and Geist Mono
- Don't use arbitrary spacing values — stick to multiples of 4px
- Don't create custom box-shadow values outside the system tokens
- Don't use arbitrary border-radius values — pick from the defined scale
- Don't duplicate component patterns — check Section 4 first
- Don't use backdrop-blur or blur effects

### Anti-Patterns (detected from codebase)

- No blur or backdrop-blur effects
- No zebra striping on tables/lists


---

## 9. Responsive Behavior

| Name | Value | Source |
|---|---|---|
| sm | 40rem | css |
| md | 48rem | css |
| lg | 64rem | css |
| xl | 80rem | css |
| 2xl | 96rem | css |
| lg | 900px | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #f0fdfa
Border: 1px solid #2a2a2a
Radius: 9px
Padding: 16px
Font: Inter
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg var(--accent), text white
Ghost: bg transparent, border #2a2a2a
Padding: 8px 16px
Radius: 9px
Hover: opacity 0.9 or lighter shade
Focus: ring with var(--accent)
```

### Build a Page Layout

```
Background: #ffffff
Max-width: 1200px, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #f0fdfa
Label: #777777 (muted, 12px, uppercase)
Value: #111111 (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #ffffff
Input border: 1px solid #2a2a2a
Focus: border-color var(--accent)
Label: #777777 12px
Spacing: 16px between fields
Radius: 9px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: Inter, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```
