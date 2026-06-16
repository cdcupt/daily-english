import { type ChatClient } from '../ai/client.js';
import { runStructured } from '../ai/runner.js';
import { runTask } from '../ai/execute.js';
import { RubricScoreSchema, RUBRIC_JSON_SCHEMA, type RubricScore } from '../schemas.js';

export const RUBRIC_PROMPT_VERSION = 'score.rubric.v1';

/**
 * LLM rubric scoring (TECH §B5) — temp 0 + calibration anchors for stability.
 * In production the model is resolved via the configurable registry (task
 * `scoring`, default gemini-3.1-pro — the most repeatable model per the eval).
 */
const SYSTEM = [
  'You are a strict, consistent English assessor. Score the learner response on six 0–100 dimensions:',
  'vocabulary, grammar, coherence, interaction, fluency, pronunciation.',
  'Use these calibration anchors: 30 = beginner with frequent breakdowns; 55 = understandable with errors;',
  '70 = solid B1; 85 = strong B2/C1; 95 = near-native. Be reproducible — identical input must score identically.',
  'Also return a one-sentence summary and up to 4 concrete weak_points. Return JSON only.',
].join(' ');

export interface RubricInput {
  scenarioGoal: string; cefrTarget: string; referenceAnswers: string[];
  transcriptOrText: string; isSpoken: boolean;
}

function buildUser(input: RubricInput): string {
  return [
    `Scenario goal: ${input.scenarioGoal}`,
    `Target CEFR: ${input.cefrTarget}`,
    `Modality: ${input.isSpoken ? 'spoken (transcribed)' : 'written'}`,
    input.referenceAnswers.length ? `Reference: ${input.referenceAnswers.join(' | ')}` : '',
    '',
    `Learner: "${input.transcriptOrText}"`,
  ].filter(Boolean).join('\n');
}

export async function scoreRubric(
  input: RubricInput,
  client?: ChatClient,
): Promise<{ rubric: RubricScore; raw: string; repaired: boolean; promptVersion: string; model?: string }> {
  const user = buildUser(input);
  if (client) {
    const r = await runStructured<RubricScore>({ client, system: SYSTEM, user, schema: RubricScoreSchema, jsonSchema: RUBRIC_JSON_SCHEMA, temperature: 0 });
    return { rubric: r.data, raw: r.raw, repaired: r.repaired, promptVersion: RUBRIC_PROMPT_VERSION };
  }
  const r = await runTask<RubricScore>({ task: 'scoring', system: SYSTEM, user, schema: RubricScoreSchema, jsonSchema: RUBRIC_JSON_SCHEMA, temperature: 0 });
  return { rubric: r.data, raw: r.raw, repaired: r.repaired, promptVersion: RUBRIC_PROMPT_VERSION, model: r.model };
}
