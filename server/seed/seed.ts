import { eq } from 'drizzle-orm';
import { getDb, closeDb } from '../src/db/client.js';
import { scenarios, questionItems, contentSources } from '../src/db/schema.js';
import { SEED_SCENARIOS } from './scenarios.js';

const DEFAULT_RUBRIC = {
  vocabulary: 20, grammar: 25, naturalness: 25, task_completion: 20, pronunciation: 10,
} as const;

/**
 * Idempotent seed: upserts the starter scenario bank by slug / item_key.
 * Safe to re-run (deploy + CI). Every item is tied to an owned content_source
 * (license = owned) per the §9 source-policy.
 */
async function main() {
  const db = getDb();

  // One owned source row for the curated starter set.
  const [source] = await db
    .insert(contentSources)
    .values({ type: 'original', license: 'owned', reviewedBy: 'editor' })
    .returning();
  const sourceId = source!.id;

  let scenarioCount = 0;
  let itemCount = 0;

  for (const s of SEED_SCENARIOS) {
    const existing = await db.select().from(scenarios).where(eq(scenarios.slug, s.slug));
    let scenarioId: string;
    if (existing.length > 0) {
      scenarioId = existing[0]!.id;
    } else {
      const [row] = await db.insert(scenarios).values({
        slug: s.slug, title: s.title, category: s.category, cefrBand: s.cefrBand,
        userRole: s.userRole, aiRole: s.aiRole, goal: s.goal,
        keyPhrases: s.keyPhrases, commonMistakes: s.commonMistakes, practiceModes: s.practiceModes,
      }).returning();
      scenarioId = row!.id;
      scenarioCount += 1;
    }

    for (const it of s.items) {
      const existingItem = await db.select().from(questionItems).where(eq(questionItems.itemKey, it.itemKey));
      if (existingItem.length > 0) continue;
      await db.insert(questionItems).values({
        itemKey: it.itemKey, scenarioId, type: it.type, status: 'published', version: 1,
        cefrLevel: it.cefrLevel, difficultyScore: it.difficultyScore, learningGoal: it.learningGoal,
        promptCn: it.promptCn ?? null, referenceAnswers: it.referenceAnswers, targetPhrases: it.targetPhrases,
        commonMistakes: it.commonMistakes, rubric: it.rubric ?? DEFAULT_RUBRIC, sourceId,
      });
      itemCount += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`seeded: +${scenarioCount} scenarios, +${itemCount} items (${SEED_SCENARIOS.length} total scenarios defined)`);
  await closeDb();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed failed', err);
  process.exit(1);
});
