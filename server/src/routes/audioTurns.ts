import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { practiceSessions, practiceTurns, questionItems, aiFeedbackItems, expressionBankItems } from '../db/schema.js';
import { requireAuth } from '../auth/plugin.js';
import { ok, fail } from '../schemas.js';
import { transcriberForAsr, type Transcriber } from '../asr/client.js';
import { computeSpeechFeatures } from '../scoring/features.js';
import { generateDialogueFeedback } from '../ai/feedback.js';
import { mistakePairFromFeedback } from '../expressions/service.js';

const ACCEPTED_MIME = /^(audio\/(webm|ogg|opus|mp4|aac|x-m4a|m4a|mpeg|wav|x-wav)|video\/(webm|mp4))/;

/**
 * Voice turn (TECH §B6): upload audio → server ASR (whisper-1) → confidence
 * gate. Low confidence → non-blocking retry, turn preserved + excluded from
 * scoring. Otherwise → light dialogue feedback + auto-save. Server-side ASR is
 * canonical so web + iOS score identically.
 */
export function audioTurnRoutes(injectedTranscriber?: Transcriber) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.post('/v1/sessions/:id/turns/audio', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      let itemId: string | undefined;
      let audio: Buffer | undefined;
      let filename = 'audio.webm';
      let mime = 'application/octet-stream';

      for await (const part of req.parts()) {
        if (part.type === 'file') {
          mime = part.mimetype;
          filename = part.filename || filename;
          audio = await part.toBuffer();
        } else if (part.fieldname === 'itemId') {
          itemId = String(part.value);
        }
      }

      if (!audio || !itemId) return reply.code(400).send(fail('bad_request', 'audio file and itemId are required'));
      if (!ACCEPTED_MIME.test(mime)) return reply.code(415).send(fail('unsupported_media', `Unsupported audio type: ${mime}`));

      const db = getDb();
      const session = await db.select().from(practiceSessions).where(eq(practiceSessions.id, id));
      if (session.length === 0) return reply.code(404).send(fail('not_found', 'Session not found'));
      if (session[0]!.userId !== req.user!.sub) return reply.code(403).send(fail('forbidden', 'Not your session'));
      const items = await db.select().from(questionItems).where(eq(questionItems.id, itemId));
      if (items.length === 0) return reply.code(404).send(fail('not_found', 'Item not found'));
      const item = items[0]!;

      const transcriber = injectedTranscriber ?? await transcriberForAsr();
      const asr = await transcriber.transcribe(audio, filename, mime);
      const features = computeSpeechFeatures(asr.words, asr.durationSeconds);

      const existingTurns = await db.select().from(practiceTurns).where(eq(practiceTurns.sessionId, id));
      const turnIndex = existingTurns.length;

      const [turn] = await db.insert(practiceTurns).values({
        sessionId: id, itemId: item.id, turnIndex, inputType: 'audio',
        transcript: asr.transcript, asrConfidence: asr.confidence, asrWords: asr.words,
        speechFeatures: features, lowConfidence: asr.lowConfidence,
      }).returning();

      // Low confidence → non-blocking retry; turn kept, no feedback, excluded from scoring.
      if (asr.lowConfidence) {
        return reply.send(ok({
          turnId: turn!.id, turnIndex, transcript: asr.transcript, asrConfidence: asr.confidence,
          lowConfidence: true,
          retry: { reason: 'low_confidence', message: "We didn't catch that clearly — retry, accept the draft, or type instead." },
          feedback: null,
        }));
      }

      const fb = await generateDialogueFeedback({
        cefrLevel: item.cefrLevel, learningGoal: item.learningGoal,
        targetPhrases: item.targetPhrases, referenceAnswers: item.referenceAnswers,
        promptCn: item.promptCn, userText: asr.transcript,
      });
      await db.insert(aiFeedbackItems).values({
        turnId: turn!.id, payload: fb.payload, rawModelOutput: fb.raw,
        model: fb.model, promptVersion: fb.promptVersion, repaired: fb.repaired,
      });

      let savedExpressionId: string | null = null;
      const pair = mistakePairFromFeedback(fb.payload, { sourceSessionId: id, sourceScenarioId: item.scenarioId });
      if (pair) {
        const dupe = await db.select().from(expressionBankItems).where(and(
          eq(expressionBankItems.userId, req.user!.sub),
          eq(expressionBankItems.type, 'mistake_pair'),
          eq(expressionBankItems.content, pair.content),
        ));
        if (dupe.length > 0) savedExpressionId = dupe[0]!.id;
        else {
          const [exp] = await db.insert(expressionBankItems).values({
            userId: req.user!.sub, type: pair.type, content: pair.content,
            userOriginal: pair.userOriginal, naturalExpression: pair.naturalExpression,
            sourceSessionId: pair.sourceSessionId, sourceScenarioId: pair.sourceScenarioId,
            reviewStatus: pair.reviewStatus,
          }).returning();
          savedExpressionId = exp!.id;
        }
      }

      return reply.send(ok({
        turnId: turn!.id, turnIndex, transcript: asr.transcript, asrConfidence: asr.confidence,
        lowConfidence: false, feedback: fb.payload, savedExpressionId, saveCandidates: fb.payload.save_candidates,
      }));
    });
  };
}
