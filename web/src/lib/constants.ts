/** Verbatim CEFR disclaimer — must appear with every CEFR estimate (TECH §B7). */
export const CEFR_DISCLAIMER =
  "Your current CEFR level is an AI estimate for learning reference only. It is not an official language test score or certification.";

export const APP_MODE =
  process.env.NEXT_PUBLIC_API_MODE === "mock" ? "mock" : "live";
