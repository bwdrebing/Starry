import { test, expect } from '@playwright/test'

const CANVAS = '[data-testid="tiling-canvas"]'

// Wait until the canvas has emitted at least one completed draw with shapes.
async function waitForRender(page) {
  await page.locator(`${CANVAS}[data-rendered]`).waitFor({ timeout: 10_000 })
}

// Extract the canvas bitmap composited onto a black background as a PNG buffer.
// Black background makes the light-colored motif lines clearly visible in snapshots.
// Using toDataURL() rather than a page screenshot avoids the animated StarryCanvas
// background bleeding through.
async function canvasSnapshot(page) {
  const dataURL = await page.locator(CANVAS).evaluate(el => {
    const offscreen = document.createElement('canvas')
    offscreen.width = el.width
    offscreen.height = el.height
    const ctx = offscreen.getContext('2d')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, offscreen.width, offscreen.height)
    ctx.drawImage(el, 0, 0)
    return offscreen.toDataURL('image/png')
  })
  return Buffer.from(dataURL.split(',')[1], 'base64')
}

// Set a range slider value and fire the React input event.
async function setSlider(page, id, value) {
  await page.locator(id).evaluate((el, v) => {
    el.value = String(v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
  await page.waitForTimeout(80)
}

// Open a drawer tab by index: 0=Tiling, 1=Motif, 2=Style.
// If the tab is already active this is a no-op (clicking it again would close it).
async function openTab(page, idx) {
  const tab = page.locator('.drawer-tab').nth(idx)
  const isActive = await tab.evaluate(el => el.classList.contains('active'))
  if (!isActive) {
    await tab.click()
    await page.waitForTimeout(200)
  }
}

// Count lit canvas pixels and hash their positions — used where the tiling is
// randomly generated, so a pixel-exact baseline isn't possible.
async function canvasInk(page) {
  return page.locator(CANVAS).evaluate(el => {
    const o = document.createElement('canvas')
    o.width = el.width; o.height = el.height
    const ctx = o.getContext('2d')
    ctx.drawImage(el, 0, 0)
    const d = ctx.getImageData(0, 0, o.width, o.height).data
    let count = 0, hash = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 128) { count++; hash = (hash * 31 + i) | 0 }
    }
    return { count, hash }
  })
}

// Switch the motif type to Truchet and select an arc mode from the Motif tab.
async function truchetArcs(page, label) {
  await page.locator('.seg-ctrl button', { hasText: /^Truchet$/ }).click()
  await page.waitForTimeout(120)
  await page.locator('.prop-row').filter({ hasText: 'Arcs' }).getByText(label, { exact: true }).click()
  await page.waitForTimeout(200)
}

test.describe('canvas rendering', () => {
  // ── Default tiling (index 0) ──────────────────────────────────────────────

  test('default tiling — default state', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    expect(await canvasSnapshot(page)).toMatchSnapshot('default-tiling.png')
  })

  test('default tiling — motif off', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    // Motif tab is open by default; toggle switch is directly accessible
    await page.locator('[aria-label="Toggle motif"]').click()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('default-tiling-no-motif.png')
  })

  test('default tiling — thick bands', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 2) // Style tab
    await page.locator('.prop-row').filter({ hasText: 'Band' }).getByText('Thick').click()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('default-tiling-thick.png')
  })

  test('default tiling — theta 30°', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 2) // Style tab
    await setSlider(page, '#theta-slider', 30)
    expect(await canvasSnapshot(page)).toMatchSnapshot('default-tiling-theta-30.png')
  })

  test('default tiling — delta 0.3', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 2) // Style tab
    await setSlider(page, '#delta-slider', 0.3)
    expect(await canvasSnapshot(page)).toMatchSnapshot('default-tiling-delta-03.png')
  })

  // ── Parquet deformation ───────────────────────────────────────────────────

  // Spatially varying θ takes the non-cached path in getHankinSegments (the
  // congruent-tile motif cache only applies when parquet is off).
  test('default tiling — parquet linear', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 2) // Style tab
    await page.locator('button[title="Linear gradient"]').click()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('default-tiling-parquet-ltr.png')
  })

  // ── Truncated hexagonal tiling ────────────────────────────────────────────

  // Density (skip) only affects polygons with more than 6 sides, so the
  // weave-interleaving tests use a tiling with 12-gons.
  test('truncated hexagonal — thick bands, density 1', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="1-Uniform: 3.12² — Truncated Hexagonal"]').click()
    await waitForRender(page)
    await openTab(page, 2) // Style tab
    await page.locator('.prop-row').filter({ hasText: 'Band' }).getByText('Thick').click()
    await page.locator('.prop-row').filter({ hasText: 'Density' }).getByText('1', { exact: true }).click()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('trunc-hex-thick-density-1.png')
  })

  // ── Square tiling ─────────────────────────────────────────────────────────

  test('square — default state', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="1-Uniform: 4⁴ — Square"]').click()
    await waitForRender(page)
    expect(await canvasSnapshot(page)).toMatchSnapshot('square-default.png')
  })

  test('square — thick bands', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="1-Uniform: 4⁴ — Square"]').click()
    await waitForRender(page)
    await openTab(page, 2) // Style tab
    await page.locator('.prop-row').filter({ hasText: 'Band' }).getByText('Thick').click()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('square-thick.png')
  })

  // ── Penrose 5-fold ────────────────────────────────────────────────────────

  test('penrose 5-fold — default state', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="Quasi-periodic: 5-fold (Penrose P3)"]').click()
    await waitForRender(page)
    expect(await canvasSnapshot(page)).toMatchSnapshot('penrose5-default.png')
  })

  // ── Girih ─────────────────────────────────────────────────────────────────

  test('girih decagons-hexagons-bowties — default state', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="Girih: Decagons, Hexagons & Bowties"]').click()
    await waitForRender(page)
    expect(await canvasSnapshot(page)).toMatchSnapshot('girih-dhb-default.png')
  })

  test('girih rosette — default state', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="Girih: Rosette — radial, aperiodic"]').click()
    await waitForRender(page)
    expect(await canvasSnapshot(page)).toMatchSnapshot('girih-rosette-default.png')
  })

  // θ = 36° is the canonical girih angle (straps cross tile edges at 54°);
  // at Density 2 the decagon motif becomes the classic {10/3} ten-pointed star.
  test('girih decagons-bowties — theta 36°, density 2', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="Girih: Decagons & Bowties"]').click()
    await waitForRender(page)
    await openTab(page, 2) // Style tab
    await setSlider(page, '#theta-slider', 36)
    await page.locator('.prop-row').filter({ hasText: 'Density' }).getByText('2', { exact: true }).click()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('girih-db-theta-36-density-2.png')
  })
})

