import type { expressionBankItems } from '../db/schema.js';

type Expression = typeof expressionBankItems.$inferSelect;
export type ReviewKind = 'use_pattern' | 'ask_politely' | 're_enter_scenario';

/**
 * Templated review-task prompt from a saved expression (TECH §12). Deterministic
 * (no AI call needed per task) and testable; can be upgraded to AI-authored
 * prompts later.
 */
export function reviewPromptFor(expr: Expression): { prompt: string; kind: ReviewKind } {
  switch (expr.type) {
    case 'sentence_pattern':
      return { prompt: `Use the pattern "${expr.content}" in a new sentence.`, kind: 'use_pattern' };
    case 'mistake_pair':
      return {
        prompt: `You once said "${expr.userOriginal ?? '...'}". Say it naturally — try: "${expr.naturalExpression ?? expr.content}".`,
        kind: 'ask_politely',
      };
    case 'scenario_phrase':
      return { prompt: `Re-enter the scenario and use "${expr.content}" naturally.`, kind: 're_enter_scenario' };
    default:
      return { prompt: `Use "${expr.content}" correctly in a sentence.`, kind: 'use_pattern' };
  }
}
