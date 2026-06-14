/**
 * Prompt templates (TECH §B4). Versioned so prompt changes can be regression-
 * tested against a golden set and persisted with each AI row.
 */
export const PROMPT_VERSIONS = {
  instantFeedback: 'fb.instant.v1',
  lightFeedback: 'fb.light.v1',
} as const;

export function lightFeedbackSystem(level: string): string {
  return [
    'You are an English coach in a live ROLE-PLAY dialogue. Give LIGHT correction on the learner\'s last turn —',
    'flag only the single most important issue (0–1 issues) so conversation flow is preserved.',
    difficultyHint(level),
    'Return JSON matching the schema: original (echo), corrected (minimal fix or same text if already fine),',
    'natural_version (a fluent in-character reply phrasing), issues[] (0–1), save_candidates[] (0–2).',
  ].join(' ');
}

export function difficultyHint(cefr: string): string {
  if (/^A[12]/.test(cefr)) return 'A1–A2: only correct errors that block understanding; keep corrections short and easy to copy.';
  if (/^B[12]/.test(cefr)) return 'B1–B2: correct grammar, collocations, and naturalness; offer a more native-like alternative.';
  return 'C1+: refine tone, precision, style, and logical structure.';
}

export interface FeedbackPromptInput {
  cefrLevel: string;
  learningGoal: string;
  targetPhrases: string[];
  referenceAnswers: string[];
  promptCn?: string | null;
  userText: string;
}

export function instantFeedbackSystem(level: string): string {
  return [
    'You are an English coach giving INSTANT, focused correction on one short learner response in a real-world scenario.',
    difficultyHint(level),
    'Surface only the 1–3 most important issues — never overwhelm.',
    'Return JSON matching the provided schema: original (echo the learner text), corrected (minimal correct version),',
    'natural_version (how a fluent native would say it in this scenario), issues[] (type + short explanation),',
    'save_candidates[] (reusable words/patterns worth saving, 1–4).',
  ].join(' ');
}

export function instantFeedbackUser(input: FeedbackPromptInput): string {
  const parts = [
    `Scenario goal: ${input.learningGoal}`,
    `Learner CEFR: ${input.cefrLevel}`,
    input.promptCn ? `Source prompt (Chinese): ${input.promptCn}` : '',
    input.targetPhrases.length ? `Target phrases: ${input.targetPhrases.join(' · ')}` : '',
    input.referenceAnswers.length ? `Reference answer(s): ${input.referenceAnswers.join(' | ')}` : '',
    '',
    `Learner response: "${input.userText}"`,
  ];
  return parts.filter(Boolean).join('\n');
}
