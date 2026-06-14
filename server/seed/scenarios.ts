import type { Rubric, CommonMistake } from '../src/db/schema.js';

/**
 * Starter scenario bank — 8 categories (DESIGN-finalized), 2 scenarios each.
 * Each scenario ships one scenario_translation item to prove the loop end to
 * end; dialogue / topic-description items and the rest of the 60–80 target are
 * added via the content-generation pipeline + admin (later slices).
 */
const DEFAULT_RUBRIC: Rubric = {
  vocabulary: 20, grammar: 25, naturalness: 25, task_completion: 20, pronunciation: 10,
};

export type SeedItem = {
  itemKey: string;
  type: 'scenario_translation' | 'scenario_dialogue' | 'topic_description';
  cefrLevel: string;
  difficultyScore: number;
  learningGoal: string;
  promptCn?: string;
  referenceAnswers: string[];
  targetPhrases: string[];
  commonMistakes: CommonMistake[];
  rubric?: Rubric;
};

export type SeedScenario = {
  slug: string; title: string; category: string; cefrBand: string;
  userRole: string; aiRole: string; goal: string;
  keyPhrases: string[]; commonMistakes: string[];
  practiceModes: Array<'translation' | 'dialogue' | 'description'>;
  items: SeedItem[];
};

export const SEED_SCENARIOS: SeedScenario[] = [
  // ---------- Daily Life ----------
  {
    slug: 'coffee_shop_order', title: 'Ordering at a Coffee Shop', category: 'daily_life',
    cefrBand: 'A2-B1', userRole: 'Customer', aiRole: 'Barista',
    goal: 'Order a drink and politely request customization',
    keyPhrases: ["I'd like...", 'Could you make it with...?', 'with no sugar', 'less ice'],
    commonMistakes: ["Using 'I want...' too directly", "Saying 'can less ice' (incomplete)"],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'coffee_shop_order_a2_001', type: 'scenario_translation', cefrLevel: 'A2', difficultyScore: 42,
      learningGoal: 'Make a polite drink order and request customization',
      promptCn: '我想要一杯冰美式，不加糖，可以少放点冰吗？',
      referenceAnswers: [
        "I'd like an iced Americano with no sugar. Could you make it with less ice?",
        'Can I get an iced Americano without sugar and with less ice?',
      ],
      targetPhrases: ["I'd like...", 'Could you make it with...?', 'with no sugar', 'less ice'],
      commonMistakes: [{ wrong: 'can less ice', explanation: 'Incomplete. Use: Could you make it with less ice?' }],
    }],
  },
  {
    slug: 'asking_directions', title: 'Asking for Directions', category: 'daily_life',
    cefrBand: 'A2', userRole: 'Tourist', aiRole: 'Passerby',
    goal: 'Ask how to get to a place and confirm the route',
    keyPhrases: ['Excuse me, how do I get to...?', 'Is it far?', 'Should I turn left or right?'],
    commonMistakes: ["Saying 'Where is...' too abruptly without 'Excuse me'"],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'asking_directions_a2_001', type: 'scenario_translation', cefrLevel: 'A2', difficultyScore: 38,
      learningGoal: 'Politely ask for and confirm directions',
      promptCn: '打扰一下，请问去地铁站怎么走？走路远吗？',
      referenceAnswers: ['Excuse me, how do I get to the subway station? Is it far on foot?'],
      targetPhrases: ['Excuse me, how do I get to...?', 'Is it far?'],
      commonMistakes: [{ wrong: 'Where subway?', explanation: "Use a full question: 'How do I get to the subway station?'" }],
    }],
  },
  // ---------- Travel ----------
  {
    slug: 'hotel_checkin', title: 'Hotel Check-in', category: 'travel',
    cefrBand: 'A2-B1', userRole: 'Guest', aiRole: 'Receptionist',
    goal: 'Check in, ask about early check-in and breakfast',
    keyPhrases: ["I'd like to check in.", 'Would it be possible to...?', 'Is breakfast included?'],
    commonMistakes: ["'I want check in early' (missing 'to')"],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'hotel_checkin_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 55,
      learningGoal: 'Politely request early check-in',
      promptCn: '请问可以提前办理入住吗？早餐包含在房费里吗？',
      referenceAnswers: ['Would it be possible to check in early? Is breakfast included in the room rate?'],
      targetPhrases: ['Would it be possible to...?', 'Is breakfast included?'],
      commonMistakes: [{ wrong: 'I want check in early', explanation: "Use: I'd like to check in early / Would it be possible to check in early?" }],
    }],
  },
  {
    slug: 'airport_rebooking', title: 'Rebooking a Missed Flight', category: 'travel',
    cefrBand: 'B1', userRole: 'Passenger', aiRole: 'Airline agent',
    goal: 'Explain a missed flight and ask to be rebooked',
    keyPhrases: ['I missed my connection.', 'Could you put me on the next flight?', 'What are my options?'],
    commonMistakes: ["Overusing 'I want' instead of 'Could you...'"],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'airport_rebooking_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 58,
      learningGoal: 'Explain a problem and request a solution politely',
      promptCn: '我错过了转机航班，能帮我改签到下一班吗？我有哪些选择？',
      referenceAnswers: ['I missed my connecting flight. Could you put me on the next one? What are my options?'],
      targetPhrases: ['I missed my connection.', 'Could you put me on the next flight?', 'What are my options?'],
      commonMistakes: [{ wrong: 'I want next flight', explanation: "Use: Could you put me on the next flight?" }],
    }],
  },
  // ---------- Social ----------
  {
    slug: 'small_talk_weather', title: 'Small Talk with a Neighbor', category: 'social',
    cefrBand: 'A2-B1', userRole: 'Resident', aiRole: 'Neighbor',
    goal: 'Make friendly small talk and respond naturally',
    keyPhrases: ['Lovely weather today!', 'How have you been?', 'Take care!'],
    commonMistakes: ['Answering only yes/no without extending the conversation'],
    practiceModes: ['translation', 'dialogue', 'description'],
    items: [{
      itemKey: 'small_talk_weather_a2_001', type: 'scenario_translation', cefrLevel: 'A2', difficultyScore: 40,
      learningGoal: 'Start and extend friendly small talk',
      promptCn: '今天天气真好！你最近怎么样？',
      referenceAnswers: ['Lovely weather today! How have you been lately?'],
      targetPhrases: ['Lovely weather today!', 'How have you been?'],
      commonMistakes: [{ wrong: 'Weather good. You good?', explanation: 'Use full phrases: How have you been lately?' }],
    }],
  },
  {
    slug: 'polite_refusal', title: 'Politely Declining an Invitation', category: 'social',
    cefrBand: 'B1', userRole: 'Friend', aiRole: 'Friend',
    goal: 'Say no kindly and offer an alternative',
    keyPhrases: ["I'd love to, but...", 'Maybe another time?', 'Thanks for thinking of me.'],
    commonMistakes: ["A blunt 'No, I can't' with no softener"],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'polite_refusal_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 57,
      learningGoal: 'Decline kindly and propose an alternative',
      promptCn: '谢谢你的邀请，我很想去，但今晚有事，改天行吗？',
      referenceAnswers: ["Thanks for the invite — I'd love to, but I'm busy tonight. Maybe another time?"],
      targetPhrases: ["I'd love to, but...", 'Maybe another time?'],
      commonMistakes: [{ wrong: "No I can't tonight", explanation: "Soften it: I'd love to, but I'm busy tonight. Maybe another time?" }],
    }],
  },
  // ---------- Work ----------
  {
    slug: 'standup_update', title: 'Giving a Stand-up Update', category: 'work',
    cefrBand: 'B1-B2', userRole: 'Team member', aiRole: 'Manager',
    goal: 'Report progress, blockers, and next steps concisely',
    keyPhrases: ['Yesterday I...', "I'm blocked on...", 'Next, I plan to...'],
    commonMistakes: ['Rambling without structure'],
    practiceModes: ['translation', 'description'],
    items: [{
      itemKey: 'standup_update_b2_001', type: 'scenario_translation', cefrLevel: 'B2', difficultyScore: 70,
      learningGoal: 'Structure a concise progress update',
      promptCn: '昨天我完成了登录功能，今天卡在接口对接上，接下来打算先写测试。',
      referenceAnswers: ['Yesterday I finished the login feature. Today I’m blocked on the API integration. Next, I plan to write tests.'],
      targetPhrases: ['Yesterday I...', "I'm blocked on...", 'Next, I plan to...'],
      commonMistakes: [{ wrong: 'I do login, now problem api', explanation: 'Use past/present clearly: Yesterday I finished… Today I’m blocked on…' }],
    }],
  },
  {
    slug: 'job_interview_strength', title: 'Interview: Describing a Strength', category: 'work',
    cefrBand: 'B2', userRole: 'Candidate', aiRole: 'Interviewer',
    goal: 'Describe a strength with a concrete example',
    keyPhrases: ['One of my strengths is...', 'For example,...', 'As a result,...'],
    commonMistakes: ['Claiming a strength with no example'],
    practiceModes: ['translation', 'description', 'dialogue'],
    items: [{
      itemKey: 'job_interview_strength_b2_001', type: 'scenario_translation', cefrLevel: 'B2', difficultyScore: 72,
      learningGoal: 'Support a claim with a concrete example',
      promptCn: '我的一个优点是注重细节，比如上次我发现了报表里的一个错误，结果帮公司避免了损失。',
      referenceAnswers: ['One of my strengths is attention to detail. For example, I once caught an error in a report, and as a result the company avoided a loss.'],
      targetPhrases: ['One of my strengths is...', 'For example,...', 'As a result,...'],
      commonMistakes: [{ wrong: 'I am very careful person', explanation: 'Add an example: For example, I once caught an error in a report…' }],
    }],
  },
  // ---------- Shopping & Money ----------
  {
    slug: 'return_item', title: 'Returning a Purchase', category: 'shopping_money',
    cefrBand: 'B1', userRole: 'Customer', aiRole: 'Shop assistant',
    goal: 'Return a product and ask for a refund or exchange',
    keyPhrases: ["I'd like to return this.", 'Can I get a refund?', 'Could I exchange it for...?'],
    commonMistakes: ["Demanding rather than requesting"],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'return_item_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 54,
      learningGoal: 'Request a refund or exchange politely',
      promptCn: '我想退这件衣服，可以退款吗？或者换一个大一号的？',
      referenceAnswers: ["I'd like to return this shirt. Can I get a refund, or could I exchange it for one size up?"],
      targetPhrases: ["I'd like to return this.", 'Can I get a refund?', 'Could I exchange it for...?'],
      commonMistakes: [{ wrong: 'I return this, give money', explanation: "Use: I'd like to return this. Can I get a refund?" }],
    }],
  },
  {
    slug: 'bank_open_account', title: 'Opening a Bank Account', category: 'shopping_money',
    cefrBand: 'B1-B2', userRole: 'Customer', aiRole: 'Bank teller',
    goal: 'Open an account and ask about fees',
    keyPhrases: ["I'd like to open an account.", 'Are there any monthly fees?', 'What documents do I need?'],
    commonMistakes: ['Mixing up "fee" and "fare"'],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'bank_open_account_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 60,
      learningGoal: 'Ask about requirements and fees',
      promptCn: '我想开一个账户，需要带什么材料？有月费吗？',
      referenceAnswers: ["I'd like to open an account. What documents do I need? Are there any monthly fees?"],
      targetPhrases: ["I'd like to open an account.", 'What documents do I need?', 'Are there any monthly fees?'],
      commonMistakes: [{ wrong: 'How much fare monthly?', explanation: "It's 'fee', not 'fare': Are there any monthly fees?" }],
    }],
  },
  // ---------- Health & Services ----------
  {
    slug: 'doctor_symptoms', title: 'Describing Symptoms to a Doctor', category: 'health_services',
    cefrBand: 'B1', userRole: 'Patient', aiRole: 'Doctor',
    goal: 'Describe symptoms and how long they have lasted',
    keyPhrases: ["I've had a... for...", 'It hurts when...', 'Is it serious?'],
    commonMistakes: ['Wrong tense for duration (present perfect needed)'],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'doctor_symptoms_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 56,
      learningGoal: 'Use present perfect for ongoing symptoms',
      promptCn: '我嗓子疼三天了，吞咽的时候更疼，严重吗？',
      referenceAnswers: ["I've had a sore throat for three days. It hurts more when I swallow. Is it serious?"],
      targetPhrases: ["I've had a... for...", 'It hurts when...', 'Is it serious?'],
      commonMistakes: [{ wrong: 'My throat pain three day', explanation: "Use present perfect: I've had a sore throat for three days." }],
    }],
  },
  {
    slug: 'call_support', title: 'Calling Customer Support', category: 'health_services',
    cefrBand: 'B1-B2', userRole: 'Customer', aiRole: 'Support agent',
    goal: 'Explain a problem and ask for it to be fixed',
    keyPhrases: ["I'm calling about...", "It's not working.", 'Could you help me fix it?'],
    commonMistakes: ['Starting without stating the reason for the call'],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'call_support_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 59,
      learningGoal: 'State the reason for a call and request help',
      promptCn: '我打电话是想问一下，我的网络连不上了，能帮我看看吗？',
      referenceAnswers: ["I'm calling about my internet — it's not working. Could you help me fix it?"],
      targetPhrases: ["I'm calling about...", "It's not working.", 'Could you help me fix it?'],
      commonMistakes: [{ wrong: 'Internet broken, you fix', explanation: "Use: I'm calling about my internet — it's not working. Could you help me fix it?" }],
    }],
  },
  // ---------- Education & Growth ----------
  {
    slug: 'office_hours_question', title: 'Asking a Question in Office Hours', category: 'education_growth',
    cefrBand: 'B1', userRole: 'Student', aiRole: 'Professor',
    goal: 'Ask for clarification on a concept politely',
    keyPhrases: ['Could you clarify...?', "I'm not sure I understand...", 'Do you mean...?'],
    commonMistakes: ["Saying 'I don't understand' without specifics"],
    practiceModes: ['translation', 'dialogue'],
    items: [{
      itemKey: 'office_hours_question_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 55,
      learningGoal: 'Ask a precise clarification question',
      promptCn: '老师，我不太明白这个概念，您能再解释一下第二步吗？',
      referenceAnswers: ["Professor, I'm not sure I understand this concept. Could you clarify the second step?"],
      targetPhrases: ['Could you clarify...?', "I'm not sure I understand..."],
      commonMistakes: [{ wrong: "I don't understand all", explanation: 'Be specific: Could you clarify the second step?' }],
    }],
  },
  {
    slug: 'group_project_roles', title: 'Dividing Group Project Roles', category: 'education_growth',
    cefrBand: 'B1-B2', userRole: 'Student', aiRole: 'Classmate',
    goal: 'Suggest a division of tasks and confirm agreement',
    keyPhrases: ['How about I take...?', 'Could you handle...?', 'Does that work for you?'],
    commonMistakes: ['Assigning tasks as commands'],
    practiceModes: ['translation', 'dialogue', 'description'],
    items: [{
      itemKey: 'group_project_roles_b1_001', type: 'scenario_translation', cefrLevel: 'B1', difficultyScore: 58,
      learningGoal: 'Propose and confirm task division',
      promptCn: '不如我来做幻灯片，你负责查资料，这样安排你觉得行吗？',
      referenceAnswers: ['How about I take the slides and you handle the research? Does that work for you?'],
      targetPhrases: ['How about I take...?', 'Could you handle...?', 'Does that work for you?'],
      commonMistakes: [{ wrong: 'You do research, I do slides', explanation: 'Make it collaborative: How about I take the slides and you handle the research?' }],
    }],
  },
  // ---------- Express Yourself (topic description home) ----------
  {
    slug: 'describe_favorite_city', title: 'Describe Your Favorite City', category: 'express_yourself',
    cefrBand: 'B1-B2', userRole: 'Speaker', aiRole: 'Listener',
    goal: 'Describe a city with reasons and structure',
    keyPhrases: ['I like X because of...', 'There are many...', 'What I like most is...'],
    commonMistakes: ['Listing without reasons or connectors'],
    practiceModes: ['description', 'translation'],
    items: [{
      itemKey: 'describe_favorite_city_b1_001', type: 'topic_description', cefrLevel: 'B1', difficultyScore: 60,
      learningGoal: 'Give a structured opinion with reasons',
      referenceAnswers: ['I like Los Angeles because of its pleasant weather, diverse food scene, and relaxed lifestyle.'],
      targetPhrases: ['I like X because of...', 'What I like most is...'],
      commonMistakes: [{ wrong: 'weather good and many food', explanation: 'Add articles + connectors: the weather is great and there are many kinds of food.' }],
    }],
  },
  {
    slug: 'tell_a_story', title: 'Tell a Short Story About Your Day', category: 'express_yourself',
    cefrBand: 'B1', userRole: 'Speaker', aiRole: 'Listener',
    goal: 'Narrate events in order using past tense',
    keyPhrases: ['First,...', 'Then,...', 'In the end,...'],
    commonMistakes: ['Switching tenses; missing sequence words'],
    practiceModes: ['description'],
    items: [{
      itemKey: 'tell_a_story_b1_001', type: 'topic_description', cefrLevel: 'B1', difficultyScore: 57,
      learningGoal: 'Sequence past events coherently',
      referenceAnswers: ['First, I woke up late. Then, I rushed to work and missed the bus. In the end, I still made it on time.'],
      targetPhrases: ['First,...', 'Then,...', 'In the end,...'],
      commonMistakes: [{ wrong: 'I wake up late then I run', explanation: 'Keep past tense + sequence words: First, I woke up late. Then, I rushed…' }],
    }],
  },
];
