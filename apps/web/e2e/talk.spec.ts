import { expect, test } from '@playwright/test';

/**
 * The speaking partner's wiring, browser -> API -> browser.
 *
 * The microphone is out of scope for the reasons review.spec.ts gives for
 * dictation: it needs an audio fixture, fake-device launch flags and a key,
 * and what it would prove is pinned in the component tests already. What only
 * a real stack can show is that a typed turn reaches /converse and its answer
 * — or its failure — comes back to the panel.
 */
test('a turn reaches the partner, and a failed one keeps your words', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('talk-link').click();
  await expect(page).toHaveURL(/\/talk$/);

  // The panel opens in "Just talk" by itself; there is no room to pick.
  await expect(page.getByTestId('partner-turn')).toContainText(
    'How has your week been so far?',
  );

  await page.getByTestId('answer').fill('It was very busy, I have many exam.');
  await page.getByTestId('send').click();

  if (process.env.OPENAI_API_KEY) {
    // A real partner answers, and the turn is reviewed under what was said.
    await expect(page.getByTestId('partner-turn')).toHaveCount(2, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('learner-turn')).toBeVisible();
  } else {
    // No key: the API answers 502 in the shared error shape, and nothing the
    // learner said is lost.
    await expect(page.getByTestId('talk-notice')).toContainText(
      "Your partner didn't answer",
    );
    await expect(page.getByTestId('answer')).toHaveValue(
      'It was very busy, I have many exam.',
    );
    await expect(page.getByTestId('learner-turn')).toHaveCount(0);
  }
});
