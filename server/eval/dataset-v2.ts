/**
 * Expanded eval dataset (v2) for the rigorous quality + error-rate benchmark.
 * Hand-authored from the app's real task shapes. Bigger N, varied CEFR/error
 * types/scenarios; ordering pairs for rubric monotonicity; multiple item-gen
 * scenario×level combos. Deterministic so runs are comparable across models.
 *
 * Real inputs only — no fabricated outputs. Outputs come from live API calls.
 */
import type { FeedbackPromptInput } from '../src/ai/prompts.js';
import type { RubricInput } from '../src/scoring/rubric.js';
import type { ItemGenInput } from '../src/content/generate.js';

// ---------------------------------------------------------------------------
// 1) INSTANT FEEDBACK — 16 diverse learner inputs
//    Varied CEFR (A1–C1), varied dominant error types, varied scenarios.
//    `errorFocus` documents the intended error(s) so the judge can check the
//    `corrected`/`natural_version` actually fix the right thing.
// ---------------------------------------------------------------------------
export interface FeedbackCase {
  id: string;
  errorFocus: string; // human note for the judge prompt
  input: FeedbackPromptInput;
}

export const FEEDBACK_CASES: FeedbackCase[] = [
  {
    id: 'fb-a1-greeting',
    errorFocus: 'A1: copula/verb omission, no article',
    input: {
      cefrLevel: 'A1',
      learningGoal: 'Introduce yourself to a new classmate',
      targetPhrases: ['My name is', 'Nice to meet you'],
      referenceAnswers: ['Hi, my name is Wei. Nice to meet you!'],
      promptCn: '你好，我叫伟，很高兴认识你。',
      userText: 'Hello, I Wei, nice meet you.',
    },
  },
  {
    id: 'fb-a1-shop',
    errorFocus: 'A1: missing article + plural, blunt request',
    input: {
      cefrLevel: 'A1',
      learningGoal: 'Buy a bottle of water at a convenience store',
      targetPhrases: ['Can I have', 'How much is it'],
      referenceAnswers: ['Can I have a bottle of water? How much is it?'],
      promptCn: '我可以要一瓶水吗？多少钱？',
      userText: 'I want water. How much?',
    },
  },
  {
    id: 'fb-a2-cafe',
    errorFocus: 'A2: missing article, word-order in question',
    input: {
      cefrLevel: 'A2',
      learningGoal: 'Order a coffee and ask for the wifi password at a café',
      targetPhrases: ['Could I get', "What's the wifi password"],
      referenceAnswers: ["Could I get a flat white, please? And what's the wifi password?"],
      promptCn: '我想要一杯拿铁，请问wifi密码是多少？',
      userText: 'I want one latte please, and what is wifi the password?',
    },
  },
  {
    id: 'fb-a2-directions',
    errorFocus: 'A2: preposition + tense for asking directions',
    input: {
      cefrLevel: 'A2',
      learningGoal: 'Ask a stranger how to get to the train station',
      targetPhrases: ['Excuse me', 'How do I get to'],
      referenceAnswers: ['Excuse me, how do I get to the train station?'],
      promptCn: '打扰一下，请问火车站怎么走？',
      userText: 'Excuse me, how I can go to train station? It is in where?',
    },
  },
  {
    id: 'fb-a2-restaurant',
    errorFocus: 'A2: countable/uncountable + politeness',
    input: {
      cefrLevel: 'A2',
      learningGoal: 'Order food and ask for a recommendation',
      targetPhrases: ['I would like', 'What do you recommend'],
      referenceAnswers: ['I would like the noodles. What do you recommend to drink?'],
      promptCn: '我想点面条，你推荐喝什么？',
      userText: 'I like eat noodle. What you recommend for drink?',
    },
  },
  {
    id: 'fb-b1-hotel',
    errorFocus: 'B1: subject-verb agreement, collocation, preposition',
    input: {
      cefrLevel: 'B1',
      learningGoal: 'Explain a billing problem to hotel reception and ask for a fix',
      targetPhrases: ['there seems to be a mistake', 'I was charged twice'],
      referenceAnswers: ['There seems to be a mistake on my bill — I was charged twice for the minibar.'],
      promptCn: '我的账单好像有问题，迷你吧被收了两次费。',
      userText: 'Hello, my bill have a problem, you charge me two times for the minibar, please fix it for me.',
    },
  },
  {
    id: 'fb-b1-doctor',
    errorFocus: 'B1: present perfect vs past, body-part collocation',
    input: {
      cefrLevel: 'B1',
      learningGoal: 'Describe a symptom to a doctor',
      targetPhrases: ['I have had', 'for a few days'],
      referenceAnswers: ["I've had a sore throat and a headache for a few days."],
      promptCn: '我嗓子疼、头疼，已经持续几天了。',
      userText: 'My throat is paining and I am having headache since some days before.',
    },
  },
  {
    id: 'fb-b1-job',
    errorFocus: 'B1: word-order, articles, naturalness in self-description',
    input: {
      cefrLevel: 'B1',
      learningGoal: 'Answer "tell me about yourself" in a job interview',
      targetPhrases: ['I have experience in', 'I am good at'],
      referenceAnswers: ['I have three years of experience in marketing, and I am good at data analysis.'],
      promptCn: '我有三年市场营销经验，擅长数据分析。',
      userText: 'I working in marketing three years, and I very good in analysis the data.',
    },
  },
  {
    id: 'fb-b1-complaint',
    errorFocus: 'B1: modal/conditional, register (too aggressive)',
    input: {
      cefrLevel: 'B1',
      learningGoal: 'Return a faulty item and ask for a refund',
      targetPhrases: ['I would like to return', 'it stopped working'],
      referenceAnswers: ['I would like to return these headphones — they stopped working after two days.'],
      promptCn: '我想退这副耳机，用了两天就坏了。',
      userText: 'I want return this headphone now, it broken after two day, you must give my money back.',
    },
  },
  {
    id: 'fb-b1-smalltalk',
    errorFocus: 'B1: tense, naturalness of weekend small talk',
    input: {
      cefrLevel: 'B1',
      learningGoal: 'Make small talk with a colleague about the weekend',
      targetPhrases: ['How was your weekend', 'I went to'],
      referenceAnswers: ['How was your weekend? I went hiking with some friends.'],
      promptCn: '你周末过得怎么样？我和朋友去爬山了。',
      userText: 'How is your weekend? I go to hiking with my friends and it is very fun.',
    },
  },
  {
    id: 'fb-b2-negotiate',
    errorFocus: 'B2: hedging/collocation, slightly unnatural phrasing',
    input: {
      cefrLevel: 'B2',
      learningGoal: 'Negotiate a lower price with a supplier',
      targetPhrases: ['Would you be able to', 'meet us halfway'],
      referenceAnswers: ['Would you be able to come down a little on the price if we order in bulk?'],
      promptCn: '如果我们大批量订购，价格能不能再低一点？',
      userText: 'If we buy very much quantity, is it possible you make the price more cheaper for us?',
    },
  },
  {
    id: 'fb-b2-presentation',
    errorFocus: 'B2: signposting, article, slightly off collocation',
    input: {
      cefrLevel: 'B2',
      learningGoal: 'Open a short presentation and state your agenda',
      targetPhrases: ['Today I would like to', 'walk you through'],
      referenceAnswers: ['Today I would like to walk you through our results and what they mean for next quarter.'],
      promptCn: '今天我想带大家了解一下我们的结果，以及它对下季度的意义。',
      userText: 'Today I want to introduce you our result and the meaning of it for the next quarter.',
    },
  },
  {
    id: 'fb-b2-email',
    errorFocus: 'B2: register (too casual for email), preposition',
    input: {
      cefrLevel: 'B2',
      learningGoal: 'Politely chase a late reply by email',
      targetPhrases: ['I just wanted to follow up', 'at your earliest convenience'],
      referenceAnswers: ['I just wanted to follow up on my previous email and would appreciate a reply at your earliest convenience.'],
      promptCn: '我想跟进一下之前的邮件，希望您方便时尽快回复。',
      userText: 'Hey, why you not reply my last email? Please answer me fast when you can.',
    },
  },
  {
    id: 'fb-c1-meeting',
    errorFocus: 'C1: subtle register slip + redundancy',
    input: {
      cefrLevel: 'C1',
      learningGoal: 'Politely push back on a deadline in a work meeting',
      targetPhrases: ['I appreciate the urgency', 'a more realistic timeline'],
      referenceAnswers: ['I appreciate the urgency, but I think we need a more realistic timeline to maintain quality.'],
      promptCn: '我理解很紧急，但我觉得我们需要一个更现实的时间表来保证质量。',
      userText: 'I know it is very urgent, but honestly I feel we should make the timeline more realistic so that we can keep the quality good and not make mistakes.',
    },
  },
  {
    id: 'fb-c1-feedback',
    errorFocus: 'C1: near-native; mild collocation/word-choice only',
    input: {
      cefrLevel: 'C1',
      learningGoal: 'Give constructive feedback on a colleague’s draft',
      targetPhrases: ['one thing I would tweak', 'tighten up'],
      referenceAnswers: ['The structure is solid; one thing I would tweak is the intro — it could be tightened up a bit.'],
      promptCn: '整体结构不错，我唯一想调整的是开头，可以再精炼一点。',
      userText: 'The structure is quite good; the only thing I would change is the introduction, which I think can be more concise and less long.',
    },
  },
  {
    id: 'fb-c1-already-good',
    errorFocus: 'C1: already correct & natural — should NOT over-correct',
    input: {
      cefrLevel: 'C1',
      learningGoal: 'Decline an invitation politely',
      targetPhrases: ['I’m afraid I won’t be able to', 'rain check'],
      referenceAnswers: ['I’m afraid I won’t be able to make it, but could I take a rain check?'],
      promptCn: '恐怕我去不了了，但能改天吗？',
      userText: 'I’m afraid I won’t be able to make it this time, but could I take a rain check?',
    },
  },
];

