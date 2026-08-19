import { describe, expect, it } from 'vitest';
import {
  CARD_MODEL,
  PROPOSE_MODEL,
  cardModel,
  cardProviderOptions,
  proposeModel,
  proposeProviderOptions,
} from './models';

/**
 * A `*.test.ts` file, so vitest owns it — this is the reason the API runs two
 * runners. These assertions load the real `@ai-sdk/openai`, which is ESM-only
 * and cannot be imported by jest's CJS runtime at all; the `*.spec.ts` suites
 * have to mock it out. Anything that must verify behaviour against the actual
 * SDK belongs here.
 */
describe('model wiring (against the real SDK)', () => {
  it('resolves the propose model to the cheap fast tier', () => {
    const model = proposeModel();
    expect(model.modelId).toBe(PROPOSE_MODEL);
    expect(model.modelId).toBe('gpt-5.6-luna');
  });

  it('resolves the card model to the higher-quality tier', () => {
    const model = cardModel();
    expect(model.modelId).toBe(CARD_MODEL);
    expect(model.modelId).toBe('gpt-5.6-terra');
  });

  it('builds real provider model instances, not stubs', () => {
    // If the SDK were mocked, `provider` would be undefined — this is the
    // assertion that proves the ESM package actually loaded.
    expect(proposeModel().provider).toContain('openai');
    expect(proposeModel().specificationVersion).toBeDefined();
  });

  it('turns reasoning off on the call the user waits for', () => {
    expect(proposeProviderOptions.openai.reasoningEffort).toBe('none');
  });

  it('lets the card call reason, since quality outranks latency there', () => {
    expect(cardProviderOptions.openai.reasoningEffort).toBe('low');
  });

  it('keeps the two prompt cache keys distinct', () => {
    expect(proposeProviderOptions.openai.promptCacheKey).not.toBe(
      cardProviderOptions.openai.promptCacheKey,
    );
  });
});
