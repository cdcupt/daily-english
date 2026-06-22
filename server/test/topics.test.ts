import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every questionItems insert so the test can assert on the published vs.
// parked status. The fake db mimics the drizzle builder chain used in topics.ts:
//   db.insert(contentSources).values({...}).returning()  → [{ id }]
//   db.insert(questionItems).values({...})               → undefined
const insertedItems: Array<Record<string, unknown>> = [];

vi.mock('../src/db/client.js', () => {
  const fakeDb = {
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        // contentSources rows carry a `type` of 'ai_generated'; questionItems
        // rows carry an `itemKey`. Discriminate on the presence of itemKey.
        if ('itemKey' in vals) {
          insertedItems.push(vals);
          return Promise.resolve(undefined);
        }
        return { returning: () => Promise.resolve([{ id: 'source-1' }]) };
      },
    }),
  };
  return { getDb: () => fakeDb, schema: {} };
});

// Import AFTER the mock is registered so topics.ts picks up the fake getDb.
const { generateAndPublishItem, buildOutputModerationText } = await import('../src/routes/topics.js');
import type { ItemGen } from '../src/schemas.js';
import type { ModerationResult } from '../src/ai/moderation.js';

const GOOD_ITEM: ItemGen = {
  prompt_cn: '我想要一杯不加糖的拿铁。',
  reference_answers: ["I'd like a latte with no sugar, please."],
  target_phrases: ["I'd like..."],
  common_mistakes: [{ wrong: 'I want latte no sugar', explanation: "needs 'a' and 'with no sugar'" }],
  difficulty_score: 45, // A2-ish, near the B1 declared band used below
};

const ARGS = {
  topicSessionId: 'ts-1', scenarioId: 'sc-1', scenarioSlug: 'topic_job-interview',
  scenarioTitle: 'Job Interview', scenarioGoal: 'Describe a key strength', category: 'work',
  cefrLevel: 'B1',
};

function fakeGenerate(item: ItemGen): GenerateLike {
  return async () => ({ item, raw: '{}', promptVersion: 'gen.item.v1' });
}
type GenerateLike = (
  input: unknown, client?: unknown, opts?: unknown,
) => Promise<{ item: ItemGen; raw: string; promptVersion: string }>;

beforeEach(() => { insertedItems.length = 0; });

describe('buildOutputModerationText', () => {
  it('concatenates title, goal, prompt_cn, and reference answers', () => {
    const text = buildOutputModerationText({
      scenarioTitle: 'Title', scenarioGoal: 'Goal',
      item: { prompt_cn: '中文', reference_answers: ['A', 'B'] },
    });
    expect(text).toContain('Title');
    expect(text).toContain('Goal');
    expect(text).toContain('中文');
    expect(text).toContain('A');
    expect(text).toContain('B');
  });
});

describe('generateAndPublishItem output moderation', () => {
  it('PUBLISHES a benign item when output moderation passes (happy path)', async () => {
    const moderate = vi.fn(async (): Promise<ModerationResult> => ({ flagged: false, categories: [] }));
    const published = await generateAndPublishItem(ARGS, {
      generate: fakeGenerate(GOOD_ITEM) as never, moderate,
    });
    expect(published).toBe(true);
    expect(moderate).toHaveBeenCalledTimes(1); // one extra moderation call per item
    expect(insertedItems).toHaveLength(1);
    expect(insertedItems[0]!.status).toBe('published');
    expect(insertedItems[0]!.topicSessionId).toBe('ts-1');
  });

  it('PARKS (status=generated, not published) when output moderation flags the item', async () => {
    const moderate = vi.fn(async (): Promise<ModerationResult> => ({ flagged: true, categories: ['hate'] }));
    const published = await generateAndPublishItem(ARGS, {
      generate: fakeGenerate(GOOD_ITEM) as never, moderate,
    });
    expect(published).toBe(false); // not counted toward the served set
    expect(insertedItems).toHaveLength(1);
    // Parked as 'generated' → excluded from the published-only served set.
    expect(insertedItems[0]!.status).toBe('generated');
  });

  it('moderates the GENERATED OUTPUT, not just the input topic', async () => {
    const moderate = vi.fn(async (_text: string): Promise<ModerationResult> => ({ flagged: false, categories: [] }));
    await generateAndPublishItem(ARGS, { generate: fakeGenerate(GOOD_ITEM) as never, moderate });
    const moderatedText = moderate.mock.calls[0]![0];
    // The generated reference answer must be part of what was moderated.
    expect(moderatedText).toContain("I'd like a latte with no sugar");
    expect(moderatedText).toContain('我想要一杯不加糖的拿铁');
  });

  it('does NOT moderate (or insert) when the quality gate already failed', async () => {
    const moderate = vi.fn(async (): Promise<ModerationResult> => ({ flagged: false, categories: [] }));
    // English in prompt_cn fails the quality gate (must contain CJK).
    const badItem: ItemGen = { ...GOOD_ITEM, prompt_cn: 'no chinese here' };
    const published = await generateAndPublishItem(ARGS, {
      generate: fakeGenerate(badItem) as never, moderate,
    });
    expect(published).toBe(false);
    expect(moderate).not.toHaveBeenCalled(); // gate short-circuits before output moderation
    expect(insertedItems).toHaveLength(0);
  });
});
