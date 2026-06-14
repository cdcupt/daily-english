import { describe, it, expect } from 'vitest';
import { generateInstantFeedback } from '../src/ai/feedback.js';
import type { ChatClient } from '../src/ai/client.js';

class FakeClient implements ChatClient {
  lastSystem = '';
  lastUser = '';
  constructor(private readonly response: string) {}
  async chat(messages: { role: string; content: string }[]): Promise<string> {
    this.lastSystem = messages.find((m) => m.role === 'system')?.content ?? '';
    this.lastUser = messages.find((m) => m.role === 'user')?.content ?? '';
    return this.response;
  }
}

const RESPONSE = JSON.stringify({
  original: 'weather good and many food',
  corrected: 'The weather is good and there is a lot of food.',
  natural_version: 'The weather is great and there are tons of different foods.',
  issues: [{ type: 'grammar', explanation: 'Add articles and a verb.' }],
  save_candidates: ['there are many kinds of...'],
});

describe('generateInstantFeedback', () => {
  it('returns a validated 3-tier payload + audit fields', async () => {
    const client = new FakeClient(RESPONSE);
    const r = await generateInstantFeedback({
      cefrLevel: 'B1',
      learningGoal: 'Describe a city',
      targetPhrases: ['I like X because of...'],
      referenceAnswers: ['I like LA because of its weather.'],
      promptCn: '我喜欢洛杉矶',
      userText: 'weather good and many food',
    }, client);
    expect(r.payload.corrected).toMatch(/weather is good/i);
    expect(r.payload.natural_version.length).toBeGreaterThan(0);
    expect(r.promptVersion).toBe('fb.instant.v1');
    expect(r.repaired).toBe(false);
  });

  it('passes scenario context + level into the prompt', async () => {
    const client = new FakeClient(RESPONSE);
    await generateInstantFeedback({
      cefrLevel: 'A2', learningGoal: 'Order coffee', targetPhrases: ["I'd like..."],
      referenceAnswers: [], promptCn: null, userText: 'I want coffee',
    }, client);
    expect(client.lastUser).toContain('Order coffee');
    expect(client.lastUser).toContain('I want coffee');
    expect(client.lastSystem).toContain('A1–A2');
  });
});
