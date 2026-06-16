import { type ChatClient } from './client.js';
import { runStructured } from './runner.js';
import { runTask } from './execute.js';
import { PROMPT_VERSIONS, instantFeedbackSystem, lightFeedbackSystem, instantFeedbackUser, type FeedbackPromptInput } from './prompts.js';
import { FeedbackPayloadSchema, FEEDBACK_JSON_SCHEMA, type FeedbackPayload } from '../schemas.js';

export interface FeedbackResult {
  payload: FeedbackPayload;
  raw: string;
  repaired: boolean;
  model: string;
  promptVersion: string;
}

/**
 * Instant 3-tier correction. In production the model is resolved per the
 * configurable AI registry (task `feedback`). A ChatClient can be injected to
 * bypass the registry in unit tests.
 */
export async function generateInstantFeedback(
  input: FeedbackPromptInput,
  client?: ChatClient,
): Promise<FeedbackResult> {
  const system = instantFeedbackSystem(input.cefrLevel);
  const user = instantFeedbackUser(input);
  if (client) {
    const r = await runStructured<FeedbackPayload>({ client, system, user, schema: FeedbackPayloadSchema, jsonSchema: FEEDBACK_JSON_SCHEMA, temperature: 0.2 });
    return { payload: r.data, raw: r.raw, repaired: r.repaired, model: 'injected', promptVersion: PROMPT_VERSIONS.instantFeedback };
  }
  const r = await runTask<FeedbackPayload>({ task: 'feedback', system, user, schema: FeedbackPayloadSchema, jsonSchema: FEEDBACK_JSON_SCHEMA, temperature: 0.2 });
  return { payload: r.data, raw: r.raw, repaired: r.repaired, model: r.model, promptVersion: PROMPT_VERSIONS.instantFeedback };
}

/** Light correction for a dialogue/role-play turn (task `dialogue`). */
export async function generateDialogueFeedback(
  input: FeedbackPromptInput,
  client?: ChatClient,
): Promise<FeedbackResult> {
  const system = lightFeedbackSystem(input.cefrLevel);
  const user = instantFeedbackUser(input);
  if (client) {
    const r = await runStructured<FeedbackPayload>({ client, system, user, schema: FeedbackPayloadSchema, jsonSchema: FEEDBACK_JSON_SCHEMA, temperature: 0.2 });
    return { payload: r.data, raw: r.raw, repaired: r.repaired, model: 'injected', promptVersion: PROMPT_VERSIONS.lightFeedback };
  }
  const r = await runTask<FeedbackPayload>({ task: 'dialogue', system, user, schema: FeedbackPayloadSchema, jsonSchema: FEEDBACK_JSON_SCHEMA, temperature: 0.2 });
  return { payload: r.data, raw: r.raw, repaired: r.repaired, model: r.model, promptVersion: PROMPT_VERSIONS.lightFeedback };
}
