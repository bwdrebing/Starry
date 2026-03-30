# Starry — Codebase Guide

## Overview

Starry is a browser-based Islamic geometric pattern generator. It renders quasi-periodic and uniform tilings, then overlays a **Hankin motif** — a star-polygon pattern derived from the Polygons-in-Contact (PIC) algorithm. The UI is React + Vite; all geometry is drawn onto an HTML5 Canvas.

---

## Key Concepts

### 1. Tiling Generation

Two tiling systems are supported:

**Uniform / Archimedean tilings** (`src/AntwerpCanvas.jsx`)
- Configurations are string-encoded (e.g. `'6-3/m30/r(h1)'`) and parsed by the `@hhogg/antwerp` library via `toShapes()`.
- Each shape is an array of 2D vertex coordinates (canvas pixels).

**Quasi-periodic tilings** (`src/penrose.js`)
- Uses **de Bruijn's multigrid method**: draw *n* families of equally-spaced parallel lines at angles `k·2π/n`, then find every pairwise intersection and project nearby sample points into the dual lattice to obtain rhombus vertices.
- `generateMultigrid(width, height, symmetry, steps)` returns `shapes` in the same format as Antwerp.
- Symmetry 5 → Penrose P3; 7 → heptagonal; 8 → Ammann-Beenker.
- Irrational (golden-ratio-spaced) per-family offsets prevent three lines from meeting at a point, which would produce degenerate dual tiles.

### 2. Hankin Motif (`src/hankin.js`)

The core algorithm. For every polygon in the tiling:

1. **Edge rays** — Each edge emits two rays angled inward at ±θ from the inward normal, offset along the edge by `delta·edgeLen/2`. The left ray of edge *i* pairs with the right ray of edge *i+1*.
2. **Star points** — `rayIntersect()` finds where the paired rays meet. If they are parallel or diverge, `rayExitPolygon()` clips each ray to the polygon boundary instead.
3. **Segments** — Each ray is drawn from its origin to its computed endpoint.

#### Thick mode

When `thick=true`, `makeEdgeRays()` produces **two band variants** per polygon:
- `bplus` — outer band (`delta - bandWidth/cos(θ)`)
- `bminus` — inner band (`delta + bandWidth/cos(θ)`)

The band offsets are evaluated at each edge's **midpoint** (shared between adjacent tiles), so both tiles compute the same offset and the band lines are continuous across tile boundaries.

#### Painters algorithm / overlap (`getHankinSegments`)

With thick bands, the two sets of lines cross each other and a weave effect is produced using a two-pass draw:

- **`overSegs`** — the `bplus` (outer band) lines, drawn second (on top).
- **`underSegs`** — the `bminus` (inner band) lines, drawn first (underneath), with a gap cut out wherever they pass behind a `bplus` line.

The gap is computed by `bandCrossParam(bm.origin, bm.end, bp.origin, bp.end)`, which returns the `t` parameter (along the `bminus` segment) at which it crosses each `bplus` segment. When at least two crossing `t` values are found, `pushWithBandGap()` removes the occluded span (plus an `extraGap` margin) from the under-segment.

**Parallel-ray special case:** When two adjacent edge rays are exactly parallel, `rayIntersect()` returns `null` (denominator `< 1e-10`) and the code falls back to `rayExitPolygon()`. Likewise, `bandCrossParam()` returns `null` for parallel band segments — meaning no crossing `t` is found and the under-segment is pushed whole (no gap), which breaks the weave appearance. This is the known bug with thick motifs at parallel-ray angles.

### 3. Parquet deformation

`buildThetaAt(shapes, ...)` returns a `(x, y) => theta` function that maps canvas position to a local θ value, producing a smooth variation across the pattern. Modes:
- `'none'` — constant θ everywhere
- `'ltr'` / `'btt'` — linear gradient left-to-right or bottom-to-top
- `'centered'` — radial gradient from origin
- `'fn'` — animated function (wave, ripple, pulse) driven by `time * speed`

Each edge samples θ at its **midpoint**, ensuring both tiles that share an edge use identical θ and band offsets.

### 4. Rendering (`src/AntwerpCanvas.jsx`)

- `AntwerpCanvas` is a `forwardRef` component that owns the `<canvas>` element.
- A `requestAnimationFrame` loop calls `drawHankin()` every frame when animated.
- All mutable props are mirrored into refs so the rAF callback always sees current values without re-subscribing.
- Polygon colours are looked up by side-count (triangles, squares, hexagons, etc.) from `PALETTE`; quasi-periodic rhombuses are coloured by the angular-step difference between the two multigrid families that produced them.
- **Export SVG** calls `getHankinSegments()` to collect all segment data and serialises it directly to an SVG `<path>` string.

### 5. UI (`src/App.jsx`)

All state lives in `App`. Key controls:

| Control | State | Effect |
|---|---|---|
| Pattern | `tilingIndex` | Selects Archimedean or quasi-periodic config |
| Radius | `radius` | Scales how much of the canvas the tiling fills |
| Motif | `showMotif` | Toggles Hankin overlay |
| Angle (θ) | `thetaDeg` | Ray angle in degrees (10–80°) |
| Parquet | `parquetDirection` | Spatial θ variation mode |
| Delta | `delta` | Along-edge offset of ray origins (0–0.9) |
| Thick | `thick` | Enables double-band mode; forces `overlap=true` |
| Width | `bandWidth` | Half-width of thick bands (0.01–0.5) |

`overlap` is always set equal to `thick` (`overlap={thick}` in JSX), so overlap rendering is inseparable from thick mode in the current UI.

---

## File Map

| File | Purpose |
|---|---|
| `src/hankin.js` | All motif geometry: ray construction, intersection, thick bands, painters algorithm |
| `src/penrose.js` | Quasi-periodic tiling via de Bruijn multigrid |
| `src/AntwerpCanvas.jsx` | Canvas component, rAF loop, Antwerp tiling, SVG export |
| `src/App.jsx` | Root component, all UI controls and state |
| `src/StarryCanvas.jsx` | Decorative starfield background canvas |

---

## Geometry Conventions

- **Canvas coordinates**: origin top-left, y increases downward.
- **Shapes**: arrays of `[x, y]` vertices. `ensureClockwise()` normalises winding order before ray construction.
- **Rays**: `{ origin: [x,y], dir: [dx,dy] }` where `dir` is a unit vector.
- **Segments**: `[[x1,y1], [x2,y2]]` pairs stored in `underSegs` / `overSegs`.
- **`t` parameter**: fractional position along a segment (0 = start, 1 = end). `bandCrossParam` returns an unclamped `t`; callers clamp it to `[0,1]`.
