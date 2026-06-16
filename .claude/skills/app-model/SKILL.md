---
name: app-model
description: Change the Scenario English app's AI model/provider per task (feedback, dialogue, scoring, item_gen, asr) at runtime — or view the current config. Use when the user wants to switch which AI model the app uses, check what model a task resolves to, or revert a task to its default. Project-local to cdcupt/daily-english.
---

# app-model — switch the app's AI models at runtime

This app resolves an AI **provider + model per task**, switchable live (no redeploy)
through the operator admin API. This skill drives the committed CLI
`server/scripts/ai-config.mjs` so you (or the user) can view and change the config
without remembering curl + tokens.

**Scope:** this skill is for **this application only** (the live API at
`api.english.daichenlab.com`). It is not a general tool.

## Tasks and providers

- **tasks:** `feedback`, `dialogue`, `scoring`, `item_gen`, `asr`
- **providers:** `openai`, `gemini`
- **resolution order (highest wins):** DB override ▸ env var ▸ eval default ▸ degrade-to-fallback
- **per-request attempt order:** primary model → retry ×2 (5xx/timeout/network) → fallback model

## How to run it

All commands run from the repo root and need an operator credential loaded first:

```bash
set -a; . ~/.scenario-english/operator.env; set +a   # loads OPERATOR_DEVICE_ID
node server/scripts/ai-config.mjs show
node server/scripts/ai-config.mjs set <task> <provider> <model> [fallbackModel]
node server/scripts/ai-config.mjs reset <task>
```

`~/.scenario-english/operator.env` holds `OPERATOR_DEVICE_ID=<a deviceId flagged is_operator>`
(chmod 600, **never commit it** — it's a credential). `API_BASE` can override the
default `https://api.english.daichenlab.com`.

## What to do when this skill is invoked

Parse the user's intent into one of: `show` (default), `set`, `reset`.

1. **show / "what model is X using" / "confirm the order"** →
   run `node server/scripts/ai-config.mjs show` and report the resolved table.
   The `source` column tells which layer won (`default`/`env`/`db`/`degraded`).

2. **set / "switch scoring to gpt-5.5" / "use gemini for feedback"** →
   map the request to `set <task> <provider> <model> [fallbackModel]` and run it.
   - If the user names a model but not a provider, infer: `gpt-*` → `openai`,
     `gemini-*` → `gemini`. If ambiguous, ask once.
   - Suggest keeping a cross-provider `fallbackModel` for resilience.

3. **reset / "put scoring back to default"** →
   run `node server/scripts/ai-config.mjs reset <task>`.

Always end by showing the resulting config so the change is confirmed.

### Examples

```bash
# switch the synchronous scoring path to the most robust OpenAI model
node server/scripts/ai-config.mjs set scoring openai gpt-5.4-mini gemini-3-flash-preview
# try a stronger model for written feedback
node server/scripts/ai-config.mjs set feedback openai gpt-5.5
# revert scoring to the eval default (gemini-3-flash-preview)
node server/scripts/ai-config.mjs reset scoring
```

## First-run / operator bootstrap

If `OPERATOR_DEVICE_ID` is unset or the CLI reports "not authorized", an operator
credential is needed. One-time setup (the deviceId is any opaque secret string):

```bash
# 1. flag the deviceId as an operator on the server
ssh 9relay "docker exec 9relay-postgres psql -U litellm -d scenario_english \
  -c \"INSERT INTO users (device_id, is_operator) VALUES ('<deviceId>', true) \
       ON CONFLICT (device_id) DO UPDATE SET is_operator = true\""
# 2. store it locally (outside the repo), chmod 600
printf 'OPERATOR_DEVICE_ID=%s\n' '<deviceId>' > ~/.scenario-english/operator.env
chmod 600 ~/.scenario-english/operator.env
```

(`users.device_id` is the anonymous-auth identity; flagging `is_operator` grants
admin access. The CLI re-authenticates with this deviceId on each run, so no
long-lived token is stored.)

## Notes

- ASR is pinned to OpenAI server-side; setting `asr` to gemini will be rejected.
- `gpt-5.5` rejects a custom temperature — the server already omits it; no action needed.
- The web app's admin section shows the same config in a UI if you prefer clicking.
