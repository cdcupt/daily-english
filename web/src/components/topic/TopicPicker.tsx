"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTopics, setTopic, clearTopic } from "@/api/endpoints";
import type { ActiveTopic, TopicsResponse } from "@/api/types";

const CUSTOM_MIN = 2;
const CUSTOM_MAX = 60;

/** Match the server's moderation/off-domain rejection codes (422). */
const REJECTION_CODES = new Set(["topic_rejected", "topic_off_domain"]);
const REJECTION_MESSAGE =
  "Let's keep it about everyday English — try another topic.";

interface TopicPickerProps {
  /** The currently active topic (so the matching chip starts pressed). */
  activeTopic: ActiveTopic | null;
  /** Called with the new active topic once it is set (custom may be generating). */
  onApplied: (topic: ActiveTopic | null) => void;
  onClose: () => void;
}

type Selection =
  | { kind: "adaptive" }
  | { kind: "category"; category: string }
  | { kind: "custom" };

/**
 * A modal sheet for choosing what to practise: category chips (first chip
 * "Adaptive mix" clears the topic), an "or" divider, and a custom free-text
 * field with example quick-fills. Category submit is instant; custom submit
 * goes busy and may surface an inline coral rejection on a 422 (staying open).
 */
export function TopicPicker({ activeTopic, onApplied, onClose }: TopicPickerProps) {
  const titleId = useId();
  const customId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  const initialSelection: Selection =
    activeTopic?.kind === "category" && activeTopic.category
      ? { kind: "category", category: activeTopic.category }
      : activeTopic?.kind === "custom"
        ? { kind: "custom" }
        : { kind: "adaptive" };

  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [customText, setCustomText] = useState(
    activeTopic?.kind === "custom" ? activeTopic.label : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topicsQ = useQuery<TopicsResponse>({
    queryKey: ["topics"],
    queryFn: getTopics,
  });

  // Esc to close + body scroll lock while open.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Move focus into the sheet on mount (focus trap entry point).
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  // Minimal focus trap: keep Tab cycling within the sheet.
  function handleKeyDownTrap(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !sheetRef.current) return;
    const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const trimmedCustom = customText.trim();
  const customValid =
    trimmedCustom.length >= CUSTOM_MIN && trimmedCustom.length <= CUSTOM_MAX;

  const canStart =
    selection.kind === "adaptive" ||
    selection.kind === "category" ||
    (selection.kind === "custom" && customValid);

  function selectCategory(category: string) {
    setError(null);
    setSelection({ kind: "category", category });
  }

  function selectAdaptive() {
    setError(null);
    setSelection({ kind: "adaptive" });
  }

  function onCustomInput(value: string) {
    setError(null);
    setCustomText(value);
    if (value.trim().length > 0) setSelection({ kind: "custom" });
  }

  async function handleStart() {
    if (busy || !canStart) return;
    setBusy(true);
    setError(null);
    try {
      if (selection.kind === "adaptive") {
        await clearTopic();
        onApplied(null);
        onClose();
        return;
      }
      if (selection.kind === "category") {
        const res = await setTopic({ kind: "category", category: selection.category });
        onApplied(res.topic);
        onClose();
        return;
      }
      // custom
      const res = await setTopic({ kind: "custom", topic: trimmedCustom });
      onApplied(res.topic);
      onClose();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code && REJECTION_CODES.has(code)) {
        setError(REJECTION_MESSAGE);
      } else if (code === "rate_limited") {
        setError("You've started a lot of new topics — give it a few minutes.");
      } else {
        setError(e instanceof Error ? e.message : "Could not set that topic.");
      }
      setBusy(false); // stay open on failure
    }
  }

  const startLabel =
    busy && selection.kind === "custom" ? "Building…" : "Start session";

  return (
    <div
      className="tp-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="tp-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={sheetRef}
        tabIndex={-1}
        onKeyDown={handleKeyDownTrap}
      >
        <div className="tp-grip" aria-hidden />
        <div className="tp-head">
          <h2 id={titleId}>What do you want to practise?</h2>
          <button
            type="button"
            className="tp-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="tp-sub">
          Pick a category for instant practice, or describe any everyday-English
          topic and we&apos;ll build a focused session.
        </p>

        {/* Category chips */}
        <div className="tp-chips" role="group" aria-label="Topic categories">
          <button
            type="button"
            className="etab"
            aria-pressed={selection.kind === "adaptive"}
            onClick={selectAdaptive}
          >
            Adaptive mix
          </button>
          {topicsQ.isLoading && (
            <>
              <span className="skel" style={{ height: 32, width: 92, borderRadius: 999 }} />
              <span className="skel" style={{ height: 32, width: 78, borderRadius: 999 }} />
              <span className="skel" style={{ height: 32, width: 104, borderRadius: 999 }} />
            </>
          )}
          {topicsQ.data?.categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className="etab"
              aria-pressed={
                selection.kind === "category" && selection.category === c.key
              }
              onClick={() => selectCategory(c.key)}
            >
              {c.label}
              <span className="cnt">{c.publishedItemCount}</span>
            </button>
          ))}
        </div>

        <div className="auth-divider">or</div>

        {/* Custom free-text topic */}
        <label className="tp-custom-label" htmlFor={customId}>
          Describe your own topic
        </label>
        <div className="magic-input">
          <input
            id={customId}
            type="text"
            value={customText}
            maxLength={CUSTOM_MAX}
            placeholder="e.g. Returning a faulty phone"
            onChange={(e) => onCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canStart) {
                e.preventDefault();
                handleStart();
              }
            }}
            aria-describedby={error ? `${customId}-err` : undefined}
          />
        </div>

        <div className="tp-quickfills">
          {(topicsQ.data?.suggestions ?? ["Job interview", "Café order", "Doctor visit"]).map(
            (s) => (
              <button
                key={s}
                type="button"
                className="qf"
                onClick={() => onCustomInput(s)}
              >
                {s}
              </button>
            ),
          )}
        </div>

        {error && (
          <div
            className="asr-banner"
            role="alert"
            id={`${customId}-err`}
            style={{ marginTop: 12 }}
          >
            <span className="bi" aria-hidden>
              ⚠️
            </span>
            <div>
              <b>Try another topic</b>
              <small>{error}</small>
            </div>
          </div>
        )}

        <div className="tp-actions">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleStart}
            disabled={!canStart || busy}
          >
            {startLabel}
          </button>
          {selection.kind === "custom" && !customValid && trimmedCustom.length > 0 && (
            <p className="tp-hint">Topics are between {CUSTOM_MIN} and {CUSTOM_MAX} characters.</p>
          )}
        </div>
      </div>
    </div>
  );
}
