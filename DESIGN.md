---
name: Paperclip (Flat style)
description: A flat, poster-grade paperclip desk pet in Oswald and a mid-century geometric palette; Classic remains the untouched incumbent skin.
colors:
  ink: "#18202E"
  wire-steel: "#8394AB"
  wire-shade: "#5F7088"
  wire-glint: "#E6ECF3"
  marigold: "#F2B33D"
  marigold-light: "#F7C964"
  ochre: "#C98A1E"
  paper: "#F4F1EA"
  coral: "#E5705A"
  bulb-glow: "#FFE27A"
  bulb-shade: "#F7CF55"
  menu-divider: "#2A3446"
typography:
  balloon:
    fontFamily: "Oswald, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  attribution:
    fontFamily: "Oswald, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.08em"
  menu-label:
    fontFamily: "Oswald, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "0.05em"
  zzz:
    fontFamily: "Oswald, system-ui, sans-serif"
    fontWeight: 600
rounded:
  balloon: "14px"
  menu: "10px"
  close: "6px"
spacing:
  menu-row: "30px"
  menu-pad-y: "5px"
  balloon-pad: "10px 30px 10px 16px"
components:
  balloon:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.balloon}"
    rounded: "{rounded.balloon}"
    padding: "10px 30px 10px 16px"
  balloon-attribution:
    textColor: "{colors.marigold}"
    typography: "{typography.attribution}"
  menu:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.menu-label}"
    rounded: "{rounded.menu}"
  menu-item:
    height: "30px"
    padding: "0 12px"
  menu-item-hover:
    backgroundColor: "{colors.marigold}"
    textColor: "{colors.ink}"
---

# Design System: Paperclip (Flat style)

Recorded from the shipped build (src/art/parts.ts `PAPERCLIP_SVG_FLAT`, src/styles.css `[data-style="flat"]`, src/ui/balloon.ts, src/ui/contextMenu.ts). Classic is the incumbent skin and is out of scope here; it keeps its gradients and outlines untouched. Where the build and docs/design/flat-style-brief.md differ on a hex, the build is recorded.

## Overview

**Creative North Star: "The Same Clip, a Sharper Suit"**

A mid-century geometric flat illustration (Charley Harper-style minimal realism) paired with Swiss-poster Oswald. Every form is one base colour plus at most one hard-edged shade shape. Personality is carried by geometry and expression (bold brows, eye whites, squash and stretch from the shared pose system), never by gradients or blur. Styles change the look, never the behaviour.

Rejected: pastel-blob, rounded-everything, faceless app-onboarding illustration.

**Key Characteristics:**
- Solid fills only; no gradients, filters, blur, or outline strokes on the character.
- One base + one hard shade per form (wire, pencil, bulb, mat, mat roll).
- Ink panels (balloon, menu) with Paper text and Marigold as the single accent.
- Oswald everywhere in Flat UI; hierarchy by weight, case, and tracking only.
- The wire shade drifts with body tilt (`wireShade` translates by tilt x 0.08) so the flat figure still reads as an object.

## Colors

A restrained steel, ink, and marigold palette; Coral appears only as a tiny accent.