// ── Truchet arcs: rings vs spirals ──────────────────────────────────────────
//
// Truchet tilings are randomly generated per page load, so these compare rings
// against spirals within one page rather than against a committed baseline.
test.describe('truchet spirals', () => {
  test('triangular truchet — spiral redraws the arcs', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)

    await truchetArcs(page, 'Rings')
    const rings = await canvasInk(page)
    expect(rings.count).toBeGreaterThan(0)

    await page.locator('.prop-row').filter({ hasText: 'Arcs' }).getByText('Spiral ↻', { exact: true }).click()
    await page.waitForTimeout(200)
    const spiral = await canvasInk(page)

    // Same tiling, different curves: one fewer arc per vertex, comparable ink.
    expect(spiral.hash).not.toBe(rings.hash)
    expect(spiral.count).toBeGreaterThan(rings.count * 0.5)
    expect(spiral.count).toBeLessThan(rings.count * 1.5)
  })

  test('triangular truchet — both spiral chiralities draw', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)

    await truchetArcs(page, 'Spiral ↻')
    const cw = await canvasInk(page)
    await page.locator('.prop-row').filter({ hasText: 'Arcs' }).getByText('Spiral ↺', { exact: true }).click()
    await page.waitForTimeout(200)
    const ccw = await canvasInk(page)

    expect(cw.count).toBeGreaterThan(0)
    expect(ccw.count).toBeGreaterThan(0)
    expect(ccw.hash).not.toBe(cw.hash)
  })

  test('square truchet — spiral redraws the arcs', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="1-Uniform: 4⁴ — Square"]').click()
    await waitForRender(page)
    await openTab(page, 1) // Motif tab

    await truchetArcs(page, 'Rings')
    const rings = await canvasInk(page)
    expect(rings.count).toBeGreaterThan(0)

    await page.locator('.prop-row').filter({ hasText: 'Arcs' }).getByText('Spiral ↻', { exact: true }).click()
    await page.waitForTimeout(200)
    const spiral = await canvasInk(page)

    expect(spiral.hash).not.toBe(rings.hash)
    expect(spiral.count).toBeGreaterThan(rings.count * 0.5)
    expect(spiral.count).toBeLessThan(rings.count * 1.5)
  })
})
