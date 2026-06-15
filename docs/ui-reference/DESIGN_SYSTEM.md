# bistec-studio — UI Design System

**Theme name:** Frozen Light
**Source:** Adapted from a Stitch-generated "Synthetix AI" workspace template.
**Status:** Reference for frontend build (Wave 4+ UI tasks).

> This document is the canonical visual reference for building the bistec-studio
> frontend. It captures the **Frozen Light** glassmorphic aesthetic — ice-blue
> accents, frosted translucent panels, and a calm "dark-glacier" atmosphere —
> adapted to bistec-studio's actual screens (briefs, drafts, campaigns, library,
> admin). Parts of the original template that don't apply to our system
> (diffusion seeds, credit costs, step counts, fine-tuning, API/billing nav) have
> been **removed**. See "What was dropped" at the bottom.

> **Hard requirement: both a DARK and a LIGHT theme.** The reference HTML
> (`synthetix-original-reference.html`) implements both via Tailwind's
> `darkMode: "class"` strategy — toggling the `dark` class on `<html>`. All
> components must render correctly in both themes.

---

## 0. Build Decisions (confirmed with user)

- **Theme default & persistence:** Follow OS preference (`prefers-color-scheme`)
  on first visit, then **remember the user's manual toggle** via `localStorage`.
  Apply the class before first paint (inline script in `<head>`) to avoid a
  flash of wrong theme (FOUC). Not stored in the DB for v1.
- **Fonts & icons — self-host everything, no external CDN.** This keeps the VPS
  deployment self-contained (consistent with the no-Azure / no-external-runtime
  posture). Load **Inter** and **JetBrains Mono** via `next/font/local` (or
  `next/font/google` with build-time download/self-hosting). Icons self-hosted
  too — Material Symbols subset bundled locally, or swap to `lucide-react`.
  No `fonts.googleapis.com` / `cdn.tailwindcss.com` calls at runtime.
- **Design fidelity:** Use Frozen Light as the **starting point**, not a rigid
  spec. Keep the tokens, dark/light system, and glass aesthetic as the default,
  but deviate where a bistec-studio screen needs it (e.g. denser library grids,
  data tables for publish history).
- **Shared foundation first:** A dedicated early task (T25) scaffolds the
  Tailwind theme config, glass utilities, theme provider/toggle, and base
  components before screen-level work begins. All UI tasks depend on it.

---

## 1. Brand & Aesthetic

A refined mix of **Glassmorphism** and **Minimalism**. Translucent layers, subtle
backdrop blur, and ice-blue accents simulate a workspace "carved from digital
crystal." The feel is calm productivity and futuristic precision — an airy,
luminous interface rather than a heavy traditional dark mode.

Core techniques:
- Frosted glass panels (`backdrop-filter: blur()` + semi-transparent bg + hairline border)
- Soft blurred radial "glow" blobs of the primary color in the background for depth
- Ghost-fill buttons (low-opacity primary fill + more opaque border)
- Depth via translucency and glow, **not** heavy drop shadows

---

## 2. Color Tokens

Two complete themes. Use these as Tailwind config `colors` (see reference HTML).

### Light theme
| Token | Hex | Use |
|---|---|---|
| `light.background` | `#f1f5f9` | App background (cool slate) |
| `light.surface` | `#ffffff` | Card / panel base |
| `light.surface-hover` | `#f8fafc` | Hover state |
| `light.border` | `#cbd5e1` | Borders, dividers |
| `light.text` | `#0f172a` | Primary text (deep slate) |
| `light.text-muted` | `#475569` | Secondary text |

### Dark theme
| Token | Hex | Use |
|---|---|---|
| `dark.background` | `#020617` | App background (midnight navy) |
| `dark.surface` | `#0f172a` | Card / panel base (ice surface) |
| `dark.surface-hover` | `#1e293b` | Hover state |
| `dark.border` | `#1e293b` | Borders, dividers |
| `dark.text` | `#f8fafc` | Primary text |
| `dark.text-muted` | `#94a3b8` | Secondary text |

### Accent (Glacier primary) — shared, theme-tuned
| Token | Hex | Use |
|---|---|---|
| `primary` | `#0284c7` | Primary actions in **light** mode (sky-600, deepened for contrast) |
| `primary-light` | `#7dd3fc` | Ice-blue accent in **dark** mode |
| `primary-hover` | `#0369a1` | Hover |
| `primary-active` | `#075985` | Active/pressed |

**Convention:** In light mode use `primary`; in dark mode use `primary-light`
(e.g. `text-primary dark:text-primary-light`). Glows and ghost-fills use alpha
variants (`bg-primary/10`, `border-primary/20`).

**Semantic:** error `#ffb4ab` (dark) / standard red for light; success/secondary
sky-blues. Add green/amber/red status tokens for post states (see §6 status chips).

---

## 3. Typography

| Role | Font | Size / Weight / Tracking |
|---|---|---|
| Display (page title) | **Inter** | 30px / 700 / -0.02em (24px on mobile) |
| Headline (section) | **Inter** | 18px / 600 / -0.01em |
| Body | **Inter** | 16px / 400 |
| Body small | **Inter** | 14px / 400 |
| Labels / metadata | **JetBrains Mono** | 12px / 500 — for technical metadata, IDs, counts, timestamps |

Inter is the workhorse. JetBrains Mono is reserved for monospace metadata (e.g.
Canva design IDs, scheduled timestamps, status codes) to reinforce the
"precision tool" feel.

---

## 4. Layout & Spacing