### Primary
- **Ink** (#18202E): brows, pupils, mouth, balloon and menu panels, ground-shadow tint (14% opacity).
- **Marigold** (#F2B33D): mat top, roll body, question mark, sparkles, menu hover/active fill, balloon attribution text, text selection.

### Secondary
- **Steel Wire** (#8394AB): the paperclip wire (9.5 stroke) and closed-eyelid fill.
- **Wire Shade** (#5F7088): the single hard shade run on the wire (3.2 butt-capped strokes) and the eye-socket ring.
- **Wire Glint** (#E6ECF3): one crisp highlight segment on the top arc (2.5, round cap).
- **Ochre** (#C98A1E): mat front face, roll base, pencil shade.
- **Marigold Light** (#F7C964): mat rim band.

### Tertiary
- **Coral** (#E5705A): tongue and pencil eraser only.
- **Bulb Glow / Bulb Shade** (#FFE27A / #F7CF55): idea bulb body and its half-shade.

### Neutral
- **Paper** (#F4F1EA): eye whites, balloon and menu text, keyline underlays, pupil catchlights.
- **Menu Divider** (#2A3446): separator rows on the Ink menu.

### Named Rules
**The One Shade Rule.** Each form carries its base colour and exactly one hard-edged shade shape; no third tone, no blends.
**The Socket Rule.** Eye whites sit in a Steel-shade (#5F7088) socket ellipse (rx 14, ry 16) behind Paper (rx 11.5, ry 13.5), so they hold on any wallpaper without outline strokes.
**The Paper Keyline Rule.** Brows (9.5 Paper under 7 Ink) and mouth (Paper rim r8.5 around Ink r6) carry a Paper underlay so dark wallpapers do not swallow Ink features.
**The Rare Coral Rule.** Coral is tongue and eraser only.

## Typography

**Display / Body / Label Font:** Oswald (latin 300/400/500/600, bundled from @fontsource/oswald, OFL-1.1), fallback system-ui, sans-serif. Used only by the Flat style; Classic keeps system-ui. Oswald is a user-requested brand commitment.

**Character:** condensed poster sans; hierarchy by weight, case, and tracking only.

### Hierarchy
- **Balloon text** (400, 15px, 1.4): speech content; max width 32ch + 50px.
- **Attribution** (500, 11px, uppercase, 0.08em, Marigold): quote source line under balloon text, 6px above.
- **Menu label** (400, 13px, uppercase, 0.05em): context menu rows.
- **Zzz** (600, sizes 13/16/20px): sleep letters, Ink.

## Layout

Fixed 320 x 380 transparent stage. Character 216 x 261 pinned bottom-right (right 6px); balloon above-left (right 20px, bottom 244px, min 120px, max 134px high). Menu rows are 30px high with 12px side padding, 5px panel padding, 4px separators. The character viewBox is `-50 -40 240 290`; skins share geometry anchors and element ids (REQUIRED_IDS) so behaviour is skin-independent.

## Elevation & Depth

Flat in the character: no gradients, filters, or blur. Depth comes from hard shade shapes and the mat's two faces. The ground shadow is a flat Ink ellipse at 14% opacity (no blur). The UI panels, as built, carry one soft drop shadow (`0 8px 20px -6px rgba(10,14,22,0.35)`) to lift them off arbitrary wallpapers.

### Named Rules
**The Hard-Shade Rule.** On the character, depth is a second flat shape, never a blur, gradient, or outline.

## Shapes

Geometric and solid. Panels: 14px (balloon) and 10px (menu) radii; close button 6px. The balloon tail is a flat Ink triangle (11px tall, 9px half-base) below the panel. The mat is a thin sheet: Marigold top plane in 3/4 perspective, a Marigold-light inset rim (3px), and a 5px-high Ochre front edge (no curled corner: it read as a stray piece). Wire is 9.5 stroke with round caps and joins.

## Components

### Speech Balloon
Ink panel, Paper text, no border, padding 10px 30px 10px 16px (room for the close button). 150ms opacity fade out; reduced-motion removes the transition.

### Balloon Close
Drawn 12px SVG x (1.7 stroke, round caps, currentColor), 22px hit area, 6px radius, Paper at 60% opacity, 100% on hover and on focus-visible with a 2px Marigold outline (1px offset). Visible in Flat only.

### Context Menu
Ink panel, uppercase tracked Oswald, 30px rows; hover, active, focus, and open-submenu rows fill Marigold with Ink text. Checkmarks and submenu arrows are drawn SVG (11px and 9px, 1.8 stroke); the Classic text-glyph check is suppressed in Flat.

### Mat and Roll (signature)
The character's stage: thin Marigold sheet with inset rim, or a rolled Marigold cylinder with an Ochre base and concentric end circles for the enter/exit animations.

### Props
Pencil (Marigold + Ochre half, Coral eraser, Paper tip, Ink lead), idea bulb (two-tone yellow, Ink filament, Steel base, Marigold rays), question mark (Marigold), sparkles (4-point stars, Marigold and Paper).

## Do's and Don'ts

### Do:
- **Do** keep every Flat fill solid and every form to one base plus one hard shade.
- **Do** use Paper underlays (keylines) behind Ink features that sit on or near the wallpaper.
- **Do** set UI text in Oswald; separate levels with weight, case, and tracking.
- **Do** keep all REQUIRED_IDS in any new skin so the pose system works unchanged.
- **Do** use Marigold as the sole interactive and accent colour.

### Don't:
- **Don't** add gradients, filters, blur, or outline strokes to the Flat character.
- **Don't** use Coral beyond tongue and eraser.
- **Don't** copy Microsoft Clippy or clippy.js artwork.
- **Don't** change Classic when editing Flat; the skins share behaviour, not paint.
