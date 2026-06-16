#!/usr/bin/env node
/**
 * ai-config.mjs — manage the Scenario English app's per-task AI model config
 * at RUNTIME (no redeploy). Thin wrapper over the operator admin API
 * (`/v1/admin/ai-config`). Used by the project-local `app-model` skill.
 *
 * Usage (run from the repo root or server/):
 *   node scripts/ai-config.mjs show
 *   node scripts/ai-config.mjs set <task> <provider> <model> [fallbackModel]
 *   node scripts/ai-config.mjs reset <task>
 *
 * Env (put OPERATOR_DEVICE_ID in ~/.scenario-english/operator.env, chmod 600):
 *   OPERATOR_DEVICE_ID   required — a deviceId flagged is_operator in the DB
 *   API_BASE             optional — default https://api.english.daichenlab.com
 *
 * tasks:     feedback | dialogue | scoring | item_gen | asr
 * providers: openai | gemini
 */

const API_BASE = (process.env.API_BASE || 'https://api.english.daichenlab.com').replace(/\/+$/, '');
const TASKS = ['feedback', 'dialogue', 'scoring', 'item_gen', 'asr'];
const PROVIDERS = ['openai', 'gemini'];

function die(msg, code = 1) {
  console.error(`✖ ${msg}`);
  process.exit(code);
}

function usage() {
  console.log(`app-model — Scenario English AI model config

  node scripts/ai-config.mjs show
  node scripts/ai-config.mjs set <task> <provider> <model> [fallbackModel]
  node scripts/ai-config.mjs reset <task>

  tasks:     ${TASKS.join(' | ')}
  providers: ${PROVIDERS.join(' | ')}
  API_BASE = ${API_BASE}`);
}

async function api(path, opts = {}, token) {
  // Only declare a JSON content-type when we actually send a body — Fastify
  // rejects an empty body when content-type is application/json (breaks DELETE).
  const headers = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  } catch (e) {
    die(`cannot reach ${API_BASE} (${e.message}). Set API_BASE, check the network, or run from the server box.`);
  }
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { res, body };
}

async function operatorToken() {
  const deviceId = process.env.OPERATOR_DEVICE_ID;
  if (!deviceId) {
    die('OPERATOR_DEVICE_ID is not set.\n  Put it in ~/.scenario-english/operator.env (a deviceId flagged is_operator), then:\n  set -a; . ~/.scenario-english/operator.env; set +a');
  }
  const { res, body } = await api('/v1/auth/anonymous', { method: 'POST', body: JSON.stringify({ deviceId }) });
  if (!res.ok) die(`auth failed (${res.status}): ${JSON.stringify(body.error || body)}`);
  const token = body?.data?.access;
  if (!token) die('auth response missing access token');
  return token;
}

function printConfig(d) {
  const avail = d.providers.map((p) => `${p.id}=${p.available ? 'ok' : 'NO KEY'}`).join('  ');
  console.log(`providers: ${avail}\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log('  ' + pad('TASK', 9) + pad('PROVIDER', 9) + pad('MODEL', 26) + pad('SOURCE', 10) + 'FALLBACK');
  for (const t of d.tasks) {
    const fb = t.fallback ? `${t.fallback.provider}/${t.fallback.model}` : '-';
    console.log('  ' + pad(t.task, 9) + pad(t.provider, 9) + pad(t.model, 26) + pad(t.source, 10) + fb);
  }
}

async function show(token) {
  const { res, body } = await api('/v1/admin/ai-config', {}, token);
  if (res.status === 404) die('not authorized — is OPERATOR_DEVICE_ID flagged is_operator? (the admin surface 404s non-operators)');
  if (!res.ok) die(`show failed (${res.status}): ${JSON.stringify(body.error || body)}`);
  printConfig(body.data);
}

async function set(token, task, provider, model, fallbackModel) {
  if (!TASKS.includes(task)) die(`unknown task '${task}'. one of: ${TASKS.join(', ')}`);
  if (!PROVIDERS.includes(provider)) die(`unknown provider '${provider}'. one of: ${PROVIDERS.join(', ')}`);
  if (!model) die('model is required: set <task> <provider> <model> [fallbackModel]');
  const payload = { provider, model };
  if (fallbackModel) payload.fallbackModel = fallbackModel;
  const { res, body } = await api(`/v1/admin/ai-config/${task}`, { method: 'PUT', body: JSON.stringify(payload) }, token);
  if (res.status === 404) die('not authorized (operator only)');
  if (res.status === 409) die(`provider '${provider}' has no API key configured on the server`);
  if (!res.ok) die(`set failed (${res.status}): ${JSON.stringify(body.error || body)}`);
  console.log(`✔ set ${task} → ${provider}/${model}${fallbackModel ? ` (fallback ${fallbackModel})` : ''}\n`);
  await show(token);
}

async function reset(token, task) {
  if (!TASKS.includes(task)) die(`unknown task '${task}'. one of: ${TASKS.join(', ')}`);
  const { res, body } = await api(`/v1/admin/ai-config/${task}`, { method: 'DELETE' }, token);
  if (res.status === 404) die('not authorized (operator only)');
  if (!res.ok) die(`reset failed (${res.status}): ${JSON.stringify(body.error || body)}`);
  console.log(`✔ reset ${task} → default\n`);
  await show(token);
}

const [cmd = 'show', ...rest] = process.argv.slice(2);
if (cmd === '-h' || cmd === '--help' || cmd === 'help') { usage(); process.exit(0); }
if (!['show', 'set', 'reset'].includes(cmd)) { usage(); die(`unknown command '${cmd}'`); }

const token = await operatorToken();
if (cmd === 'show') await show(token);
else if (cmd === 'set') await set(token, ...rest);
else if (cmd === 'reset') await reset(token, rest[0]);