- **8px base unit** governs all spacing; components default to 24px (1.5rem) gaps for the airy feel.
- **Top app bar:** fixed, 64px (`h-16`), full width, glass treatment, max content width 1440px.
- **Left sidebar:** fixed, 256px (`w-64`), glass treatment, collapses to a drawer on mobile (`hidden md:flex`).
- **Main canvas:** fluid, capped at `max-w-[1440px]`, page padding 32px desktop / 16px mobile.
- **Radius:** "Soft-Large" — base components use `rounded-xl` (12px / 0.75rem). Full-round (`9999px`) for pills/avatars.

### Two-column work surface
The primary work screens (brief creation, draft refinement) use a 12-column grid:
- **Left (8 cols):** primary content — prompt/copy input + image/design preview
- **Right (4 cols):** settings panel — sticky, holds the generation options

---

## 5. Glassmorphism Utility Classes

From the reference HTML — reuse verbatim (works in both themes):

```css
.glass {            /* nav bars, top app bar */
  background: rgba(255,255,255,0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(15,23,42,0.1);
}
.dark .glass {
  background: rgba(15,23,42,0.6);
  border: 1px solid rgba(255,255,255,0.05);
}

.glass-panel {      /* cards, content panels */
  background: rgba(255,255,255,0.6);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(15,23,42,0.08);
  box-shadow: 0 4px 30px rgba(0,0,0,0.03);
}
.dark .glass-panel {
  background: rgba(15,23,42,0.5);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 4px 30px rgba(0,0,0,0.2);
}

.glass-input {      /* inputs, selects, textareas */
  background: rgba(255,255,255,0.8);
  border: 1px solid rgba(15,23,42,0.15);
}
.glass-input:focus {
  background: #fff;
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2,132,199,0.15);  /* outer glow, no lift */
}
/* dark focus uses primary-light #7dd3fc */
```

Background glow blobs (decorative, `pointer-events-none`, `z-[-1]`):
```html
<div class="absolute w-[50%] h-[50%] rounded-full bg-primary/10 blur-[100px] dark:bg-primary-light/5"></div>
```

Custom scrollbars: thin (8px), semi-transparent thumb — never default browser UI.

---

## 6. Components

- **Buttons (primary):** ghost-fill — `bg-primary/10` + `border-primary/20`, hover raises fill opacity. Solid `bg-primary text-white` for the main CTA in light mode; `bg-primary-light/20 text-primary-light` in dark.
- **Inputs / textareas / selects:** `.glass-input`, near-invisible border until focus → ice-blue border + outer glow. No lift on focus.
- **Nav items (active):** background tint (`primary/10`) + matching border to define the "selected glass pane." Inactive: muted text, hover tint.
- **Segmented toggles:** e.g. aspect-ratio selector pattern → reuse for **channel select** (Instagram / LinkedIn) and **design mode** (Template / Generate).
- **Status chips:** small pill, `primary/10` bg + bordered, monospace text. Use for post statuses — extend palette: green=PUBLISHED, amber=SCHEDULED, slate=DRAFT, red=FAILED, slate-outline=CANCELLED.
- **Theme toggle:** sun/moon icon in top bar, toggles `dark` class on `<html>` (see reference `toggleTheme()`).
- **Icons:** Material Symbols Outlined, housed in `rounded-xl` tinted squares.

---

## 7. Screen Mapping (template → bistec-studio)

The reference shows an "image rendering workspace." Here's how its layout maps to
our actual screens:

| Reference element | bistec-studio screen |
|---|---|
| Top app bar (brand, nav, theme toggle, avatar) | Global shell — brand = "bistec-studio"; nav = Workspace / Projects / Campaigns / Library / Admin |
| Left sidebar nav | Primary nav: Brief, Projects, Campaigns, Library, Admin Settings (admin only) |
| Prompt textarea (left, 8-col) | **Brief input** (topic, goal) + generated **copy** editor on the draft screen |
| Image preview area | **Generated image / assembled Canva design** preview (thumbnail via `get-design-thumbnail`) |
| Right settings panel (4-col) | Brief/draft options: campaign select, channels, tone, copy model, image model, design mode (Path A/B) |
| "AI Model" select | **Copy model** + **Image model** dropdowns (admin-curated, FR-28–FR-30) |
| Aspect-ratio segmented toggle | **Channel** segmented toggle (Instagram / LinkedIn) |
| "Style preset" select | **Tone** select (pre-filled from campaign/project) |
| "Generate Render" CTA | **Generate** (copy + image) / **Assemble design** / **Export** CTAs |
| Sidebar "Pro Workstation" header | Current project/campaign context badge |

---

## 8. What was dropped (not relevant to bistec-studio)

These template features are **diffusion-tool-specific** and intentionally excluded:
- **Seed / randomize** input — no seed concept in our flow
- **Credit cost** labels ("Cost: 1.5 credits") — internal tool, no credits
- **Output Quality / steps slider** ("High (20 steps)") — diffusion-specific
- **Style presets** like "Anime / Manga", "3D Render" — replaced by brand-driven tone
- **Fine-tuning, API Access, Billing, Upgrade Plan** nav/CTAs — not in v1 scope
- **Token counter** ("0 / 1000 tokens") — may optionally repurpose for caption length, but not required

---

## 9. Files in this folder

- `DESIGN_SYSTEM.md` — this document
- `synthetix-original-reference.html` — original template (both themes, working toggle) — use as a live code reference
- `screen-dark.png` — dark mode screenshot
- `screen-light.png` — light mode screenshot
