# English Skill System

Daily English tracks 4 core English skills through daily practice tasks. This document defines how each skill is measured, scored, and leveled.

## Four Core Skills

### 1. Reading — Comprehension & Analysis

| Sub-skill | What it measures | Quiz tag |
|-----------|-----------------|----------|
| Main Idea | Identifying the central argument/theme | `main_idea` |
| Detail Recall | Remembering specific facts from the text | `detail` |
| Inference | Drawing conclusions not explicitly stated | `inference` |
| Vocabulary in Context | Understanding word meaning from context | `vocabulary` |

**Daily score:** correct / total (e.g., "12/15")

AI generates 3-5 MC questions per article, each tagged with a sub-skill type.

### 2. Writing — Expression & Accuracy

The Writing task has two phases: writing and speaking.

**Phase 1: Writing**

| Sub-skill | What it measures | Score range |
|-----------|-----------------|-------------|
| Grammar | Correct sentence structure, tense, agreement | 0-25 |
| Vocabulary Range | Diversity and appropriateness of word choice | 0-25 |
| Coherence | Logical flow, paragraph structure, transitions | 0-25 |
| Task Response | Relevance and completeness of the essay | 0-25 |

**Writing score:** sum of 4 components (e.g., "75/100")

**Phase 2: Speaking**

AI generates corrected text from the essay → TTS plays it → user records speech → AI evaluates:

- **Accuracy** (0-100): How closely speech matches the target text (weight: 60%)
- **Fluency** (0-100): Natural flow and intelligibility (weight: 40%)

Both phases must complete for the task to count as done.

### 3. Vocabulary — Word Knowledge

| Sub-skill | What it measures |
|-----------|-----------------|
| Word Recognition | Matching a word to its correct definition |
| Contextual Usage | Understanding example sentences |

**Daily score:** correct / 20 (e.g., "17/20")

**Adaptive difficulty:** AI generates harder words as the user levels up.
- Level 1-3: Common everyday words
- Level 4-6: IELTS core / academic vocabulary
- Level 7+: Advanced, rare, and nuanced words

Options are shuffled on the client side to prevent positional bias.

### 4. Listening — Comprehension & Retention

| Sub-skill | What it measures | Quiz tag |
|-----------|-----------------|----------|
| Factual Recall | Remembering stated information | `recall` |
| Speaker Intent | Understanding purpose, tone, opinion | `intent` |
| Inference | Deducing unstated information | `inference` |
| Sequence | Understanding order of events/arguments | `sequence` |
| Vocabulary | Understanding spoken vocabulary in context | `vocabulary` |

**Daily score:** correct / total across all sessions (e.g., "12/15")

AI generates passages (150-250 words) with 5 MC questions per session. TTS converts passage to audio.

Scenario types: lecture, conversation, tour guide, interview, news report, podcast, meeting, phone call, announcement, documentary.

## Level System

Skill level is determined by the **average of daily best scores** (normalized to 0-100):

| Level | Score Range | Label | CEFR | IELTS (est.) | TOEFL (est.) |
|-------|------------|-------|------|--------------|--------------|
| 1 | 0-19 | Beginner | A1 | - | - |
| 2 | 20-34 | Elementary | A1+ | 3.0 | - |
| 3 | 35-49 | Pre-Intermediate | A2 | 3.5 | 32 |
| 4 | 50-59 | Intermediate | B1 | 4.5 | 42 |
| 5 | 60-69 | Upper-Intermediate | B1+ | 5.5 | 60 |
| 6 | 70-76 | Pre-Advanced | B2 | 6.0 | 79 |
| 7 | 77-83 | Advanced | B2+ | 6.5 | 93 |
| 8 | 84-89 | Upper-Advanced | C1 | 7.0 | 100 |
| 9 | 90-95 | Expert | C1+ | 8.0 | 110 |
| 10 | 96-100 | Master | C2 | 9.0 | 118 |

The app's "My Level" detail screen shows the full mapping with CEFR descriptors and per-skill breakdown.

## Overall English Level

Composite score = equal weighted average of all 4 skill scores (25% each).

## Adaptive Difficulty

| User Level | Reading | Vocabulary | Listening | Writing Topics |
|-----------|---------|------------|-----------|----------------|
| 1-3 | Short articles, simple language | Common everyday words | Slow speech, simple scenarios | Simple personal topics |
| 4-6 | Medium articles, some academic language | IELTS core vocabulary | Normal speed, varied scenarios | Opinion/discussion topics |
| 7-10 | Long articles, complex arguments | Advanced/rare words | Fast speech, academic lectures | Abstract/analytical topics |

The user's current level is passed to AI prompts so generated content matches their ability.

## CEFR Descriptors

- **A1:** Can understand and use familiar everyday expressions and very basic phrases.
- **A2:** Can communicate in simple and routine tasks on familiar topics.
- **B1:** Can deal with most situations likely to arise while travelling.
- **B2:** Can understand the main ideas of complex text, interact fluently with native speakers.
- **C1:** Can express ideas fluently and spontaneously, use language flexibly for professional purposes.
- **C2:** Can understand virtually everything heard or read, express with precision and fluency.

## Score Display

All scores are displayed as fractions (e.g., "17/20", "75/100"), never as percentages. This is consistent throughout the app — task results, skill progress bars, level detail screen.

> Note: IELTS and TOEFL equivalents are estimates based on practice scores. For official certification, take the actual exam.
