import { OpenAIChatClient, type ChatClient } from '../ai/client.js';
import { runStructured } from '../ai/runner.js';
import { ItemGenSchema, ITEM_GEN_JSON_SCHEMA, type ItemGen } from '../schemas.js';

export const ITEM_GEN_PROMPT_VERSION = 'gen.item.v1';

/**
 * AI generation of a new question item for the content pipeline (TECH §B4/§B8).
 * Output is validated; the new item enters the lifecycle as a draft and must be
 * reviewed before publishing. Source/license metadata is attached by the caller.
 */
export interface ItemGenInput {
  scenarioTitle: string;
  scenarioGoal: string;
  category: string;
  type: 'scenario_translation' | 'scenario_dialogue' | 'topic_description';
  cefrLevel: string;
}

export async function generateItem(
  input: ItemGenInput,
  client: ChatClient = new OpenAIChatClient(),
): Promise<{ item: ItemGen; raw: string; promptVersion: string }> {
  const system = [
    'You generate ONE high-quality English-practice item for a real-world scenario.',
    `Type: ${input.type}. Target CEFR: ${input.cefrLevel}.`,
    'For translation items, prompt_cn is a natural Chinese sentence the learner must render in idiomatic English;',
    'reference_answers are 1–3 natural English versions; target_phrases are reusable patterns; common_mistakes are',
    'realistic learner errors with short fixes; difficulty_score is 0–100 matching the CEFR. Return JSON only.',
  ].join(' ');
  const user = `Scenario: ${input.scenarioTitle} (${input.category}). Goal: ${input.scenarioGoal}.`;

  const r = await runStructured<ItemGen>({
    client, system, user, schema: ItemGenSchema, jsonSchema: ITEM_GEN_JSON_SCHEMA, temperature: 0.4,
  });
  return { item: r.data, raw: r.raw, promptVersion: ITEM_GEN_PROMPT_VERSION };
}
