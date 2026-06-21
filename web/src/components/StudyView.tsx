"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  studyNext,
  submitTextTurn,
  submitAudioTurn,
  reviewComplete,
} from "@/api/endpoints";
import type {
  StudyNext,
  StudyPractice,
  FeedbackPayload,
  AudioTurnResult,
  ReviewItem,
} from "@/api/types";
import { FeedbackDiff } from "./FeedbackDiff";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";

interface TurnState {
  feedback: FeedbackPayload | null;
  transcript?: string;
  lowConfidence?: boolean;
  retryMessage?: string;
}

const BADGE_CLASS: Record<string, string> = {
  scenario_translation: "translation",
  scenario_dialogue: "dialogue",
  topic_description: "description",
};

/** SM-2 quality grades surfaced to the learner, mapped to the backend 0–5 scale. */
const GRADES: ReadonlyArray<{
  label: string;
  grade: number;
  className: string;
}> = [
  { label: "Forgot", grade: 1, className: "btn-coral" },
  { label: "Good", grade: 4, className: "btn-primary" },
  { label: "Easy", grade: 5, className: "btn-ghost" },
];

export function StudyView() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery<StudyNext | null>(
    {
      queryKey: ["study", "next"],
      queryFn: studyNext,
    },
  );

  function refetchNext() {
    queryClient.invalidateQueries({ queryKey: ["study", "next"] });
  }

  if (isLoading) {
    return (
      <div className="app-pad">
        <CoachStrip progress="…" sub="Loading your next item" />
        <div className="feed-item">
          <div className="skel" style={{ height: 18, width: "40%", marginBottom: 12 }} />
          <div className="skel" style={{ height: 60, marginBottom: 12 }} />
          <div className="skel" style={{ height: 84 }} />
        </div>
      </div>
    );
  }

  // Real network/server failure — keep showing the error message.
  if (isError) {
    return (
      <div className="app-pad">
        <div className="center-state">
          <p>{error instanceof Error ? error.message : "Something went wrong."}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Empty bank (data === null, meta.reason === "empty_bank") — a calm, friendly
  // caught-up state, intentionally distinct from the error branch above.
  if (!data) {
    return (
      <div className="app-pad">
        <div className="center-state">
          <p>You&apos;re all caught up — come back later for more.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (data.kind === "review") {
    return (
      <ReviewCard review={data.review} onDone={refetchNext} />
    );
  }

  return <PracticeCard data={data} onNext={refetchNext} />;
}

/* ---------- Review card (spaced repetition) ---------- */

function ReviewCard({
  review,
  onDone,
}: {
  review: ReviewItem;
  onDone: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const answer = review.naturalExpression ?? review.content;

  async function grade(value: number) {
    if (grading) return;
    setGrading(true);
    setGradeError(null);
    try {
      await reviewComplete(review.expressionId, { grade: value });
      onDone();
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : "Could not save your review");
      setGrading(false);
    }
  }

  return (
    <div className="app-pad">
      <CoachStrip progress="Review" sub="A saved expression is due" />

      <article className="feed-item">
        <div className="it-head">
          <span className="it-badge review">review</span>
        </div>

        <h2 className="it-q">Quick review</h2>

        <div className="prompt-cn">
          <small>Try to recall</small>
          {review.prompt}
        </div>

        {review.userOriginal && (
          <p className="it-goal">
            You once said: <i>“{review.userOriginal}”</i>
          </p>
        )}

        {!revealed ? (
          <div className="input-actions">
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setRevealed(true)}
            >
              Show answer
            </button>
          </div>
        ) : (
          <>
            <div className="prompt-cn" aria-live="polite">
              <small>Natural expression</small>
              {answer}
            </div>

            <p className="it-goal">How well did you remember it?</p>
            <div className="input-actions">
              {GRADES.map((g) => (
                <button
                  key={g.grade}
                  type="button"
                  className={`btn ${g.className}`}
                  onClick={() => grade(g.grade)}
                  disabled={grading}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {grading && (
              <div className="thinking" aria-live="polite">
                Saving your review
                <span className="dots">
                  <i /> <i /> <i />
                </span>
              </div>
            )}
          </>
        )}

        {gradeError && (
          <div className="asr-banner" role="alert" style={{ marginTop: 12 }}>
            <span className="bi" aria-hidden>
              ⚠️
            </span>
            <div>
              <b>Something went wrong</b>
              <small>{gradeError}</small>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

/* ---------- Practice card (adaptive item) ---------- */

function PracticeCard({
  data,
  onNext,
}: {
  data: StudyPractice;
  onNext: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const recorder = useVoiceRecorder();

  const { item, sessionId } = data;

  function resetForNext() {
    setAnswer("");
    setTurn(null);
    setSubmitError(null);
    onNext();
  }

  async function handleSubmitText() {
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitTextTurn(sessionId, item.itemId, answer.trim());
      setTurn({ feedback: result.feedback, lowConfidence: false });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not check answer");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecordToggle() {
    if (recorder.state === "recording") {
      const rec = await recorder.stop();
      if (!rec) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result: AudioTurnResult = await submitAudioTurn(
          sessionId,
          item.itemId,
          rec.blob,
          rec.filename,
        );
        if (result.lowConfidence) {
          setTurn({
            feedback: null,
            transcript: result.transcript,
            lowConfidence: true,
            retryMessage:
              result.retry?.message ??
              "We didn't catch that clearly — retry, or type instead.",
          });
        } else {
          setTurn({
            feedback: result.feedback,
            transcript: result.transcript,
            lowConfidence: false,
          });
        }
      } catch (e) {
        setSubmitError(
          e instanceof Error ? e.message : "Could not process audio",
        );
      } finally {
        setSubmitting(false);
      }
    } else {
      await recorder.start();
    }
  }

  const badge = BADGE_CLASS[item.type] ?? "translation";
  const showFeedback = turn?.feedback;

  return (
    <div className="app-pad">
      <CoachStrip progress={item.cefrLevel} sub={item.learningGoal} />

      <article className="feed-item">
        <div className="it-head">
          <span className={`it-badge ${badge}`}>{item.mode}</span>
          {item.scenario && (
            <span className="it-scn">
              {item.scenario.category} · {item.scenario.title}
            </span>
          )}
        </div>

        {item.scenario && <h2 className="it-q">{item.scenario.goal}</h2>}
        <p className="it-goal">
          You are the <b>{item.scenario?.userRole ?? "learner"}</b>. Respond to
          the <b>{item.scenario?.aiRole ?? "coach"}</b> in English.
        </p>

        <div className="prompt-cn">
          <small>Translate / express in English</small>
          {item.promptCn}
        </div>

        {!showFeedback && !turn?.lowConfidence && (
          <>
            <label className="sr-only" htmlFor="answer">
              Your answer
            </label>
            <textarea
              id="answer"
              className="input-box"
              placeholder="Type your answer in English…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitting}
            />
            <div className="input-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitText}
                disabled={!answer.trim() || submitting}
              >
                {submitting ? "Checking…" : "Check my answer"}
              </button>
              {recorder.supported && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleRecordToggle}
                  disabled={submitting}
                >
                  🎙 Speak instead
                </button>
              )}
            </div>

            {recorder.state === "recording" && (
              <div className="voice-bar" aria-live="polite">
                <button
                  type="button"
                  className="mic recording"
                  aria-label="Stop recording"
                  onClick={handleRecordToggle}
                >
                  ■
                </button>
                <div className="vx">
                  <b>Recording…</b>
                  <small>Tap to stop and send</small>
                </div>
              </div>
            )}

            {submitting && (
              <div className="thinking" aria-live="polite">
                Cleo is reviewing
                <span className="dots">
                  <i /> <i /> <i />
                </span>
              </div>
            )}
          </>
        )}

        {turn?.lowConfidence && (
          <div className="asr-banner" role="alert">
            <span className="bi" aria-hidden>
              🎤
            </span>
            <div style={{ flex: 1 }}>
              <b>We didn&apos;t catch that clearly</b>
              <small>{turn.retryMessage}</small>
              <div className="acts">
                <button
                  type="button"
                  className="btn btn-coral btn-sm"
                  onClick={handleRecordToggle}
                >
                  Retry recording
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setTurn(null)}
                >
                  Type instead
                </button>
              </div>
            </div>
          </div>
        )}

        {submitError && (
          <div className="asr-banner" role="alert" style={{ marginTop: 12 }}>
            <span className="bi" aria-hidden>
              ⚠️
            </span>
            <div>
              <b>Something went wrong</b>
              <small>{submitError}</small>
            </div>
          </div>
        )}

        {showFeedback && turn?.feedback && (
          <>
            {turn.transcript && (
              <p className="it-goal" style={{ marginTop: 12 }}>
                <b>Heard:</b> “{turn.transcript}”
              </p>
            )}
            <FeedbackDiff
              feedback={turn.feedback}
              score={82}
              cefr={item.cefrLevel}
              sourceSessionId={sessionId}
            />
            <div className="input-actions">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={resetForNext}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </article>
    </div>
  );
}

function CoachStrip({ progress, sub }: { progress: string; sub: string }) {
  return (
    <div className="coach-strip">
      <span className="av" aria-hidden />
      <div className="cx">
        <b>Cleo, your coach</b>
        <small>{sub}</small>
      </div>
      <span className="prog">{progress}</span>
    </div>
  );
}
