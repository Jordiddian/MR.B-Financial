---
name: albert-design
description: Design system skill for albert. Activate when building UI components, pages, or any visual elements. Provides exact color tokens, typography scale, spacing grid, component patterns, and craft rules. Read references/DESIGN.md before writing any CSS or JSX.
---

# albert Design System

You are building UI for **albert**. Light-themed, warm palette, sans-serif typography (SharpSansDisplayNo1), compact density on a 4px grid, expressive motion.

## Visual Reference

**IMPORTANT**: Study ALL screenshots below before writing any UI. Match colors, typography, spacing, layout, and motion exactly as shown.

### Homepage

![albert Homepage](screenshots/homepage.png)

> Read `references/DESIGN.md` for full token details.

## Design Philosophy

- **Layered depth** — use shadow tokens to create a sense of physical layering. Each elevation level has a specific shadow.
- **Gradient accents** — gradients are used thoughtfully for emphasis, not decoration.
- **Type pairing** — SharpSansDisplayNo1 for body/UI text, SharpSansDispNo1-Medium for headings/display. Never introduce a third typeface.
- **compact density** — 4px base grid. Every dimension is a multiple of 4.
- **warm palette** — the color temperature runs warm, matching the sans-serif typography.
- **Restrained accent** — `#ceff00` is the only pop of color. Used exclusively for CTAs, links, focus rings, and active states.
- **Expressive motion** — animations are an integral part of the experience. Use spring physics and layout animations.

## Color System

### Core Palette

| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Background | `--background` | `#ffffff` | Page/app background |
| Text Primary | `--text-primary` | `#000000` | Headings, body text |
| Text Muted | `--text-muted` | `#98a2b3` | Captions, placeholders |
| Accent | `--accent` | `#ceff00` | CTAs, links, focus rings |
| Border | `--border` | `#40464d` | Dividers, card borders |

### Extended Palette

- `#394cff`
- `#dddddd`
- `#f0f0f0` — Light surface or highlight color
- `#0783be`
- `#001b56`
- `#00b4ff`
- `#667085`
- `#969696`

## Typography

### Font Stack

- **SharpSansDisplayNo1** — Heading 1, Heading 2, Heading 3
- **SharpSansDispNo1-Medium** — Body, Caption
- **Courier 10 Pitch** — Code

### Font Sources

```css
@font-face {
  font-family: "SharpSansDisplayNo1-Semibold";
  src: url("fonts/SharpSansDisplayNo1-Semibold-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Bold";
  src: url("fonts/SharpSansDisplayNo1-Bold-Regular.otf") format("opentype");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Medium";
  src: url("fonts/SharpSansDisplayNo1-Medium-Regular.otf") format("opentype");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Thin";
  src: url("fonts/SharpSansDisplayNo1-Thin-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Book";
  src: url("fonts/SharpSansDisplayNo1-Book-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Light";
  src: url("fonts/SharpSansDisplayNo1-Light-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDispNo1-Medium";
  src: url("fonts/SharpSansDispNo1-Medium-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDispNo1-Semibold";
  src: url("fonts/SharpSansDispNo1-Semibold-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDispNo1-Bold";
  src: url("fonts/SharpSansDispNo1-Bold-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDispNo1";
  src: url("fonts/SharpSansDispNo1-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "dashicons";
  src: url("https://albert.ai/wp-includes/fonts/dashicons.eot?99ac726223c749443b642ce33df8b800");
  font-weight: 400;
}
```

### Type Scale

| Role | Family | Size | Weight |
|------|--------|------|--------|
| Heading 1 | SharpSansDisplayNo1 | 4.8rem | 700 |
| Heading 2 | SharpSansDisplayNo1 | 50px | 700 |
| Heading 3 | SharpSansDisplayNo1 | 48px | 700 |
| Body | SharpSansDispNo1-Medium | 18px | 400 |
| Caption | SharpSansDispNo1-Medium | 12px | 400 |
| Code | Courier 10 Pitch | 14px | 400 |

### Typography Rules

