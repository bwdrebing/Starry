# Starry

A browser-based Islamic geometric pattern generator. Renders quasi-periodic and Archimedean tilings with an optional Hankin star-polygon motif overlay.

## Features

- **60+ tiling patterns** — 1-Uniform through 3-Uniform (triangular, square, hexagonal, mixed), plus quasi-periodic (Penrose P3, heptagonal, Ammann-Beenker) and Truchet variants
- **Hankin motif** — configurable ray angle (10–80°), edge offset (delta), thick double-band mode with woven overlap rendering
- **Truchet spirals** — A tile's arcs normally join control point *k* on one edge of a vertex's wedge to point *k* on the other, closing into concentric rings. Spiral mode joins *k* to *k±1* instead, so the radius ramps by one line spacing across each arc. Every wedge is swept in the same angular direction, so an arc leaving a shared edge meets its neighbour's arc arriving at the same radius: the turns chain through all tiles around a vertex into one continuous spiral. The innermost arc runs from the tile vertex itself (control point 0) out to point 1, so the spiral winds into its own centre rather than starting in mid-air.

**Parquet deformation** — spatially vary the ray angle across the canvas: uniform, linear gradient, radial gradient, or animated (wave, ripple, pulse)
- **Interactive canvas** — pan, pinch/zoom, handle dragging; Truchet mode adds keyboard tile editing
- **Export SVG** — downloads the current pattern as a scalable vector graphic

## Tech Stack

- React 19 + Vite 6
- [`@hhogg/antwerp`](https://github.com/hhogg/antwerp) for Archimedean tiling generation
- HTML5 Canvas for all rendering

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |

## Controls

| Control | Effect |
|---|---|
| Pattern | Selects tiling type |
| Radius | Scales how much of the canvas the tiling fills |
| Motif | Toggles the Hankin star overlay |
| Angle (θ) | Ray angle in degrees |
| Parquet | Spatial variation mode for θ |
| Delta | Along-edge offset of ray origins (0–0.9) |
| Thick | Enables double-band weave mode |
| Width | Band half-width (thick mode only) |

### Truchet controls

| Control | Effect |
|---|---|
| Type | Switches the overlay between the Hankin motif and Truchet arcs |
| Arcs | Concentric rings, or spirals winding either way |

### Keyboard shortcuts (Truchet mode)

| Key | Action |
|---|---|
| W / Q | Rotate selected tile |
| A / S / D | Toggle arcs A, B, C |
| Arrow keys | Navigate to adjacent tile |
| Backspace | Suppress all arcs on selected tile |

## Architecture

```
src/
├── App.jsx             # Root component; all UI state
├── AntwerpCanvas.jsx   # Canvas component, rAF loop, SVG export
├── hankin.js           # Motif geometry: rays, intersections, thick bands
├── penrose.js          # Quasi-periodic tiling via de Bruijn multigrid
├── truchet.js          # Triangular Truchet generation and editing
├── squareTruchet.js    # Square Truchet generation and editing
├── spiral.js           # Spiral Truchet arcs: sampling and occlusion
└── StarryCanvas.jsx    # Decorative starfield background
```

## How It Works

**Tiling generation** — Archimedean tilings are parsed from configuration strings (e.g. `'6-3/m30/r(h1)'`) by the Antwerp library. Quasi-periodic tilings use de Bruijn's multigrid method: *n* families of parallel lines at angles `k·2π/n` are intersected pairwise and projected into the dual lattice to produce rhombus tiles.

**Hankin motif** — For each polygon, two rays are emitted from each edge at ±θ from the inward normal, offset by `delta`. Adjacent-edge ray pairs are intersected to find star points. In thick mode, two offset band variants are produced and the painters algorithm cuts gaps in the under-layer to create a woven appearance.

**Parquet deformation** — Each edge samples θ at its midpoint, so both tiles sharing an edge always use the same angle, keeping the motif continuous across tile boundaries.
