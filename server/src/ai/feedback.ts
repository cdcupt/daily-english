import { OpenAIChatClient, type ChatClient } from './client.js';
import { runStructured } from './runner.js';
import { PROMPT_VERSIONS, instantFeedbackSystem, lightFeedbackSystem, instantFeedbackUser, type FeedbackPromptInput } from './prompts.js';
import { FeedbackPayloadSchema, FEEDBACK_JSON_SCHEMA, type FeedbackPayload } from '../schemas.js';
import { env } from '../env.js';

export interface FeedbackResult {
  payload: FeedbackPayload;
  raw: string;
  repaired: boolean;
  model: string;
  promptVersion: string;
}

/**
 * Generate instant 3-tier correction for a translation/short response.
 * Pure orchestration over the structured runner; the ChatClient is injectable
 * so unit tests run without hitting the network.
 */
export async function generateInstantFeedback(
  input: FeedbackPromptInput,
  client: ChatClient = new OpenAIChatClient(),
): Promise<FeedbackResult> {
  const result = await runStructured<FeedbackPayload>({
    client,
    system: instantFeedbackSystem(input.cefrLevel),
    user: instantFeedbackUser(input),
    schema: FeedbackPayloadSchema,
    jsonSchema: FEEDBACK_JSON_SCHEMA,
    temperature: 0.2,
  });
  return {
    payload: result.data,
    raw: result.raw,
    repaired: result.repaired,
    model: env.AI_TEXT_MODEL,
    promptVersion: PROMPT_VERSIONS.instantFeedback,
  };
}

/** Light correction for a dialogue/role-play turn (flow-preserving, 0–1 issues). */
export async function generateDialogueFeedback(
  input: FeedbackPromptInput,
  client: ChatClient = new OpenAIChatClient(),
): Promise<FeedbackResult> {
  const result = await runStructured<FeedbackPayload>({
    client,
    system: lightFeedbackSystem(input.cefrLevel),
    user: instantFeedbackUser(input),
    schema: FeedbackPayloadSchema,
    jsonSchema: FEEDBACK_JSON_SCHEMA,
    temperature: 0.2,
  });
  return {
    payload: result.data,
    raw: result.raw,
    repaired: result.repaired,
    model: env.AI_TEXT_MODEL,
    promptVersion: PROMPT_VERSIONS.lightFeedback,
  };
}
