jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('@ai-sdk/elevenlabs', () => ({
  elevenLabs: { speech: jest.fn(), transcription: jest.fn() },
}));

import { MemorySessionStore } from '../session/session.store';
import { ProposeService } from '../propose/propose.service';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  it('starts at zero', () => {
    const snapshot = new TelemetryService().snapshot();
    expect(snapshot.overflowAttempts).toBe(0);
    expect(snapshot.accepted).toBe(0);
  });

  it('counts an over-cap paste without counting it as a proposal', async () => {
    const telemetry = new TelemetryService();
    const service = new ProposeService(new MemorySessionStore(), telemetry);

    await service
      .propose({ text: 'A. B. C. D. E.', option: 'academic' })
      .catch(() => undefined);

    const snapshot = telemetry.snapshot();
    expect(snapshot.overflowAttempts).toBe(1);
    // The demand signal has to be distinguishable from real usage.
    expect(snapshot.proposals).toBe(0);
  });

  it('separates accepted from rejected', () => {
    const telemetry = new TelemetryService();
    telemetry.accepted();
    telemetry.accepted();
    telemetry.rejected();

    const snapshot = telemetry.snapshot();
    expect(snapshot.accepted).toBe(2);
    expect(snapshot.rejected).toBe(1);
  });
});
