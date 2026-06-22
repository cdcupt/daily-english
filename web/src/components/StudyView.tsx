"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  studyNextRaw,
  readStudyNextMeta,
  getTopic,
  clearTopic,
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
  ActiveTopic,
} from "@/api/types";
import type { RawResult } from "@/api/client";
import { FeedbackDiff } from "./FeedbackDiff";
import { TopicBar } from "./topic/TopicBar";
import { TopicPicker } from "./topic/TopicPicker";
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

/** After this long in the generating state, soften the wait copy. */
const SLOW_GENERATION_MS = 6000;

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

  // The active topic lives on the session server-side; we mirror it locally so
  // the bar/picker render synchronously, restoring it from GET /study/topic on
  // mount so a reload keeps the topic.
  const [topic, setTopicState] = useState<ActiveTopic | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const topicQ = useQuery({
    queryKey: ["study", "topic"],
    queryFn: getTopic,
  });

  useEffect(() => {
    if (topicQ.data) setTopicState(topicQ.data.topic);
  }, [topicQ.data]);

  // study/next, kept raw so we can read meta.reason ("topic_warming") + meta.topic.
  const studyQ = useQuery<RawResult<StudyNext>>({
    queryKey: ["study", "next"],
    queryFn: studyNextRaw,
  });

  function refetchNext() {
    queryClient.invalidateQueries({ queryKey: ["study", "next"] });
  }

  /** Apply a topic chosen in the picker, then pull the first item for it. */
  function handleTopicApplied(next: ActiveTopic | null) {
    setTopicState(next);
    queryClient.setQueryData(["study", "topic"], { sessionId: null, topic: next });
    refetchNext();
  }

  async function handleClearTopic() {
    if (clearing) return;
    setClearing(true);
    try {
      await clearTopic();
      setTopicState(null);
      queryClient.setQueryData(["study", "topic"], { sessionId: null, topic: null });
      refetchNext();
    } finally {
      setClearing(false);
    }
  }

  const bar = (
    <TopicBar
      topic={topic}
      onOpenPicker={() => setPickerOpen(true)}
      onClear={handleClearTopic}
      isBusy={clearing}
    />
  );

  const picker = pickerOpen ? (
    <TopicPicker
      activeTopic={topic}
      onApplied={handleTopicApplied}
      onClose={() => setPickerOpen(false)}
    />
  ) : null;

  // A custom topic is "warming" while its first batch generates: either the
  // active topic still reports status==="generating", or study/next signals it
  // via meta.reason. Category topics never warm (instant refetch).
  const meta = readStudyNextMeta(studyQ.data?.meta);
  const isWarming =
    (topic?.kind === "custom" && topic.status === "generating") ||
    meta.reason === "topic_warming";

  function body() {
    if (studyQ.isLoading) {
      return (
        <>
          <CoachStrip progress="…" sub="Loading your next item" />
          <div className="feed-item">
            <div className="skel" style={{ height: 18, width: "40%", marginBottom: 12 }} />
            <div className="skel" style={{ height: 60, marginBottom: 12 }} />
            <div className="skel" style={{ height: 84 }} />
          </div>
        </>
      );
    }

    if (studyQ.isError) {
      return (
        <div className="center-state">
          <p>
            {studyQ.error instanceof Error
              ? studyQ.error.message
              : "Something went wrong."}
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => studyQ.refetch()}
          >
            Try again
          </button>
        </div>
      );
    }

    const data = studyQ.data?.data ?? null;

    // Custom-topic generating state takes priority over the empty branch.
    if (!data && isWarming) {
      return (
        <GeneratingState
          topicLabel={topic?.label ?? meta.topic?.label ?? "your topic"}
          onRetry={() => studyQ.refetch()}
          onChooseTopic={() => setPickerOpen(true)}
          onUseAdaptive={handleClearTopic}
        />
      );
    }

    // Empty bank — calm, caught-up state (distinct from error + generating).
    if (!data) {
      return (
        <div className="center-state">
          <p>You&apos;re all caught up — come back later for more.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => studyQ.refetch()}
          >
            Try again
          </button>
        </div>
      );
    }

    if (data.kind === "review") {
      return <ReviewCard review={data.review} onDone={refetchNext} />;
    }

    return <PracticeCard data={data} topic={topic} onNext={refetchNext} />;
  }

  return (
    <div className="app-pad">
      {bar}
      {body()}
      {picker}
    </div>
  );
}

/* ---------- Generating state (custom topic warming) ---------- */

function GeneratingState({
  topicLabel,
  onRetry,
  onChooseTopic,
  onUseAdaptive,
}: {
  topicLabel: string;
  onRetry: () => void;
  onChooseTopic: () => void;
  onUseAdaptive: () => void;
}) {
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);

  // After a soft delay show "still working"; if it drags on, offer escape hatches.
  useEffect(() => {
    const slowId = setTimeout(() => setSlow(true), SLOW_GENERATION_MS);
    const failId = setTimeout(() => setFailed(true), SLOW_GENERATION_MS * 5);
    return () => {
      clearTimeout(slowId);
      clearTimeout(failId);
    };
  }, []);

  if (failed) {
    return (
      <div className="center-state">
        <p>That topic is taking too long to build. Try another, or carry on with your adaptive mix.</p>
        <div className="input-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={onChooseTopic}>
            Choose a topic
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onUseAdaptive}>
            Use adaptive mix
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
            Keep waiting
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <CoachStrip progress="New" sub={`Building your ${topicLabel} session…`} />
      <article className="feed-item" aria-busy="true">
        <div className="thinking" aria-live="polite">
          {slow ? "Still working — good prompts take a moment." : "Generating your first item"}
          <span className="dots">
            <i /> <i /> <i />
          </span>
        </div>
        <div className="skel" style={{ height: 18, width: "55%", margin: "8px 0 12px" }} />
        <div className="skel" style={{ height: 60, marginBottom: 12 }} />
        <div className="skel" style={{ height: 84 }} />
      </article>
    </>
  );
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
    <>
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
    </>
  );
}

/* ---------- Practice card (adaptive item) ---------- */

function PracticeCard({
  data,
  topic,
  onNext,
}: {
  data: StudyPractice;
  topic: ActiveTopic | null;
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
    <>
      <CoachStrip progress={item.cefrLevel} sub={item.learningGoal} />

      <article className="feed-item">
        <div className="it-head">
          <span className={`it-badge ${badge}`}>{item.mode}</span>
          {/* Topic provenance: a small badge when a topic is active. Reviews
              keep their own review badge (review > topic) and are not affected. */}
          {topic && (
            <span className={`it-badge topic ${topic.kind === "category" ? "cat" : ""}`}>
              topic
            </span>
          )}
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
    </>
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
