# NIMBL Logo Design Concepts

## Design Brief

**Brand:** NIMBL — Token-efficient AI coding companion
**Core values:** Agility, speed, elegance, efficiency
**Color palette:** Black primary (`#0a0a0a`), forest green accent (`#06402b`)
**Aesthetic:** Minimal, modern, hacker/terminal-native. No gradients, no rounded corners.

---

## Concept 1: Three-Stripe Ascending Wing

**Idea:** Three vertical stripes of increasing height from left to right.

```
  ▐        ▐        ▐
  ▐        ▐   ▐    ▐
  ▐   ▐    ▐   ▐    ▐
  ▐   ▐    ▐   ▐    ▐
  ▐   ▐    ▐   ▐    ▐

  Short    Medium   Tall
  (start)  (build)  (result)
```

- **Stripe 1 (left):** 20% height — represents the prompt/input
- **Stripe 2 (middle):** 50% height — represents processing/learning
- **Stripe 3 (right):** 80% height — represents the output/solution
- **Color:** All stripes in `#06402b` (forest green), on `#0a0a0a` background
- **Optional:** 5° rightward tilt to imply forward momentum
- **Stroke width:** 3px per stripe, 4px gap between

**Why it works:** Abstract enough to be timeless. Shows progression, acceleration, and growth. Works at favicon size (3 distinct vertical bars).
**NIMBL connection:** "Nimble" = quick → stripes show ascending speed/efficiency.

---

## Concept 2: Swift Wing Contour (Recommended)

**Idea:** Single continuous line tracing the leading edge of a bird's wing in flight.

```
        ▐▐
       ▐  ▐
      ▐    ▐
     ▐      ▐
    ▐        ▐
   ▐          ▐
  ▐            ▐
 ▐              ▐
▐                ▐
```

- **Path:** Starts thin at bottom-left, curves up and right through mid-height, tapers to a point at top-right
- **Stroke:** 2px, `#06402b`, no fill
- **Optional:** A tiny `[` bracket at the far bottom-left in darker grey (`#333`) — shows code origin without overpowering the mark
- **Start point:** `(x: 0, y: 100%)`
- **Control point:** `(x: 30%, y: 20%)`
- **End point:** `(x: 100%, y: 0%)`

**SVG path (approximate):**
```svg
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 95 Q30 20 95 5" 
        stroke="#06402b" stroke-width="2" fill="none" 
        stroke-linecap="round"/>
</svg>
```

**Why it works:** Pure elegance. The wing shape directly embodies "nimble" — a bird's wing is the universal symbol of agility and speed. Organic curve contrasts beautifully with the rigid terminal/code aesthetic. Scales to 16x16 perfectly.

---

## Concept 3: Code-to-Flight Glyph

**Idea:** A mark that transforms from rigid code structure into fluid motion.

```
  ▐▐▐▐▐
  ▐   ▐
  ▐   ▐
  ▐▐▐▐▐
        ▐
         ▐
          ▐
           ▐
```

- **Left 40%:** Tight angular bracket/code structure — sharp 90° corners, rigid geometry
- **Transition point:** 45% mark — the rigid structure morphs into...
- **Right 60%:** Smooth, flowing contrail/wing — single curved stroke tapering to a point
- **Color:** Solid `#06402b` throughout
- **Thickness:** 2px stroke on both halves

**Why it works:** Direct metaphor for what NIMBL does — transforms code (rigid/strict) into something elegant and efficient (fluid/fast). The two halves tell a story. More complex than Concept 2 but richer meaning.

---

## Concept 4: Negative-Space "N" Wing

**Idea:** Interlocking "N" and "I" or "N" and "B" where the negative space forms a wing/arrow.

```
  ▐▐  ▐▐
  ▐ ▐▐ ▐
  ▐ ▐▐ ▐
  ▐  ▐  ▐
  ▐     ▐
  ▐     ▐
```

- **"N" stroke:** Bold geometric sans-serif, 2px stroke
- **Negative space:** The inner triangles/shapes suggest wing motion or an upward arrow
- **Variant A:** "N" and "I" share a stem → negative space = wing
- **Variant B:** "N" alone, where the diagonal stroke is broken into 3 ascending segments (ties back to Concept 1)
- **Color:** `#06402b` fill, `#0a0a0a` negative space

**Why it works:** Combines wordmark and icon into one mark. The "aha" moment when you spot the negative-space wing rewards attention. Works well with the existing typographic choice (JetBrains Mono already has strong geometry).

---

## Concept 5: Minimalist Diamond/N-Glyph

**Idea:** A single abstract glyph that reads as both an "N" and a directional arrow.

```
     ▐
    ▐▐▐
   ▐   ▐
  ▐     ▐
 ▐       ▐
▐▐▐▐▐▐▐▐▐
```

- **Top:** Sharp single point
- **Sides:** Symmetrical widening
- **Bottom:** Flat base
- **Reads as:** An upward-pointing chevron/arrow + an "N" silhouette when rotated 45°
- **Could also be:** A gem/diamond shape — "NIMBL" = "Nimble" → precious, precise, sharp

**Why it works:** The arrow = speed and direction. The diamond = precision and value. Both are core NIMBL values. Extremely simple, reads at any size.

---

## Logo Format Requirements

For NIMBL v0.2+ (after v0.1):

| Asset | Format | Size | Usage |
|-------|--------|------|-------|
| `logo.svg` | SVG, 2px strokes | 100x100 viewBox | Desktop window icon, web header |
| `logo-16.svg` | SVG, 3px strokes | 16x16 viewBox | Favicon, taskbar (tiny) |
| `logo-32.svg` | SVG, 2.5px strokes | 32x32 viewBox | Favicon (retina) |
| `logo-wordmark.svg` | SVG, "NIMBL" in JetBrains Mono + icon | 300x60 viewBox | Desktop title bar, web header |
| `logo-ascii.txt` | Plain text | ~3 lines | TUI startup screen |
| `logo-inverse.svg` | SVG, white on transparent | Same sizes | Dark mode documents, email |

---

## Recommendation

**Start with Concept 2 (Swift Wing Contour)** for v0.2. It's the cleanest, most scalable, and most directly meaningful mark. Complement it with the ASCII wordmark already designed in `RESEARCH_REPORT.md` Section 7.2 for the TUI.

If a monogram/wordmark feels more appropriate, **Concept 4 (Negative-Space "N" Wing)** is the best typographic option.

---

## DIY Design Tools

- **SVG:** Edit directly in code (copy the path from Concept 2 above)
- **Inkscape** (free, open-source): Good for iterating on shapes
- **Figma** (free tier): Good for layout and typography
- **ASCII:** Use the existing TUI logo from the research report
