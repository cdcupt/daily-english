"use client";

import { useState, type FormEvent } from "react";
import type { ItemType } from "@/api/types";

interface GenerateFormProps {
  onSubmit: (input: { scenarioId: string; type: ItemType; cefrLevel: string }) => void;
  pending: boolean;
}

const TYPES: { value: ItemType; label: string }[] = [
  { value: "scenario_translation", label: "Translation" },
  { value: "scenario_dialogue", label: "Dialogue" },
  { value: "topic_description", label: "Description" },
];

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function GenerateForm({ onSubmit, pending }: GenerateFormProps) {
  const [scenarioId, setScenarioId] = useState("");
  const [type, setType] = useState<ItemType>("scenario_translation");
  const [cefrLevel, setCefrLevel] = useState("A2");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = scenarioId.trim();
    if (!trimmed) return;
    onSubmit({ scenarioId: trimmed, type, cefrLevel });
  };

  return (
    <form className="op-gen" onSubmit={handleSubmit}>
      <div className="op-field grow">
        <label htmlFor="gen-scenario">Scenario ID</label>
        <input
          id="gen-scenario"
          className="op-input"
          value={scenarioId}
          onChange={(e) => setScenarioId(e.target.value)}
          placeholder="scn-daily-coffee"
          autoComplete="off"
        />
      </div>
      <div className="op-field">
        <label htmlFor="gen-type">Type</label>
        <select
          id="gen-type"
          className="op-select"
          value={type}
          onChange={(e) => setType(e.target.value as ItemType)}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="op-field">
        <label htmlFor="gen-cefr">CEFR</label>
        <select
          id="gen-cefr"
          className="op-select"
          value={cefrLevel}
          onChange={(e) => setCefrLevel(e.target.value)}
        >
          {CEFR_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="op-gen-btn"
        disabled={pending || !scenarioId.trim()}
      >
        {pending ? "Generating…" : "Generate new"}
      </button>
    </form>
  );
}
