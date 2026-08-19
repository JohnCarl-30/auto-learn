import { expect, test } from '@playwright/test';

const THREE = 'One here. Two here. Three here.';
const FIVE = 'One here. Two here. Three here. Four here. Five here.';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('compose', () => {
  test('renders the four transforms', async ({ page }) => {
    await expect(page.getByTestId('option-grammar')).toHaveText(
      'Fix my grammar',
    );
    await expect(page.getByTestId('option-natural')).toBeVisible();
    await expect(page.getByTestId('option-academic')).toBeVisible();
    await expect(page.getByTestId('option-clearer')).toBeVisible();
  });

  test('counts sentences as you type', async ({ page }) => {
    const count = page.getByTestId('sentence-count');
    await expect(count).toHaveText('One to three sentences.');

    await page.getByTestId('compose').fill('Just one.');
    await expect(count).toHaveText('1 sentence');

    await page.getByTestId('compose').fill(THREE);
    await expect(count).toHaveText('3 sentences');
  });

  test('disables the transforms only when there is nothing to work on', async ({
    page,
  }) => {
    await expect(page.getByTestId('option-academic')).toBeDisabled();
    await page.getByTestId('compose').fill('Something.');
    await expect(page.getByTestId('option-academic')).toBeEnabled();
  });
});

test.describe('the sentence cap', () => {
  test('warns over the cap but keeps the button live', async ({ page }) => {
    await page.getByTestId('compose').fill(FIVE);

    await expect(page.getByTestId('sentence-count')).toHaveText('5 sentences');
    await expect(
      page.getByText("That's more than I take at once."),
    ).toBeVisible();

    // Deliberately still clickable: the server has to see the attempt, because
    // the overflow count is the signal that decides whether whole-essay mode
    // is worth building.
    await expect(page.getByTestId('option-academic')).toBeEnabled();
  });

  test('is refused by the server with the real count, not truncated', async ({
    page,
  }) => {
    await page.getByTestId('compose').fill(FIVE);
    await page.getByTestId('option-academic').click();

    const notice = page.getByTestId('cap-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('I found 5');
    await expect(notice).toContainText('one to three sentences');

    // No review was rendered — nothing was silently processed.
    await expect(page.getByTestId('review')).toHaveCount(0);
  });
});

test.describe('the gate', () => {
  // These need real proposals. They light up the moment a key exists, and are
  // the tests that actually check the product's thesis.
  test.skip(
    !process.env.OPENAI_API_KEY,
    'needs OPENAI_API_KEY to get real proposals',
  );

  test('marks suggestions and withholds the wording until the card opens', async ({
    page,
  }) => {
    // Watch the wire: the proposal must not contain the replacement.
    const proposal = page.waitForResponse(
      (response) =>
        response.url().includes('/propose') && response.status() === 200,
    );

    await page.getByTestId('compose').fill('The results were very big.');
    await page.getByTestId('option-academic').click();

    const body = await (await proposal).json();
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('replacement');

    await expect(page.getByTestId('review')).toBeVisible();
    await expect(page.getByTestId('gate').first()).toBeVisible();
  });

  test('opens a card and applies the wording only after accepting', async ({
    page,
  }) => {
    await page.getByTestId('compose').fill('The results were very big.');
    await page.getByTestId('option-academic').click();

    const gate = page.getByTestId('gate').first();
    await expect(gate).toBeVisible();
    const before = await page.getByTestId('review').innerText();

    await gate.click();
    await expect(page.getByTestId('word-card')).toBeVisible();

    await page.getByTestId('accept').click();
    await expect(page.getByTestId('word-card')).toHaveCount(0);

    const after = await page.getByTestId('review').innerText();
    expect(after).not.toBe(before);
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
