import { test, expect } from '@playwright/test'

const CANVAS = '[data-testid="tiling-canvas"]'

// Wait until the canvas has emitted at least one completed draw with shapes.
async function waitForRender(page) {
  await page.locator(`${CANVAS}[data-rendered]`).waitFor({ timeout: 10_000 })
}

// Extract the raw canvas bitmap as a PNG buffer.
// This captures only the canvas drawing buffer (no compositing with StarryCanvas).
async function canvasSnapshot(page) {
  const dataURL = await page.locator(CANVAS).evaluate(el => el.toDataURL('image/png'))
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

test.describe('canvas rendering', () => {
  // ── Hexagonal tiling (default, index 0) ──────────────────────────────────

  test('hexagonal — default state', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    expect(await canvasSnapshot(page)).toMatchSnapshot('hex-default.png')
  })

  test('hexagonal — motif off', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await page.locator('#motif-check').uncheck()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('hex-no-motif.png')
  })

  test('hexagonal — thick bands', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await page.locator('#thick-check').check()
    await page.waitForTimeout(80)
    expect(await canvasSnapshot(page)).toMatchSnapshot('hex-thick.png')
  })

  test('hexagonal — theta 30°', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await setSlider(page, '#theta-slider', 30)
    expect(await canvasSnapshot(page)).toMatchSnapshot('hex-theta-30.png')
  })

  test('hexagonal — delta 0.3', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await setSlider(page, '#delta-slider', 0.3)
    expect(await canvasSnapshot(page)).toMatchSnapshot('hex-delta-03.png')
  })

  // ── Square tiling (index 1, opened via gallery) ───────────────────────────

  test('square — default state', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await page.locator('.pattern-picker-btn').click()
    await page.getByText('4⁴ — Square').click()
    await waitForRender(page)
    expect(await canvasSnapshot(page)).toMatchSnapshot('square-default.png')
  })

  // ── Penrose 5-fold ────────────────────────────────────────────────────────

  test('penrose 5-fold — default state', async ({ page }) => {
    await page.goto('/')
    await waitForRender(page)
    await page.locator('.pattern-picker-btn').click()
    await page.getByText('5-fold (Penrose P3)').click()
    await waitForRender(page)
    expect(await canvasSnapshot(page)).toMatchSnapshot('penrose5-default.png')
  })
})
