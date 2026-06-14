/**
 * Question-item lifecycle state machine (TECH §B8). Pure + table-driven so the
 * allowed transitions are testable and enforced server-side. Operators move
 * items through these states; illegal jumps are rejected.
 */
export const ITEM_STATUSES = [
  'draft', 'generated', 'auto_checked', 'review_pending', 'published', 'monitored', 'improved', 'archived',
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

const ALLOWED: Record<ItemStatus, ItemStatus[]> = {
  draft: ['generated', 'archived'],
  generated: ['auto_checked', 'draft', 'archived'],
  auto_checked: ['review_pending', 'draft', 'archived'],
  review_pending: ['published', 'draft', 'archived'],
  published: ['monitored', 'improved', 'archived'],
  monitored: ['improved', 'published', 'archived'],
  improved: ['review_pending', 'published', 'archived'],
  archived: ['draft'],
};

export function allowedTransitions(from: ItemStatus): ItemStatus[] {
  return ALLOWED[from] ?? [];
}

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return allowedTransitions(from).includes(to);
}

export function isItemStatus(s: string): s is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(s);
}
