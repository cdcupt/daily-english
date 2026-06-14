import { describe, it, expect } from 'vitest';
import { runStructured, AIContractError } from '../src/ai/runner.js';
import { FeedbackPayloadSchema } from '../src/schemas.js';
import type { ChatClient, ChatMessage } from '../src/ai/client.js';

const GOOD = JSON.stringify({
  original: 'I want check in early.',
  corrected: "I'd like to check in early.",
  natural_version: 'Would it be possible to check in early?',
  issues: [{ type: 'grammar', explanation: "'want' needs 'to'." }],
  save_candidates: ["I'd like to...", 'Would it be possible to...?'],
});

/** A scripted client returning queued responses in order. */
class ScriptedClient implements ChatClient {
  calls: ChatMessage[][] = [];
  constructor(private readonly responses: string[]) {}
  async chat(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    return this.responses.shift() ?? '';
  }
}

describe('runStructured', () => {
  it('parses valid JSON on the first try (no repair)', async () => {
    const client = new ScriptedClient([GOOD]);
    const r = await runStructured({ client, system: 's', user: 'u', schema: FeedbackPayloadSchema });
    expect(r.repaired).toBe(false);
    expect(r.data.corrected).toContain("I'd like");
    expect(client.calls).toHaveLength(1);
  });

  it('strips markdown fences before parsing', async () => {
    const client = new ScriptedClient(['```json\n' + GOOD + '\n```']);
    const r = await runStructured({ client, system: 's', user: 'u', schema: FeedbackPayloadSchema });
    expect(r.data.issues).toHaveLength(1);
  });

  it('does ONE repair retry when the first output is invalid, then succeeds', async () => {
    const client = new ScriptedClient(['{ not valid json', GOOD]);
    const r = await runStructured({ client, system: 's', user: 'u', schema: FeedbackPayloadSchema });
    expect(r.repaired).toBe(true);
    expect(client.calls).toHaveLength(2);
    // the repair turn must feed the error back
    const repairTurn = client.calls[1]!;
    expect(repairTurn.some((m) => m.content.includes('failed schema validation'))).toBe(true);
  });

  it('throws AIContractError after a second failure', async () => {
    const client = new ScriptedClient(['nope', 'still nope']);
    await expect(runStructured({ client, system: 's', user: 'u', schema: FeedbackPayloadSchema }))
      .rejects.toBeInstanceOf(AIContractError);
  });

  it('rejects schema-violating JSON (too many issues)', async () => {
    const tooMany = JSON.parse(GOOD);
    tooMany.issues = Array.from({ length: 5 }, () => ({ type: 'grammar', explanation: 'x' }));
    const client = new ScriptedClient([JSON.stringify(tooMany), GOOD]);
    const r = await runStructured({ client, system: 's', user: 'u', schema: FeedbackPayloadSchema });
    expect(r.repaired).toBe(true); // first rejected by max(3), repaired to GOOD
  });
});
