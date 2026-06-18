"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfile, getProfileTrends, listExpressions } from "@/api/endpoints";
import type {
  AbilityProfile,
  ProfileTrends,
  Expression,
  ExpressionType,
  Paginated,
} from "@/api/types";
import { TrendChart } from "./TrendChart";

const DIM_COLORS: Record<string, string> = {
  vocabulary: "var(--color-teal)",
  grammar: "var(--color-violet)",
  coherence: "var(--color-teal-700)",
  interaction: "var(--color-coral)",
  fluency: "var(--color-teal)",
  pronunciation: "var(--color-violet)",
};

const EXPR_TABS: { id: ExpressionType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mistake_pair", label: "Mistakes" },
  { id: "phrase", label: "Phrases" },
  { id: "collocation", label: "Collocations" },
  { id: "word", label: "Words" },
];

export function YouView() {
  const [tab, setTab] = useState<ExpressionType | "all">("all");

  const profileQ = useQuery<AbilityProfile>({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  const trendsQ = useQuery<ProfileTrends>({
    queryKey: ["profile-trends", 30],
    queryFn: () => getProfileTrends(30),
  });

  const exprQ = useQuery<Paginated<Expression>>({
    queryKey: ["expressions", tab],
    queryFn: () => listExpressions(tab === "all" ? undefined : tab),
  });

  return (
    <div className="app-pad">
      <h1 className="serif" style={{ fontSize: 26, margin: "8px 0 14px" }}>
        Your progress
      </h1>

      {profileQ.isLoading && (
        <div className="cefr-hero">
          <div className="skel" style={{ height: 52, width: 80, margin: "0 auto" }} />
        </div>
      )}

      {profileQ.data && <ProfilePanel profile={profileQ.data} />}

      <div className="a-card trend-card">
        <div className="section-label" style={{ margin: "0 0 6px" }}>
          Trend
        </div>
        {trendsQ.isLoading && (
          <div className="skel" style={{ height: 92, borderRadius: 12 }} />
        )}
        {trendsQ.data && <TrendChart series={trendsQ.data.series} />}
      </div>

      <div className="section-label">Expression bank</div>
      <div className="expr-subtabs" role="tablist" aria-label="Expression types">
        {EXPR_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="etab"
            aria-pressed={tab === t.id}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {exprQ.isLoading && (
        <>
          <div className="skel" style={{ height: 64, marginBottom: 10 }} />
          <div className="skel" style={{ height: 64, marginBottom: 10 }} />
        </>
      )}

      {exprQ.data && exprQ.data.rows.length === 0 && (
        <div className="center-state">
          <p>No saved expressions yet. Save corrections from Study to build your bank.</p>
        </div>
      )}

      {exprQ.data?.rows.map((e) => (
        <ExpressionRow key={e.id} expr={e} />
      ))}
    </div>
  );
}

function ProfilePanel({ profile }: { profile: AbilityProfile }) {
  const dims = Object.entries(profile.dimensions);
  return (
    <>
      <div className="cefr-hero">
        <div className="big">{profile.overall_cefr}</div>
        <div className="rng">
          Stable range {profile.stable_range[0]}–{profile.stable_range[1]}
        </div>
      </div>

      <div className="a-card">
        <div className="section-label" style={{ margin: "0 0 12px" }}>
          Dimensions
        </div>
        {dims.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--color-ink-2)", margin: 0 }}>
            Finish a session and your six skill dimensions will appear here.
          </p>
        )}
        {dims.map(([name, d]) => (
          <div className="dim-row" key={name}>
            <span className="nm">{name}</span>
            <div className="dim-track">
              <div
                className="dim-fill"
                style={{
                  width: `${d.score}%`,
                  background: DIM_COLORS[name] ?? "var(--color-teal)",
                }}
              />
            </div>
            <span className="sc">{d.score}</span>
          </div>
        ))}
      </div>

      {profile.weaknesses.length > 0 && (
        <div className="a-card">
          <div className="section-label" style={{ margin: "0 0 8px" }}>
            Focus areas
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--color-ink-2)" }}>
            {profile.weaknesses.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="disclaimer">{profile.disclaimer}</p>
    </>
  );
}

function ExpressionRow({ expr }: { expr: Expression }) {
  return (
    <div className="expr-item">
      {expr.userOriginal && expr.naturalExpression ? (
        <>
          <div className="en">
            <span className="strike">{expr.userOriginal}</span> →{" "}
            {expr.naturalExpression}
          </div>
          {expr.meaningCn && <div className="cn">{expr.meaningCn}</div>}
        </>
      ) : (
        <>
          <div className="en">{expr.content}</div>
          {expr.meaningCn && <div className="cn">{expr.meaningCn}</div>}
        </>
      )}
    </div>
  );
}
