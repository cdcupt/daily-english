/**
 * Fixed eval inputs for the AI Scenario English Trainer model comparison.
 * Hand-authored from the app's real task shapes. Kept tiny and deterministic so
 * runs are cheap and comparable across models.
 */
import type { FeedbackPromptInput } from '../src/ai/prompts.js';
import type { RubricInput } from '../src/scoring/rubric.js';
import type { ItemGenInput } from '../src/content/generate.js';

/** 3 instant-feedback learner responses at varied CEFR, each with real errors. */
export interface FeedbackCase {
  id: string;
  input: FeedbackPromptInput;
}

export const FEEDBACK_CASES: FeedbackCase[] = [
  {
    id: 'fb-a2-cafe',
    input: {
      cefrLevel: 'A2',
      learningGoal: 'Order a coffee and ask for the wifi password at a café',
      targetPhrases: ['Could I get', "What's the wifi password"],
      referenceAnswers: ["Could I get a flat white, please? And what's the wifi password?"],
      promptCn: '我想要一杯拿铁，请问wifi密码是多少？',
      // Errors: missing article, wrong verb form, awkward phrasing.
      userText: 'I want one latte please, and what is wifi the password?',
    },
  },
  {
    id: 'fb-b1-hotel',
    input: {
      cefrLevel: 'B1',
      learningGoal: 'Explain a billing problem to hotel reception and ask for a fix',
      targetPhrases: ['there seems to be a mistake', 'I was charged twice'],
      referenceAnswers: ['There seems to be a mistake on my bill — I was charged twice for the minibar.'],
      promptCn: '我的账单好像有问题，迷你吧被收了两次费。',
      // Errors: tense/collocation, preposition, slightly unnatural.
      userText: 'Hello, my bill have a problem, you charge me two times for the minibar, please fix it for me.',
    },
  },
  {
    id: 'fb-c1-meeting',
    input: {
      cefrLevel: 'C1',
      learningGoal: 'Politely push back on a deadline in a work meeting',
      targetPhrases: ['I appreciate the urgency', 'a more realistic timeline'],
      referenceAnswers: ['I appreciate the urgency, but I think we need a more realistic timeline to maintain quality.'],
      promptCn: '我理解很紧急，但我觉得我们需要一个更现实的时间表来保证质量。',
      // Subtle C1 issues: register slip, slightly off collocation, redundancy.
      userText: 'I know it is very urgent, but honestly I feel we should make the timeline more realistic so that we can keep the quality good and not make mistakes.',
    },
  },
];

/** 1 rubric-scoring input, run 3x per model to measure stability. */
export const RUBRIC_CASE: RubricInput = {
  scenarioGoal: 'Describe your hometown to a new colleague and explain why you like it',
  cefrTarget: 'B1',
  referenceAnswers: ['I come from a small coastal city. I like it because the seafood is fresh and the pace of life is relaxed.'],
  isSpoken: true,
  // A B1-ish spoken response with mild errors + a filler, good for stability testing.
  transcriptOrText:
    'So, um, I come from a small city near the sea. I like there very much because the seafood is very fresh and cheap, and the people they are friendly. The life is not too fast, so I can relax in the weekend with my family.',
};

export const RUBRIC_RUNS = 3;

/** 1 item-generation scenario. */
export const ITEM_GEN_CASE: ItemGenInput = {
  scenarioTitle: 'Returning a faulty product at an electronics store',
  scenarioGoal: 'Return a defective pair of headphones and request a refund or replacement',
  category: 'shopping',
  type: 'scenario_translation',
  cefrLevel: 'B1',
};
