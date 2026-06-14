"use client";

interface OnboardingProps {
  onStart: () => void;
  loading: boolean;
  error: string | null;
}

export function Onboarding({ onStart, loading, error }: OnboardingProps) {
  return (
    <main id="main" className="app-shell">
      <section className="onb" aria-labelledby="onb-title">
        <div className="mascot" role="img" aria-label="Cleo, your coach mascot" />
        <h1 id="onb-title">Practice English in real scenarios.</h1>
        <p>
          Order coffee, negotiate a deadline, check into a hotel — answer in
          English and get warm, three-tier coaching from Cleo. No sign-up needed.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={onStart}
          disabled={loading}
        >
          {loading ? "Starting…" : "Start practising"}
        </button>
        {error && (
          <p style={{ color: "var(--color-red)", fontSize: 13, marginTop: 12 }}>
            {error}
          </p>
        )}
        <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 18 }}>
          Already have an account? You can add an email later from Settings to
          sync across devices.
        </p>
      </section>
    </main>
  );
}
