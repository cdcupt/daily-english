import Foundation

enum Prompts {
    // MARK: - Difficulty

    static func difficultyDescription(for level: Int) -> String {
        switch level {
        case 1...3: "beginner level — use simple vocabulary and short sentences"
        case 4...6: "intermediate level — use standard vocabulary with some academic language"
        case 7...10: "advanced level — use complex vocabulary, nuanced arguments, and sophisticated sentence structures"
        default: "intermediate level"
        }
    }

    // MARK: - Reading

    static func articleGeneration(topic: ArticleTopic, difficulty: String) -> String {
        """
        You are an English learning content generator. Generate an article for \(difficulty) learners.
        Topic category: \(topic.displayName).

        Return JSON matching this exact schema:
        {
          "title": "Article headline",
          "content": "Full article body (3-5 paragraphs)",
          "topic": "\(topic.rawValue)"
        }

        Requirements:
        - The article should be engaging and informative
        - 200-400 words depending on difficulty
        - Use language appropriate for the specified difficulty level
        - Return only valid JSON, no markdown fences
        """
    }

    static let readingQuiz = """
        You are an English comprehension quiz generator. Given an article, generate quiz questions.

        Return JSON matching this exact schema:
        {
          "questions": [
            {
              "question": "Question text",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctIndex": 0,
              "subSkill": "main_idea"
            }
          ]
        }

        Requirements:
        - Generate 3-5 questions
        - Each question has exactly 4 options
        - correctIndex is 0-3
        - subSkill must be one of: "main_idea", "detail", "inference", "vocabulary"
        - Include a mix of sub-skill types
        - Return only valid JSON, no markdown fences
        """

    // MARK: - Writing

    static let writingReview = """
        You are an English writing tutor. Review the student's essay and provide detailed feedback.

        Return JSON matching this exact schema:
        {
          "score": 75,
          "grammarScore": 20,
          "vocabularyRangeScore": 18,
          "coherenceScore": 19,
          "taskResponseScore": 18,
          "grammarIssues": ["Issue 1", "Issue 2"],
          "styleNotes": ["Note 1"],
          "correctedText": "The full corrected version of the essay"
        }

        Requirements:
        - score is the total (0-100), sum of the four sub-scores
        - Each sub-score is 0-25
        - grammarIssues: list specific grammar errors found
        - styleNotes: suggestions for improving style and flow
        - correctedText: rewrite the essay with all corrections applied, maintaining the student's ideas
        - Return only valid JSON, no markdown fences
        """

    // MARK: - Pronunciation

    static let pronunciationEvaluation = """
        You are a pronunciation evaluator. Compare the target text with the recognized speech transcription.

        Return JSON matching this exact schema:
        {
          "accuracyScore": 85.0,
          "fluencyScore": 78.0,
          "notes": ["Specific pronunciation feedback"]
        }

        Requirements:
        - accuracyScore (0-100): How closely the recognized speech matches the target text
        - fluencyScore (0-100): Natural flow and intelligibility
        - notes: 2-4 specific tips for improvement
        - Return only valid JSON, no markdown fences
        """

    // MARK: - Vocabulary

    static func vocabularyQuiz(difficulty: String) -> String {
        """
        You are an English vocabulary tutor. Generate exactly 20 vocabulary words for a quiz.
        Difficulty: \(difficulty).

        Return JSON matching this exact schema:
        {
          "words": [
            {
              "word": "ephemeral",
              "meaning": "lasting for a very short time",
              "options": ["permanent", "lasting for a very short time", "meaningful", "colorful"],
              "correctIndex": 1,
              "exampleSentence": "The ephemeral beauty of cherry blossoms draws crowds every spring."
            }
          ]
        }

        Requirements:
        - Generate exactly 20 words
        - Each word has exactly 4 options (meanings to choose from)
        - correctIndex is 0-3, indicating which option is the correct meaning
        - Options should be plausible but clearly distinguishable
        - Example sentences should demonstrate the word in natural context
        - Adjust word difficulty to match the specified level
        - Return only valid JSON, no markdown fences
        """
    }

    // MARK: - Listening

    static func listeningPractice(difficulty: String) -> String {
        """
        You are an English listening practice generator. Create a listening exercise.
        Difficulty: \(difficulty).

        Choose a random scenario type from: lecture, conversation, tour guide, interview, \
        news report, podcast, meeting, phone call, announcement, documentary.

        Return JSON matching this exact schema:
        {
          "title": "Session title",
          "scenario": "The scenario type",
          "passage": "The full passage text (150-250 words, realistic spoken English with contractions)",
          "questions": [
            {
              "question": "Question about the passage",
              "options": ["A", "B", "C", "D"],
              "correctIndex": 0,
              "subSkill": "recall"
            }
          ]
        }

        Requirements:
        - passage: 150-250 words of natural spoken English with contractions
        - Generate exactly 5 questions
        - Each question has exactly 4 options
        - subSkill must be one of: "recall", "intent", "inference", "sequence", "vocabulary"
        - Include a mix of sub-skill types
        - Return only valid JSON, no markdown fences
        """
    }

    // MARK: - Writing Topics

    static let writingTopics: [String] = [
        "Describe a place you would like to visit and explain why.",
        "Do you agree that technology makes life easier? Give reasons.",
        "Write about a memorable experience from your childhood.",
        "Should students wear school uniforms? Discuss both sides.",
        "Describe the person who has influenced you the most.",
        "What are the advantages and disadvantages of social media?",
        "Write about your favorite hobby and why you enjoy it.",
        "Do you think working from home is better than working in an office?",
        "Describe a book or movie that changed your perspective.",
        "What would you do if you could travel back in time?",
        "Should governments invest more in public transportation? Why?",
        "Write about a challenge you overcame and what you learned.",
        "Is it important to learn a second language? Explain your view.",
        "Describe your ideal weekend and what activities you would do.",
        "What changes would you make to improve your city?",
        "Do you think animals should be kept in zoos? Discuss.",
        "Write about a skill you would like to learn and why.",
        "Should fast food be banned in schools? Give your opinion.",
        "Describe a tradition in your culture that you value.",
        "What role does art play in society?",
        "Write about the importance of environmental protection.",
        "Do you prefer living in a big city or a small town? Why?",
        "Describe a difficult decision you had to make.",
        "Should university education be free for everyone?",
        "Write about how music affects your mood and daily life.",
        "What qualities make a good leader?",
        "Describe your dream job and what steps you need to take.",
        "Is competition good or bad for students? Discuss.",
        "Write about the importance of maintaining good health.",
        "What would the world be like without the internet?",
    ]

    static func randomWritingTopic() -> String {
        writingTopics.randomElement() ?? writingTopics[0]
    }
}
