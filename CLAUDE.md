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

With thick bands, each tile edge radiates a **+ band** (its left ray) and a **− band** (its right ray); each band is a ribbon bounded by its `bplus`/`bminus` boundary lines. Bands weave by alternating over/under at successive ribbon crossings, decided **per crossing** along each band's travel:

- Crossings between bands of different strands are found with `bandCrossParam()` and sorted along each band by a representative `t`. (The two bands of one strand join at the star point — a bend in the ribbon, not a crossing — so they are never woven against each other.)
- A **+ band** is *over* at its even-numbered crossings (0th, 2nd, …); since its first crossing is the − band of its own edge, + always occludes − at the shared edge. A **− band** is *over* at its odd-numbered crossings, so the two rules agree wherever the geometry alternates cleanly.
- When both bands at a crossing claim the same state, the + band wins over the − band; between same-sign bands the first wins.
- The under band at each crossing gets a gap cut over the span where it passes behind the other band's ribbon (entry to exit through both boundary lines, plus an `extraGap` margin), via `mergeIntervals()` + `pushWithGaps()`.

Segments that received gaps are returned in `underSegs` (drawn first); untouched segments in `overSegs`.

**Parallel-ray special case:** When two adjacent edge rays are exactly parallel, `rayIntersect()` returns `null` (denominator `< 1e-10`) and the code falls back to `rayExitPolygon()`. Likewise, `bandCrossParam()` returns `[]` for parallel non-collinear band segments — meaning no crossing is found and the bands are not woven there, which breaks the weave appearance. This is the known bug with thick motifs at parallel-ray angles.

#### Motif caching (congruent tiles)

When `parquetDirection === 'none'`, θ is spatially constant and every motif quantity scales with edge length, so a tile's motif is equivariant under rotation + translation. `getHankinSegments` exploits this: each tile is mapped to a canonical frame (vertex 0 at the origin, edge 0→1 along +x), the per-tile computation (`computeTileSegments`) runs once per distinct canonical shape, and the cached segments are stamped onto every congruent tile through its own rigid transform. The cache key is the canonical vertex list quantised to 0.01 px — a near-miss only costs a redundant recompute, never a wrong reuse — and the whole cache is cleared whenever any motif parameter (θ, delta, thick, overlap, overlapGap, bandWidth, skip) changes. Reflected tiles hash to different keys, as required since the motif is chiral. Any spatially varying θ mode bypasses the cache entirely.

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

## Testing

Screenshot tests use Playwright to render the app in a headless browser and compare the canvas bitmap against committed baseline images.

### Running tests

```bash
npm test               # run all tests against committed baselines
npm run test:update    # re-generate baselines after an intentional visual change
```

Each test builds the app (`vite build`) and serves it via `vite preview`, then takes a pixel-exact screenshot of the tiling canvas (composited on black). Tests take ~60 seconds due to the build step.

Baseline PNGs live in `tests/__snapshots__/`. Commit them whenever you run `test:update`.

### After implementing a feature

1. Run `npm test` to confirm nothing regressed.
2. If the feature intentionally changes canvas output, run `npm run test:update` to regenerate the affected snapshots, review the diff, then commit the updated PNGs alongside the code change.
3. Add new test cases in `tests/canvas.spec.js` for any new rendering states the feature introduces (new tiling type, new control combination, etc.).

### Adding a new snapshot test

```js
test('my new state', async ({ page }) => {
  await page.goto('/')
  await waitForRender(page)
  // interact with the UI to reach the state under test
  expect(await canvasSnapshot(page)).toMatchSnapshot('my-new-state.png')
})
```

Run `npm run test:update` once to create the baseline, then `npm test` on subsequent runs to guard it.

---



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
