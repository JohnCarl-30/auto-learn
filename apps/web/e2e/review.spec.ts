import { expect, test } from '@playwright/test';

/**
 * What is left here needs a real browser and a real server.
 *
 * Compose behaviour, gate styling, card rendering and bank state moved to
 * component tests, and the API's error codes moved to supertest — both run in
 * milliseconds without booting anything. A browser test that restates them
 * only buys a slower way to learn the same thing.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('the stack talks to itself', () => {
  test('an over-cap paste is refused by the server and rendered as guidance', async ({
    page,
  }) => {
    // The one full-stack smoke test: browser -> API -> browser. The pieces are
    // covered elsewhere; this proves they are actually wired together.
    await page
      .getByTestId('compose')
      .fill('One here. Two here. Three here. Four here. Five here.');
    await page.getByTestId('option-academic').click();

    const notice = page.getByTestId('cap-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('I found 5');

    // Nothing was silently processed.
    await expect(page.getByTestId('review')).toHaveCount(0);
  });
});

test.describe('the gate', () => {
  // These need real proposals. They light up the moment a key exists, and they
  // are the tests that actually check the product's thesis.
  test.skip(
    !process.env.OPENAI_API_KEY,
    'needs OPENAI_API_KEY to get real proposals',
  );

  test('withholds the wording until the card is opened', async ({ page }) => {
    // Watch the wire: the proposal must not carry the replacement. This is the
    // product's central claim, and only a real request can prove it.
    const proposal = page.waitForResponse(
      (response) =>
        response.url().includes('/propose') && response.status() === 200,
    );

    await page.getByTestId('compose').fill('The results were very big.');
    await page.getByTestId('option-academic').click();

    const body: unknown = await (await proposal).json();
    expect(JSON.stringify(body)).not.toContain('replacement');

    await expect(page.getByTestId('review')).toBeVisible();
    await expect(page.getByTestId('gate').first()).toBeVisible();
  });

  test('applies the wording only after accepting', async ({ page }) => {
    await page.getByTestId('compose').fill('The results were very big.');
    await page.getByTestId('option-academic').click();

    const gate = page.getByTestId('gate').first();
    await expect(gate).toBeVisible();
    const before = await page.getByTestId('finished-text').innerText();

    await gate.click();
    await expect(page.getByTestId('word-card')).toBeVisible();
    await page.getByTestId('accept').click();

    await expect(page.getByTestId('word-card')).toHaveCount(0);
    await expect(page.getByTestId('finished-text')).not.toHaveText(before);
  });

  test('keeps your wording when you reject', async ({ page }) => {
    await page.getByTestId('compose').fill('The results were very big.');
    await page.getByTestId('option-academic').click();

    const gate = page.getByTestId('gate').first();
    await expect(gate).toBeVisible();
    const original = await gate.innerText();

    await gate.click();
    await expect(page.getByTestId('word-card')).toBeVisible();
    await page.getByTestId('reject').click();

    await expect(page.getByTestId('word-card')).toHaveCount(0);
    await expect(page.getByTestId('review')).toContainText(original);
  });
});

test.describe('leaving with the text', () => {
  test.skip(
    !process.env.OPENAI_API_KEY,
    'needs OPENAI_API_KEY to reach the review',
  );

  test('copies the finished sentence to the real clipboard', async ({
    page,
    context,
  }) => {
    // jsdom has no clipboard worth testing against; this needs a browser.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.getByTestId('compose').fill('The results were very big.');
    await page.getByTestId('option-academic').click();
    await expect(page.getByTestId('finished')).toBeVisible();

    const shown = await page.getByTestId('finished-text').innerText();
    await page.getByTestId('copy').click();
    await expect(page.getByTestId('copy')).toHaveText('Copied');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(shown);
  });
});
