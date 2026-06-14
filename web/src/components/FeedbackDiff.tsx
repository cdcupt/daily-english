"use client";

import { useState } from "react";
import type { FeedbackPayload } from "@/api/types";
import { saveExpression } from "@/api/endpoints";
import { CEFR_DISCLAIMER } from "@/lib/constants";

interface FeedbackDiffProps {
  feedback: FeedbackPayload;
  /** Inline session score 0-100 (optional, shown as a chip). */
  score?: number;
  cefr?: string;
  sourceSessionId?: string;
  sourceScenarioId?: string;
}

const ISSUE_ICONS: Record<string, string> = {
  grammar: "✎",
  vocabulary: "📖",
  naturalness: "✨",
  coherence: "🔗",
  register: "🎩",
  task_completion: "🎯",
};

/**
 * The signature 3-tier feedback diff: original (struck, coral) → corrected
 * (teal) → natural (violet). Uses labels + icons + strikethrough, never
 * color alone (WCAG). Save pills POST to /v1/expressions.
 */
export function FeedbackDiff({
  feedback,
  score,
  cefr,
  sourceSessionId,
  sourceScenarioId,
}: FeedbackDiffProps) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  async function handleSave(candidate: string) {
    if (saved.has(candidate) || saving) return;
    setSaving(candidate);
    try {
      await saveExpression({
        type: "phrase",
        content: candidate,
        sourceSessionId,
        sourceScenarioId,
      });
      setSaved((prev) => new Set(prev).add(candidate));
    } catch {
      // Non-fatal: leave the pill un-saved so the user can retry.
    } finally {
      setSaving(null);
    }
  }

  const pct = score !== undefined ? Math.round(score) : undefined;

  return (
    <div>
      <div className="diff" role="group" aria-label="Three-tier feedback">
        <div className="tier t1">
          <span className="lbl">
            <span aria-hidden>✗</span> You wrote
          </span>
          <p className="txt">{feedback.original}</p>
        </div>
        <div className="tier t2">
          <span className="lbl">
            <span aria-hidden>✓</span> Corrected
          </span>
          <p className="txt">{feedback.corrected}</p>
        </div>
        <div className="tier t3">
          <span className="lbl">
            <span aria-hidden>✨</span> Natural version
          </span>
          <p className="txt">{feedback.natural_version}</p>
        </div>
      </div>

      {feedback.issues.length > 0 && (
        <ul className="issues">
          {feedback.issues.map((issue, i) => (
            <li className="issue" key={i}>
              <span className="itype">
                <span aria-hidden>{ISSUE_ICONS[issue.type] ?? "•"}</span>{" "}
                {issue.type.replace("_", " ")}
              </span>
              <span>{issue.explanation}</span>
            </li>
          ))}
        </ul>
      )}

      {pct !== undefined && (
        <div className="score-chip">
          <div
            className="mini-ring"
            style={{ ["--pct" as string]: `${pct}%` }}
            aria-hidden
          >
            <b>{pct}</b>
          </div>
          <div className="sx">
            <b>Turn score {pct}/100</b>
            <small>Estimated for this answer</small>
          </div>
          {cefr && (
            <span className="cefr-mini" title={CEFR_DISCLAIMER}>
              CEFR {cefr}
            </span>
          )}
        </div>
      )}

      {feedback.save_candidates.length > 0 && (
        <>
          <div className="section-label" style={{ margin: "10px 0 8px" }}>
            Save to your bank
          </div>
          <div className="save-row">
            {feedback.save_candidates.map((c) => {
              const isSaved = saved.has(c);
              return (
                <span className="save-pill" key={c}>
                  {c}
                  <button
                    type="button"
                    className={`add${isSaved ? " saved" : ""}`}
                    aria-label={
                      isSaved ? `Saved: ${c}` : `Save expression: ${c}`
                    }
                    aria-pressed={isSaved}
                    disabled={isSaved || saving === c}
                    onClick={() => handleSave(c)}
                  >
                    {isSaved ? "✓" : "+"}
                  </button>
                </span>
              );
            })}
          </div>
        </>
      )}

      {(pct !== undefined || cefr) && (
        <p className="disclaimer">{CEFR_DISCLAIMER}</p>
      )}
    </div>
  );
}
