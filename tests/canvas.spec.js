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

  // ── Hexagonal tiling ──────────────────────────────────────────────────────

  // Density (skip) only affects polygons with ≥6 sides, so the weave-interleaving
  // tests use the hexagonal tiling rather than the (triangular) default.
  test('hexagonal — thick bands, density 1', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await openTab(page, 0) // Tiling tab
    await page.locator('.tiling-thumb-item[title="1-Uniform: 6³ — Hexagonal"]').click()
    await waitForRender(page)
    await openTab(page, 2) // Style tab
    await page.locator('.prop-row').filter({ hasText: 'Band' }).getByText('Thick').click()
    await page.locator('.prop-row').filter({ hasText: 'Density' }).getByText('1', { exact: true }).click()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('hex-thick-density-1.png')
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