// ---------------------------------------------------------------------------
// 2) RUBRIC SCORING — 8 inputs spanning weak→strong, each run 3× per model.
//    `expectedBand` documents the rough quality so the judge / sanity checks
//    can flag wildly miscalibrated scores. `qualityRank` (1=weakest) lets us
//    build ordering pairs below.
// ---------------------------------------------------------------------------
export interface RubricCase {
  id: string;
  qualityRank: number; // 1 = weakest answer, higher = stronger
  expectedBand: string;
  input: RubricInput;
}

export const RUBRIC_CASES: RubricCase[] = [
  {
    id: 'ru-1-very-weak',
    qualityRank: 1,
    expectedBand: 'A1/very weak',
    input: {
      scenarioGoal: 'Describe your hometown to a new colleague and explain why you like it',
      cefrTarget: 'B1',
      referenceAnswers: ['I come from a small coastal city. I like it because the seafood is fresh and the pace of life is relaxed.'],
      isSpoken: true,
      transcriptOrText: 'My city. Is small. I like. Sea fish good. People nice.',
    },
  },
  {
    id: 'ru-2-weak',
    qualityRank: 2,
    expectedBand: 'A2',
    input: {
      scenarioGoal: 'Describe your hometown to a new colleague and explain why you like it',
      cefrTarget: 'B1',
      referenceAnswers: ['I come from a small coastal city. I like it because the seafood is fresh and the pace of life is relaxed.'],
      isSpoken: true,
      transcriptOrText: 'I come from small city near sea. I like it because fish is very fresh and the people they very kind to me.',
    },
  },
  {
    id: 'ru-3-mid',
    qualityRank: 3,
    expectedBand: 'B1 (target)',
    input: {
      scenarioGoal: 'Describe your hometown to a new colleague and explain why you like it',
      cefrTarget: 'B1',
      referenceAnswers: ['I come from a small coastal city. I like it because the seafood is fresh and the pace of life is relaxed.'],
      isSpoken: true,
      transcriptOrText:
        'So, um, I come from a small city near the sea. I like there very much because the seafood is very fresh and cheap, and the people they are friendly. The life is not too fast, so I can relax in the weekend with my family.',
    },
  },
  {
    id: 'ru-4-strong',
    qualityRank: 4,
    expectedBand: 'B2/C1 strong',
    input: {
      scenarioGoal: 'Describe your hometown to a new colleague and explain why you like it',
      cefrTarget: 'B1',
      referenceAnswers: ['I come from a small coastal city. I like it because the seafood is fresh and the pace of life is relaxed.'],
      isSpoken: true,
      transcriptOrText:
        'I grew up in a small coastal town in the south. What I love about it is the slower pace of life — you can actually breathe. The seafood is incredibly fresh, and because everyone knows each other, there is a real sense of community that I miss living in the city.',
    },
  },
  {
    id: 'ru-5-job-weak',
    qualityRank: 1,
    expectedBand: 'A2 weak',
    input: {
      scenarioGoal: 'Explain why you want this job in an interview',
      cefrTarget: 'B2',
      referenceAnswers: ['I want this job because it lets me use my analytical skills on problems that matter.'],
      isSpoken: false,
      transcriptOrText: 'I want this job because I need money and the company is big and famous so it is good for me.',
    },
  },
  {
    id: 'ru-6-job-strong',
    qualityRank: 4,
    expectedBand: 'C1 strong',
    input: {
      scenarioGoal: 'Explain why you want this job in an interview',
      cefrTarget: 'B2',
      referenceAnswers: ['I want this job because it lets me use my analytical skills on problems that matter.'],
      isSpoken: false,
      transcriptOrText:
        'What draws me to this role is the chance to apply my analytical background to problems that genuinely move the business. I have spent the last few years turning messy data into decisions, and this position would let me do that at a much larger scale.',
    },
  },
  {
    id: 'ru-7-complaint-mid',
    qualityRank: 3,
    expectedBand: 'B1',
    input: {
      scenarioGoal: 'Complain about a noisy hotel room and request a change',
      cefrTarget: 'B1',
      referenceAnswers: ['My room is very noisy because of the street. Could I please move to a quieter room?'],
      isSpoken: true,
      transcriptOrText: 'Excuse me, my room is very noisy because the street is just outside the window, so I cannot sleep well. Could I change to a more quiet room please?',
    },
  },
  {
    id: 'ru-8-complaint-weak',
    qualityRank: 2,
    expectedBand: 'A2',
    input: {
      scenarioGoal: 'Complain about a noisy hotel room and request a change',
      cefrTarget: 'B1',
      referenceAnswers: ['My room is very noisy because of the street. Could I please move to a quieter room?'],
      isSpoken: true,
      transcriptOrText: 'My room very noisy. Street outside. I no sleep. I want other room.',
    },
  },
];