- Body/UI: **SharpSansDisplayNo1**, Headings: **SharpSansDispNo1-Medium** — these are the only display fonts
- Max 3-4 font sizes per screen
- Headings: weight 600-700, body: weight 400
- Use color and opacity for text hierarchy, not additional font sizes
- Line height: 1.5 for body, 1.2 for headings

## Spacing & Layout

### Base Grid: 4px

Every dimension (margin, padding, gap, width, height) must be a multiple of **4px**.

### Spacing Scale

`2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24` px

### Spacing as Meaning

| Spacing | Use |
|---------|-----|
| 4-8px | Tight: related items (icon + label, avatar + name) |
| 12-16px | Medium: between groups within a section |
| 24-32px | Wide: between distinct sections |
| 48px+ | Vast: major page section breaks |

### Border Radius

Scale: `1.5em, 2em, 2px, 8px, inherit, 1px, 3px, 4px, 5px, 6px, 10px, 12px, 15px, 40px, 100%, 100px, 120px`
Default: `5px`

### Container

Max-width: `1080px`, centered with auto margins.

### Breakpoints

| Name | Value |
|------|-------|
| xs | 480px |
| sm | 600px |
| sm | 640px |
| md | 767px |
| md | 768px |
| lg | 781px |
| lg | 782px |
| lg | 850px |
| lg | 880px |
| lg | 900px |
| lg | 1000px |
| lg | 1024px |
| xl | 1025px |
| xl | 1080px |
| xl | 1200px |
| xl | 1250px |
| 2xl | 1399px |
| 2xl | 1400px |
| 2xl | 1600px |

Mobile-first: design for small screens, layer on responsive overrides.

## Component Patterns

### Card

```css
.card {
  background: #ffffff;
  border: 1px solid #40464d;
  border-radius: 5px;
  padding: 16px;
  box-shadow: 0 3px 3px rgba(0,0,0,0.2);
}
```

```html
<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here.</p>
</div>
```

### Button

```css
/* Primary */
.btn-primary {
  background: #ceff00;
  color: #000000;
  border-radius: 5px;
  padding: 8px 16px;
  font-weight: 500;
  transition: opacity 150ms ease;
}
.btn-primary:hover { opacity: 0.9; }

/* Ghost */
.btn-ghost {
  background: transparent;
  border: 1px solid #40464d;
  color: #000000;
  border-radius: 5px;
  padding: 8px 16px;
}
```

```html
<button class="btn-primary">Get Started</button>
<button class="btn-ghost">Learn More</button>
```

### Input

```css
.input {
  background: #ffffff;
  border: 1px solid #40464d;
  border-radius: 5px;
  padding: 8px 12px;
  color: #000000;
  font-size: 14px;
}
.input:focus { border-color: #ceff00; outline: none; }
```

```html
<input class="input" type="text" placeholder="Search..." />
```

### Badge / Chip

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: #ffffff;
  color: #98a2b3;
}
```

```html
<span class="badge">New</span>
<span class="badge">Beta</span>
```

### Modal / Dialog

```css
.modal-backdrop { background: rgba(0, 0, 0, 0.6); }
.modal {
  background: #ffffff;
  border: 1px solid #40464d;
  border-radius: 120px;
  padding: 24px;
  max-width: 480px;
  width: 90vw;
  box-shadow: 0px 12px 16px -4px rgba(16,24,40,.08),0px 4px 6px -2px rgba(16,24,40,.03);
}
```

```html
<div class="modal-backdrop">
  <div class="modal">
    <h2>Dialog Title</h2>
    <p>Dialog content.</p>
    <button class="btn-primary">Confirm</button>
    <button class="btn-ghost">Cancel</button>
  </div>
</div>
```

### Table

```css
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 500;
  font-size: 12px;
  color: #98a2b3;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #40464d;
}
.table td {
  padding: 12px;
  border-bottom: 1px solid #40464d;
}
```

```html
<table class="table">
  <thead><tr><th>Name</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>
    <tr><td>Item One</td><td>Active</td><td>Jan 1</td></tr>
    <tr><td>Item Two</td><td>Pending</td><td>Jan 2</td></tr>
  </tbody>
