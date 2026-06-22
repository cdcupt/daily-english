import { type ChatClient } from '../ai/client.js';
import { runStructured } from '../ai/runner.js';
import { runTask } from '../ai/execute.js';
import { ItemGenSchema, ITEM_GEN_JSON_SCHEMA, type ItemGen } from '../schemas.js';

export const ITEM_GEN_PROMPT_VERSION = 'gen.item.v1';

/**
 * AI generation of a new question item (TECH §B4/§B8). In production the model
 * is resolved via the configurable registry (task `item_gen`, default
 * gemini-3-flash with an openai fallback on 503). New items enter the lifecycle
 * as drafts pending review.
 */
export interface ItemGenInput {
  scenarioTitle: string;
  scenarioGoal: string;
  category: string;
  type: 'scenario_translation' | 'scenario_dialogue' | 'topic_description';
  cefrLevel: string;
}

function buildPrompts(input: ItemGenInput): { system: string; user: string } {
  const system = [
    'You generate ONE high-quality English-practice item for a real-world scenario.',
    `Type: ${input.type}. Target CEFR: ${input.cefrLevel}.`,
    'For translation items, prompt_cn is a natural Chinese sentence the learner must render in idiomatic English;',
    'reference_answers are 1–3 natural English versions; target_phrases are reusable patterns; common_mistakes are',
    'realistic learner errors with short fixes; difficulty_score is 0–100 matching the CEFR. Return JSON only.',
  ].join(' ');
  const user = `Scenario: ${input.scenarioTitle} (${input.category}). Goal: ${input.scenarioGoal}.`;
  return { system, user };
}

export async function generateItem(
  input: ItemGenInput,
  client?: ChatClient,
  opts: { timeoutMs?: number } = {},
): Promise<{ item: ItemGen; raw: string; promptVersion: string; model?: string }> {
  const { system, user } = buildPrompts(input);
  if (client) {
    const r = await runStructured<ItemGen>({ client, system, user, schema: ItemGenSchema, jsonSchema: ITEM_GEN_JSON_SCHEMA, temperature: 0.4 });
    return { item: r.data, raw: r.raw, promptVersion: ITEM_GEN_PROMPT_VERSION };
  }
  const r = await runTask<ItemGen>({ task: 'item_gen', system, user, schema: ItemGenSchema, jsonSchema: ITEM_GEN_JSON_SCHEMA, temperature: 0.4, timeoutMs: opts.timeoutMs });
  return { item: r.data, raw: r.raw, promptVersion: ITEM_GEN_PROMPT_VERSION, model: r.model };
}
