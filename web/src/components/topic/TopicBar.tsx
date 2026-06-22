"use client";

import type { ActiveTopic } from "@/api/types";

interface TopicBarProps {
  topic: ActiveTopic | null;
  /** Open the picker (from the ghost trigger or by tapping the chip body). */
  onOpenPicker: () => void;
  /** Clear the active topic, back to the adaptive mix. */
  onClear: () => void;
  /** True while a clear/refetch is in flight, to disable the controls. */
  isBusy?: boolean;
}

/**
 * A slim row pinned at the top of Study, above the coach strip and present
 * across loading / practice / empty states. Default shows the adaptive mix plus
 * a "Choose a topic" trigger; when a topic is active it shows a colour-coded
 * chip (teal = category, violet = custom) with a clear "×".
 */
export function TopicBar({ topic, onOpenPicker, onClear, isBusy }: TopicBarProps) {
  if (!topic) {
    return (
      <div className="topic-bar">
        <span className="tb-default">
          <span className="dot" aria-hidden />
          Today&apos;s mix · Adaptive
        </span>
        <span className="tb-spacer" />
        <button type="button" className="tb-choose" onClick={onOpenPicker}>
          <span aria-hidden>＋</span> Choose a topic
        </button>
      </div>
    );
  }

  const kindClass = topic.kind === "custom" ? "custom" : "cat";
  const kindLabel = topic.kind === "custom" ? "Custom" : "Topic";
  const generating = topic.status === "generating";

  return (
    <div className="topic-bar">
      <span className={`topic-chip ${kindClass}`}>
        <button
          type="button"
          className="tc-body"
          onClick={onOpenPicker}
          aria-label={`Topic: ${topic.label}. Change topic`}
        >
          <span className="tc-kind">{kindLabel}</span>
          <span className="tc-label">{topic.label}</span>
        </button>
        {generating && (
          <span className="tc-gen" aria-hidden>
            Building…
          </span>
        )}
        <button
          type="button"
          className="tc-clear"
          onClick={onClear}
          disabled={isBusy}
          aria-label="Clear topic, back to adaptive mix"
        >
          ×
        </button>
      </span>
    </div>
  );
}
