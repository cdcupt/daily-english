"use client";

import type { AdminItem, ItemStatus } from "@/api/types";
import { STATUS_LABEL } from "@/lib/lifecycle";

interface AdminItemRowProps {
  item: AdminItem;
  busy: boolean;
  nextStates: ItemStatus[];
  statusLabel: string;
  statusTone: string;
  onTransition: (to: ItemStatus) => void;
  onRegenerate: () => void;
}

const TYPE_LABEL: Record<AdminItem["type"], string> = {
  scenario_translation: "Translation",
  scenario_dialogue: "Dialogue",
  topic_description: "Description",
};

/** Metric cell — shows a percentage, flags weak completion / high complaints. */
function Metric({
  value,
  warnWhen,
}: {
  value: number | null | undefined;
  warnWhen?: (v: number) => boolean;
}) {
  if (typeof value !== "number") return <td className="dash">—</td>;
  const warn = warnWhen?.(value) ?? false;
  return (
    <td className={`metric${warn ? " warn" : ""}`}>
      {Math.round(value * 100)}%
    </td>
  );
}

export function AdminItemRow({
  item,
  busy,
  nextStates,
  statusLabel,
  statusTone,
  onTransition,
  onRegenerate,
}: AdminItemRowProps) {
  const m = item.metrics;
  return (
    <tr>
      <td>
        <span className="key">{item.itemKey}</span>{" "}
        <span className="ver">v{item.version}</span>
      </td>
      <td>
        <span className="op-type">{TYPE_LABEL[item.type]}</span>
      </td>
      <td>{item.cefrLevel}</td>
      <td className="metric">{item.difficultyScore ?? "—"}</td>
      <td>
        <span className={`lc ${statusTone}`}>{statusLabel}</span>
      </td>
      <Metric value={m?.completionRate} warnWhen={(v) => v < 0.5} />
      <Metric value={m?.saveRate} />
      <Metric value={m?.complaintRate} warnWhen={(v) => v >= 0.05} />
      <td>
        <div className="op-actions">
          {nextStates.map((to) => (
            <button
              key={to}
              type="button"
              className={`op-btn go-${to}`}
              disabled={busy}
              onClick={() => onTransition(to)}
            >
              {STATUS_LABEL[to]}
            </button>
          ))}
          <button
            type="button"
            className="op-btn regen"
            disabled={busy}
            onClick={onRegenerate}
          >
            Regenerate
          </button>
        </div>
      </td>
    </tr>
  );
}