</table>
```

### Navigation

```css
.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #40464d;
}
.nav-link {
  color: #98a2b3;
  padding: 8px 12px;
  border-radius: 5px;
  transition: color 150ms;
}
.nav-link:hover { color: #000000; }
.nav-link.active { color: #ceff00; }
```

```html
<nav class="nav">
  <a href="/" class="nav-link active">Home</a>
  <a href="/about" class="nav-link">About</a>
  <a href="/pricing" class="nav-link">Pricing</a>
  <button class="btn-primary" style="margin-left: auto">Get Started</button>
</nav>
```

### Extracted Components

These components were found in the codebase:

**List** (`html`)

## Page Structure

The following page sections were detected:

- **Navigation** — Top navigation bar (11 items)
- **Hero** — Hero/banner section with headline and CTAs
- **Faq** — FAQ/accordion section
- **Footer** — Page footer with links and info (11 items)

When building pages, follow this section order and structure.

## Animation & Motion

This project uses **expressive motion**. Animations are part of the design language.

### CSS Animations

- `show-content-image`
- `turn-on-visibility`
- `turn-off-visibility`
- `lightbox-zoom-in`
- `lightbox-zoom-out`

### Motion Tokens

- **Duration scale:** `0s`, `0ms`, `.1s`, `.15s`, `.2s`, `.25s`, `.3s`, `.35s`, `.4s`, `.45s`, `.5s`, `.55s`, `.6s`, `.65s`, `.7s`, `.75s`, `.8s`, `.85s`, `.9s`, `.95s`, `1ms`, `1s`, `1.05s`, `1.1s`, `1.15s`, `1.2s`, `1.25s`, `1.3s`, `1.35s`, `1.4s`, `1.45s`, `1.5s`, `1.55s`, `1.6s`, `1.65s`, `1.7s`, `1.75s`, `1.8s`, `1.85s`, `1.9s`, `1.95s`, `2s`, `2.05s`, `2.1s`, `2.15s`, `2.2s`, `2.25s`, `2.3s`, `2.35s`, `2.4s`, `2.45s`, `2.5s`, `2.55s`, `2.6s`, `2.65s`, `2.7s`, `2.75s`, `2.8s`, `2.85s`, `2.9s`, `2.95s`, `3s`, `50ms`, `100ms`, `200ms`, `250ms`, `300ms`, `400ms`, `450ms`, `500ms`, `1000ms`, `2000ms`
- **Easing functions:** `ease`, `linear`, `cubic-bezier(.25,.25,.75,.75)`, `ease-in`, `ease-out`, `ease-in-out`, `cubic-bezier(.6,-.28,.735,.045)`, `cubic-bezier(.175,.885,.32,1.275)`, `cubic-bezier(.68,-.55,.265,1.55)`, `cubic-bezier(.47,0,.745,.715)`, `cubic-bezier(.39,.575,.565,1)`, `cubic-bezier(.445,.05,.55,.95)`, `cubic-bezier(.55,.085,.68,.53)`, `cubic-bezier(.25,.46,.45,.94)`, `cubic-bezier(.455,.03,.515,.955)`
- **Animated properties:** `opacity`

### Motion Guidelines

- **Duration:** Use values from the duration scale above. Short (0s) for micro-interactions, long (2000ms) for page transitions
- **Easing:** Use `ease` as the default easing curve
- **Direction:** Elements enter from bottom/right, exit to top/left
- **Reduced motion:** Always respect `prefers-reduced-motion` — disable animations when set

## Depth & Elevation

### Shadow Tokens

- Subtle: `0 0 2px 2px rgba(0,0,0,0.6)`
- Subtle: `0 0 0 1px #4f94d4,0 0 2px 1px rgba(79,148,212,.8)`
- Subtle: `2px -2px 0px 0px currentColor`
- Subtle: `0 1px 1px rgba(0,0,0,.04)`
- Subtle: `0px 1px 2px rgba(16,24,40,.1)`
- Subtle: `0 0 0 1px #f9fafb`

### Z-Index Scale

`0, 1, 2, 4, 9, 99, 100, 700, 800, 801, 850, 998, 999, 1001, 1002, 1020, 1050, 1051, 9999, 59899, 99999, 100000, 159900, 160000, 900000, 900001, 900002, 999999, 2000000, 3000000, 5000000, 999999999, 9999999999`

Use these exact values — never invent z-index values.

## Anti-Patterns (Never Do)

- **No blur effects** — no backdrop-blur, no filter: blur()
- **No zebra striping** — tables and lists use borders for separation
- **No invented colors** — every hex value must come from the palette above
- **No arbitrary spacing** — every dimension is a multiple of 4px
- **No extra fonts** — only SharpSansDisplayNo1 and SharpSansDispNo1-Medium and Courier 10 Pitch are allowed
- **No arbitrary border-radius** — use the scale: 1.5em, 2em, 2px, 8px, 1px, 3px, 4px, 5px, 6px, 10px
- **No opacity for disabled states** — use muted colors instead

## Workflow

1. **Read** `references/DESIGN.md` before writing any UI code
2. **Pick colors** from the Color System section — never invent new ones
3. **Set typography** — SharpSansDisplayNo1, SharpSansDispNo1-Medium, Courier 10 Pitch only, using the type scale
4. **Build layout** on the 4px grid — check every margin, padding, gap
5. **Match components** to patterns above before creating new ones
6. **Apply elevation** — use shadow tokens
7. **Validate** — every value traces back to a design token. No magic numbers.

## Brand Spec

- **Favicon:** `https://albert.ai/wp-content/uploads/2023/04/cropped-Untitled-design-1-32x32.png`
- **Site URL:** `https://albert.ai`
- **Brand color:** `#ceff00`
- **Brand typeface:** SharpSansDisplayNo1

## Quick Reference

```
Background:     #ffffff
Surface:        (not extracted)
Text:           #000000 / #98a2b3
Accent:         #ceff00
Border:         #40464d
Font:           SharpSansDisplayNo1
Spacing:        4px grid
Radius:         5px
Components:     9 detected
```

## When to Trigger

Activate this skill when:
- Creating new components, pages, or visual elements for albert
- Writing CSS, Tailwind classes, styled-components, or inline styles
- Building page layouts, templates, or responsive designs
- Reviewing UI code for design consistency
- The user mentions "albert" design, style, UI, or theme
- Generating mockups, wireframes, or visual prototypes

---

# Full Reference Files

> Every output file is embedded below. Claude has full design system context from /skills alone.

## Design System Tokens (DESIGN.md)

# albert DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 20 · Fonts: 3 · Components: 9
> Icon library: not detected · State: not detected
> Primary theme: light · Dark mode toggle: no · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![albert Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **light-themed** interface with a warm, approachable feel. The light background emphasizes content clarity. Typography pairs **SharpSansDispNo1-Medium** for display/headings with **SharpSansDisplayNo1** for body text, creating clear visual hierarchy through type contrast. Spacing follows a **4px base grid** (compact density), with scale: 2, 4, 6, 8, 10, 12, 14, 16px. The palette is predominantly monochromatic with **#ceff00** as the single accent color — used sparingly for interactive elements and emphasis. Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| wp--preset--color--white | `#ffffff` | background | Page background, darkest surface |
| wp--preset--color--black | `#000000` | text-primary | Headings and body text |
| text-muted | `#98a2b3` | text-muted | Captions, placeholders, secondary info |
| border | `#40464d` | border | Dividers, card borders, outlines |
| accent | `#ceff00` | accent | CTAs, links, focus rings, active states |
| info | `#394cff` | info | Informational highlights |
| unknown | `#dddddd` | unknown | Palette color |
| unknown | `#f0f0f0` | unknown | Palette color |
| unknown | `#0783be` | unknown | Palette color |
| unknown | `#001b56` | unknown | Palette color |
| unknown | `#00b4ff` | unknown | Palette color |
| unknown | `#667085` | unknown | Palette color |
| unknown | `#969696` | unknown | Palette color |
| unknown | `#1e1f26` | unknown | Palette color |
| unknown | `#cccccc` | unknown | Palette color |
| unknown | `#d0d5dd` | unknown | Palette color |
| unknown | `#313131` | unknown | Palette color |
| unknown | `#0071a1` | unknown | Palette color |
| unknown | `#344054` | unknown | Palette color |
| unknown | `#bbbbbb` | unknown | Palette color |


---

## 3. Typography Rules

**Font Stack:**
- **SharpSansDisplayNo1** — Heading 1, Heading 2, Heading 3
- **SharpSansDispNo1-Medium** — Body, Caption
- **Courier 10 Pitch** — Code

**Font Sources:**

```css
@font-face {
  font-family: "SharpSansDisplayNo1-Semibold";
  src: url("fonts/SharpSansDisplayNo1-Semibold-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Bold";
  src: url("fonts/SharpSansDisplayNo1-Bold-Regular.otf") format("opentype");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Medium";
  src: url("fonts/SharpSansDisplayNo1-Medium-Regular.otf") format("opentype");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Thin";
  src: url("fonts/SharpSansDisplayNo1-Thin-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Book";
  src: url("fonts/SharpSansDisplayNo1-Book-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDisplayNo1-Light";
  src: url("fonts/SharpSansDisplayNo1-Light-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDispNo1-Medium";
  src: url("fonts/SharpSansDispNo1-Medium-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDispNo1-Semibold";
  src: url("fonts/SharpSansDispNo1-Semibold-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDispNo1-Bold";
  src: url("fonts/SharpSansDispNo1-Bold-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "SharpSansDispNo1";
  src: url("fonts/SharpSansDispNo1-Regular.woff") format("woff");
  font-weight: 400;
}
@font-face {
  font-family: "dashicons";
  src: url("https://albert.ai/wp-includes/fonts/dashicons.eot?99ac726223c749443b642ce33df8b800");
  font-weight: 400;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | SharpSansDisplayNo1 | 4.8rem | 700 |
| Heading 2 | SharpSansDisplayNo1 | 50px | 700 |
| Heading 3 | SharpSansDisplayNo1 | 48px | 700 |
| Body | SharpSansDispNo1-Medium | 18px | 400 |
| Caption | SharpSansDispNo1-Medium | 12px | 400 |
| Code | Courier 10 Pitch | 14px | 400 |

**Typographic Rules:**
- Limit to 3 font families max per screen
- Use **SharpSansDisplayNo1** for body/UI text, **SharpSansDispNo1-Medium** for display/headings
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

**Badge** — `html`

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
- **Border radius:** 1.5em, 2em, 2px, 8px, inherit, 1px, 3px, 4px, 5px, 6px, 10px, 12px, 15px, 40px, 100%, 100px, 120px
- **Max content width:** 1080px

**Spacing as Meaning:**
| Spacing | Use |
|---|---|
| 4-8px | Tight: related items within a group |
| 12-16px | Medium: between groups |
| 24-32px | Wide: between sections |
| 48px+ | Vast: major section breaks |


---

## 6. Depth & Elevation

### Flat — subtle depth hints

- `0 0 2px 2px rgba(0,0,0,0.6)`
- `0 0 0 1px #4f94d4,0 0 2px 1px rgba(79,148,212,.8)`
- `2px -2px 0px 0px currentColor`

### Raised — cards, buttons, interactive elements

- `0 3px 3px rgba(0,0,0,0.2)`
- `0px 0px 0px 3px #ebf5fa,0px 0px 0px rgba(255,54,54,.25)`
- `0px 1px 3px rgba(16,24,40,.1),0px 1px 2px rgba(16,24,40,.06)`

### Floating — dropdowns, popovers, modals

- `0px 12px 16px -4px rgba(16,24,40,.08),0px 4px 6px -2px rgba(16,24,40,.03)`
- `0 5px 15px rgba(0,0,0,.7)`
- `0 0 4px rgba(0,0,0,.04),0 8px 16px rgba(0,0,0,.08),inset 0 0 0 1px hsla(0,0%,100%,.08)`

### Overlay — full-screen overlays, top-level dialogs

- `0 5px 30px -5px rgba(0,0,0,.25)`
- `0px 8px 24px 4px rgba(16,24,40,.12)`
- `0px 0px 0px 3px #ebf5fa,0px 8px 24px 4px rgba(16,24,40,.12)`

### Z-Index Scale

`0, 1, 2, 4, 9, 99, 100, 700, 800, 801, 850, 998, 999, 1001, 1002, 1020, 1050, 1051, 9999, 59899, 99999, 100000, 159900, 160000, 900000, 900001, 900002, 999999, 2000000, 3000000, 5000000, 999999999, 9999999999`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes show-content-image`
- `@keyframes turn-on-visibility`
- `@keyframes turn-off-visibility`
- `@keyframes lightbox-zoom-in`
- `@keyframes lightbox-zoom-out`
- `@keyframes overlay-menu__fade-in-animation`
- `@keyframes spin`
- `@keyframes blink`

### Animated Components

- **Button**: 

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#ceff00` for interactive elements (buttons, links, focus rings)
- Use `#ffffff` as the primary page background
- Pair **SharpSansDisplayNo1** (body) with **SharpSansDispNo1-Medium** (display) — these are the only allowed fonts
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: 1.5em, 2em, 2px, 8px, inherit
- Reuse existing components from Section 4 before creating new ones

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't introduce additional font families beyond SharpSansDisplayNo1 and SharpSansDispNo1-Medium and Courier 10 Pitch
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
| xs | 480px | css |
| sm | 600px | css |
| sm | 640px | css |
| md | 767px | css |
| md | 768px | css |
| lg | 781px | css |
| lg | 782px | css |
| lg | 850px | css |
| lg | 880px | css |
| lg | 900px | css |
| lg | 1000px | css |
| lg | 1024px | css |
| xl | 1025px | css |
| xl | 1080px | css |
| xl | 1200px | css |
| xl | 1250px | css |
| 2xl | 1399px | css |
| 2xl | 1400px | css |
| 2xl | 1600px | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #ffffff
Border: 1px solid #40464d
Radius: 5px
Padding: 16px
Font: SharpSansDisplayNo1
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #ceff00, text white
Ghost: bg transparent, border #40464d
Padding: 8px 16px
Radius: 5px
Hover: opacity 0.9 or lighter shade
Focus: ring with #ceff00
```

### Build a Page Layout

```
Background: #ffffff
Max-width: 1080px, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #ffffff
Label: #98a2b3 (muted, 12px, uppercase)
Value: #000000 (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #ffffff
Input border: 1px solid #40464d
Focus: border-color #ceff00
Label: #98a2b3 12px
Spacing: 16px between fields
Radius: 5px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: SharpSansDisplayNo1, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```

## Bundled Fonts (fonts/)

The following font files are bundled in the `fonts/` directory:

- `fonts/SharpSansDisplayNo1-Bold-Regular.otf`
- `fonts/SharpSansDisplayNo1-Bold-Regular.woff`
- `fonts/SharpSansDisplayNo1-Book-Regular.otf`
- `fonts/SharpSansDisplayNo1-Book-Regular.woff`
- `fonts/SharpSansDisplayNo1-Book-Regular.woff2`
- `fonts/SharpSansDisplayNo1-Light-Regular.otf`
- `fonts/SharpSansDisplayNo1-Light-Regular.woff`
- `fonts/SharpSansDisplayNo1-Light-Regular.woff2`
- `fonts/SharpSansDisplayNo1-Medium-Regular.otf`
- `fonts/SharpSansDisplayNo1-Medium-Regular.woff`
- `fonts/SharpSansDisplayNo1-Semibold-Regular.woff`
- `fonts/SharpSansDisplayNo1-Thin-Regular.otf`
- `fonts/SharpSansDisplayNo1-Thin-Regular.woff`
- `fonts/SharpSansDisplayNo1-Thin-Regular.woff2`
- `fonts/SharpSansDispNo1-600.woff`
- `fonts/SharpSansDispNo1-Bold-Regular.woff`
- `fonts/SharpSansDispNo1-Medium-Regular.woff`
- `fonts/SharpSansDispNo1-Regular.woff`
- `fonts/SharpSansDispNo1-Semibold-Regular.woff`

Use these local font files in `@font-face` declarations instead of fetching from Google Fonts.

## Homepage Screenshots (screenshots/)

![homepage.png](screenshots/homepage.png)