export const RUBRIC_RUNS = 3;

/**
 * Ordering pairs: within the SAME scenario, the higher-quality answer MUST score
 * higher (by app-total) than the lower-quality one. Each pair references caseIds.
 * (>=3 pairs as required.)
 */
export const RUBRIC_ORDERING_PAIRS: Array<{ id: string; worse: string; better: string }> = [
  { id: 'ord-hometown-weak-vs-mid', worse: 'ru-1-very-weak', better: 'ru-3-mid' },
  { id: 'ord-hometown-mid-vs-strong', worse: 'ru-3-mid', better: 'ru-4-strong' },
  { id: 'ord-job-weak-vs-strong', worse: 'ru-5-job-weak', better: 'ru-6-job-strong' },
  { id: 'ord-complaint-weak-vs-mid', worse: 'ru-8-complaint-weak', better: 'ru-7-complaint-mid' },
];

// ---------------------------------------------------------------------------
// 3) ITEM GENERATION — 6 scenario × level combos across categories & types.
// ---------------------------------------------------------------------------
export interface ItemGenCase {
  id: string;
  input: ItemGenInput;
}

export const ITEM_GEN_CASES: ItemGenCase[] = [
  {
    id: 'ig-shopping-b1',
    input: {
      scenarioTitle: 'Returning a faulty product at an electronics store',
      scenarioGoal: 'Return a defective pair of headphones and request a refund or replacement',
      category: 'shopping',
      type: 'scenario_translation',
      cefrLevel: 'B1',
    },
  },
  {
    id: 'ig-travel-a2',
    input: {
      scenarioTitle: 'Checking in at an airport counter',
      scenarioGoal: 'Check in for a flight, drop a bag, and ask for a window seat',
      category: 'travel',
      type: 'scenario_translation',
      cefrLevel: 'A2',
    },
  },
  {
    id: 'ig-work-b2',
    input: {
      scenarioTitle: 'Asking your manager for a deadline extension',
      scenarioGoal: 'Explain why you need more time and propose a new deadline',
      category: 'work',
      type: 'scenario_dialogue',
      cefrLevel: 'B2',
    },
  },
  {
    id: 'ig-health-b1',
    input: {
      scenarioTitle: 'Booking a doctor’s appointment by phone',
      scenarioGoal: 'Describe a symptom and book the earliest available appointment',
      category: 'health',
      type: 'scenario_translation',
      cefrLevel: 'B1',
    },
  },
  {
    id: 'ig-dining-a2',
    input: {
      scenarioTitle: 'Ordering for a group at a busy restaurant',
      scenarioGoal: 'Order dishes for three people and mention a food allergy',
      category: 'dining',
      type: 'scenario_translation',
      cefrLevel: 'A2',
    },
  },
  {
    id: 'ig-social-c1',
    input: {
      scenarioTitle: 'Declining a project invitation diplomatically',
      scenarioGoal: 'Turn down a colleague’s request to join a project without damaging the relationship',
      category: 'social',
      type: 'topic_description',
      cefrLevel: 'C1',
    },
  },
];
