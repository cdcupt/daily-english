/**
 * Client mirror of the server lifecycle state machine
 * (server/src/content/lifecycle.ts). Kept in sync by hand — the server is the
 * source of truth and re-validates every transition, so this only drives which
 * action buttons the operator is offered.
 */
import type { ItemStatus } from "@/api/types";

export const ITEM_STATUSES: readonly ItemStatus[] = [
  "draft",
  "generated",
  "auto_checked",
  "review_pending",
  "published",
  "monitored",
  "improved",
  "archived",
];

const ALLOWED: Record<ItemStatus, ItemStatus[]> = {
  draft: ["generated", "archived"],
  generated: ["auto_checked", "draft", "archived"],
  auto_checked: ["review_pending", "draft", "archived"],
  review_pending: ["published", "draft", "archived"],
  published: ["monitored", "improved", "archived"],
  monitored: ["improved", "published", "archived"],
  improved: ["review_pending", "published", "archived"],
  archived: ["draft"],
};

export function allowedTransitions(from: ItemStatus): ItemStatus[] {
  return ALLOWED[from] ?? [];
}

/** Human-readable label for a status (pills + action buttons). */
export const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: "Draft",
  generated: "Generated",
  auto_checked: "Auto-checked",
  review_pending: "Review",
  published: "Published",
  monitored: "Monitored",
  improved: "Improved",
  archived: "Archived",
};

/**
 * Lifecycle-pill color class. Maps each state onto the four DESIGN pill tones
 * (draft / review / published / archived) plus violet for the active-monitoring
 * middle states, so every state reads distinctly.
 */
export const STATUS_TONE: Record<ItemStatus, string> = {
  draft: "lc-draft",
  generated: "lc-draft",
  auto_checked: "lc-info",
  review_pending: "lc-review",
  improved: "lc-review",
  published: "lc-published",
  monitored: "lc-published",
  archived: "lc-archived",
};
