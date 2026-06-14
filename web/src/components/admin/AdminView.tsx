"use client";

import { useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  adminListItems,
  adminTransitionItem,
  adminRegenerateItem,
  adminGenerateItem,
} from "@/api/endpoints";
import type { AdminItem, ItemStatus, ItemType } from "@/api/types";
import { APP_MODE } from "@/lib/constants";
import { allowedTransitions, STATUS_LABEL, STATUS_TONE } from "@/lib/lifecycle";
import { AdminItemRow } from "./AdminItemRow";
import { GenerateForm } from "./GenerateForm";

const ITEMS_KEY = ["admin", "items"] as const;

export function AdminView() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const itemsQ = useQuery<AdminItem[]>({
    queryKey: ITEMS_KEY,
    queryFn: adminListItems,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ITEMS_KEY });
  const onError = (e: unknown) =>
    setMsg({
      kind: "err",
      text: e instanceof Error ? e.message : "Action failed",
    });

  const transitionM = useMutation({
    mutationFn: ({ id, to }: { id: string; to: ItemStatus }) =>
      adminTransitionItem(id, to),
    onSuccess: (r) => {
      setMsg({ kind: "ok", text: `Moved to ${STATUS_LABEL[r.status]}` });
      invalidate();
    },
    onError,
  });

  const regenerateM = useMutation({
    mutationFn: (id: string) => adminRegenerateItem(id),
    onSuccess: (r) => {
      setMsg({ kind: "ok", text: `Regenerated → draft v${r.version}` });
      invalidate();
    },
    onError,
  });

  const generateM = useMutation({
    mutationFn: (input: { scenarioId: string; type: ItemType; cefrLevel: string }) =>
      adminGenerateItem(input),
    onSuccess: (r) => {
      setMsg({ kind: "ok", text: `Generated ${r.itemKey}` });
      invalidate();
    },
    onError,
  });

  const items = itemsQ.data ?? [];
  const kpis = useMemo(() => computeKpis(items), [items]);
  const busyId =
    transitionM.isPending || regenerateM.isPending
      ? ((transitionM.variables as { id: string } | undefined)?.id ??
        (regenerateM.variables as string | undefined))
      : undefined;

  return (
    <div className="admin-wrap">
      <aside className="admin-side">
        <div className="brand">
          Bank Ops<span className="dot">.</span>
        </div>
        <span className="op-tag">Operator tool</span>
        <nav className="admin-nav" aria-label="Admin sections">
          <span className="on">Question Bank</span>
          <span>Scenarios</span>
          <span>Sources</span>
          <span>Quality</span>
        </nav>
      </aside>

      <main className="admin-main" id="main">
        <div className="op-banner">
          <span aria-hidden>🔒</span> Operator surface · outside the learner app
          {APP_MODE === "mock" && (
            <span className="mode-badge" style={{ marginLeft: 8 }}>
              Demo data
            </span>
          )}
        </div>
        <h1>Question Bank</h1>
        <p className="sub">Lifecycle &amp; quality across the question bank</p>

        <div className="admin-kpis">
          <Kpi value={String(kpis.review)} label="Review queue" tone="teal" />
          <Kpi value={String(kpis.published)} label="Published" />
          <Kpi value={kpis.avgCompletion} label="Avg completion" />
          <Kpi value={kpis.avgComplaint} label="Complaint rate" tone="coral" />
        </div>

        <GenerateForm
          onSubmit={(input) => generateM.mutate(input)}
          pending={generateM.isPending}
        />

        {msg && (
          <p
            className={`op-status-msg ${msg.kind === "err" ? "err" : "ok"}`}
            role="status"
          >
            {msg.text}
          </p>
        )}

        {itemsQ.isLoading && (
          <div className="admin-tablewrap">
            <div className="admin-loading">
              <div
                className="op-skel"
                style={{ height: 18, width: "60%", margin: "0 auto 12px" }}
              />
              <div
                className="op-skel"
                style={{ height: 18, width: "75%", margin: "0 auto" }}
              />
            </div>
          </div>
        )}

        {itemsQ.isError && (
          <p className="op-status-msg err">
            Could not load items. Try again.
          </p>
        )}

        {itemsQ.data && items.length === 0 && (
          <div className="admin-tablewrap">
            <div className="admin-empty">No items in the bank yet.</div>
          </div>
        )}

        {items.length > 0 && (
          <div className="admin-tablewrap">
            <div className="admin-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Type</th>
                    <th>CEFR</th>
                    <th>Diff.</th>
                    <th>Status</th>
                    <th>Compl.</th>
                    <th>Save</th>
                    <th>Cmplnt</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <AdminItemRow
                      key={item.id}
                      item={item}
                      busy={busyId === item.id}
                      nextStates={allowedTransitions(item.status)}
                      statusLabel={STATUS_LABEL[item.status]}
                      statusTone={STATUS_TONE[item.status]}
                      onTransition={(to) =>
                        transitionM.mutate({ id: item.id, to })
                      }
                      onRegenerate={() => regenerateM.mutate(item.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Kpi({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "teal" | "coral";
}) {
  return (
    <div className="admin-kpi">
      <div className={`v${tone ? ` ${tone}` : ""}`}>{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

function computeKpis(items: AdminItem[]) {
  const review = items.filter(
    (i) => i.status === "review_pending" || i.status === "auto_checked",
  ).length;
  const published = items.filter(
    (i) => i.status === "published" || i.status === "monitored",
  ).length;
  const withMetrics = items.filter((i) => i.metrics);
  const avg = (pick: (i: AdminItem) => number | null | undefined) => {
    const vals = withMetrics
      .map(pick)
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return "—";
    return `${Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100)}%`;
  };
  return {
    review,
    published,
    avgCompletion: avg((i) => i.metrics?.completionRate),
    avgComplaint: avg((i) => i.metrics?.complaintRate),
  };
}
