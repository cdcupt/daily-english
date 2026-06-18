import { describe, it, expect } from 'vitest';
import { supportsTemperature, isProviderId } from '../src/ai/providers.js';
import { pickConfig, type TaskDefault } from '../src/ai/registry.js';
import { runWithResilience, isTransientErr, isTimeoutErr, type AttemptTarget } from '../src/ai/execute.js';
import { AIError } from '../src/ai/client.js';
import { AIContractError } from '../src/ai/runner.js';

describe('supportsTemperature', () => {
  it('rejects gpt-5.5 (sends no temperature)', () => {
    expect(supportsTemperature('gpt-5.5')).toBe(false);
    expect(supportsTemperature('gpt-5.5-2025-08-07')).toBe(false);
  });
  it('allows other models', () => {
    expect(supportsTemperature('gpt-5.4-mini')).toBe(true);
    expect(supportsTemperature('gemini-3.1-pro-preview')).toBe(true);
    expect(supportsTemperature('gemini-3-flash-preview')).toBe(true);
  });
});

describe('isProviderId', () => {
  it('guards providers', () => {
    expect(isProviderId('openai')).toBe(true);
    expect(isProviderId('gemini')).toBe(true);
    expect(isProviderId('anthropic')).toBe(false);
  });
});

describe('pickConfig precedence', () => {
  const def: TaskDefault = { provider: 'gemini', model: 'gemini-3.1-pro-preview', fallback: { provider: 'openai', model: 'gpt-5.4-mini' } };
  const allAvail = () => true;

  it('uses the default when no env/db override', () => {
    const r = pickConfig(def, {}, null, allAvail);
    expect(r).toMatchObject({ provider: 'gemini', model: 'gemini-3.1-pro-preview', source: 'default' });
  });
  it('env override beats default', () => {
    const r = pickConfig(def, { provider: 'openai', model: 'gpt-5.4-mini' }, null, allAvail);
    expect(r).toMatchObject({ provider: 'openai', model: 'gpt-5.4-mini', source: 'env' });
  });
  it('db override beats env + default', () => {
    const r = pickConfig(def, { provider: 'openai', model: 'x' }, { provider: 'gemini', model: 'gemini-3-flash-preview' }, allAvail);
    expect(r).toMatchObject({ provider: 'gemini', model: 'gemini-3-flash-preview', source: 'db' });
  });
  it('degrades to the default provider when the chosen one has no key', () => {
    // chosen gemini, but only openai available → degrade to fallback-safe default provider path
    const onlyOpenai = (p: string) => p === 'openai';
    const r = pickConfig(def, {}, null, onlyOpenai);
    expect(r.provider).toBe('openai');
    expect(r.source).toBe('degraded');
  });
  it('carries a db fallbackModel as an openai fallback', () => {
    const r = pickConfig(def, {}, { provider: 'gemini', model: 'g', fallbackModel: 'gpt-5.4-mini' }, allAvail);
    expect(r.fallback).toEqual({ provider: 'openai', model: 'gpt-5.4-mini' });
  });
  it('a db row with fallbackModel:null suppresses the default fallback', () => {
    const r = pickConfig(def, {}, { provider: 'gemini', model: 'g', fallbackModel: null }, allAvail);
    expect(r.fallback).toBeUndefined();
  });
  it('degrades to the default fallback model (not just AI_TEXT_MODEL) when the provider is unavailable', () => {
    const onlyOpenai = (p: string) => p === 'openai';
    const r = pickConfig(def, {}, null, onlyOpenai);
    expect(r.provider).toBe('openai');
    expect(r.model).toBe('gpt-5.4-mini'); // def.fallback.model, consulted first
    expect(r.source).toBe('degraded');
  });
});

describe('runWithResilience', () => {
  const t = (model: string): AttemptTarget => ({ provider: 'openai', model, baseUrl: 'x', apiKey: 'k' });
  const noSleep = async () => {};

  it('retries transient 5xx then succeeds on the primary', async () => {
    let calls = 0;
    const { result, used } = await runWithResilience({
      primary: t('p'), run: async () => { calls += 1; if (calls < 3) throw new AIError('boom', 503); return 'ok'; }, sleep: noSleep,
    });
    expect(result).toBe('ok'); expect(used.model).toBe('p'); expect(calls).toBe(3);
  });

  it('falls back to the fallback model on persistent 5xx', async () => {
    const { result, used } = await runWithResilience({
      primary: t('prim'), fallback: t('fb'),
      run: async (target) => { if (target.model === 'prim') throw new AIError('down', 503); return 'fb-ok'; },
      sleep: noSleep,
    });
    expect(result).toBe('fb-ok'); expect(used.model).toBe('fb');
  });

  it('falls back on a contract error (bad JSON after repair)', async () => {
    const { used } = await runWithResilience({
      primary: t('prim'), fallback: t('fb'),
      run: async (target) => { if (target.model === 'prim') throw new AIContractError('invalid', '{'); return 'ok'; },
      sleep: noSleep,
    });
    expect(used.model).toBe('fb');
  });

  it('rethrows when no fallback and retries exhausted', async () => {
    await expect(runWithResilience({
      primary: t('p'), run: async () => { throw new AIError('5xx', 502); }, sleep: noSleep,
    })).rejects.toBeInstanceOf(AIError);
  });

  it('does NOT retry a non-transient (4xx) error', async () => {
    let calls = 0;
    await expect(runWithResilience({
      primary: t('p'), run: async () => { calls += 1; throw new AIError('bad req', 400); }, sleep: noSleep,
    })).rejects.toBeInstanceOf(AIError);
    expect(calls).toBe(1);
  });

  it('falls back to the fallback model when the primary TIMES OUT (AbortError)', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { result, used } = await runWithResilience({
      primary: t('prim'), fallback: t('fb'),
      run: async (target) => { if (target.model === 'prim') throw abort; return 'fb-ok'; },
      sleep: noSleep,
    });
    expect(result).toBe('fb-ok'); expect(used.model).toBe('fb');
  });

  it('on a TIMEOUT, skips primary retries and fails over after ONE attempt', async () => {
    let primaryCalls = 0; let fbCalls = 0;
    const abort = Object.assign(new Error('request timed out'), { name: 'AbortError' });
    const { used } = await runWithResilience({
      primary: t('prim'), fallback: t('fb'),
      run: async (target) => {
        if (target.model === 'prim') { primaryCalls += 1; throw abort; }
        fbCalls += 1; return 'fb';
      },
      sleep: noSleep,
    });
    expect(used.model).toBe('fb');
    expect(primaryCalls).toBe(1); // NOT 3 — a stalled primary is not retried
    expect(fbCalls).toBe(1);
  });

  it('isTimeoutErr matches aborts/timeouts but not plain 5xx', () => {
    expect(isTimeoutErr(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isTimeoutErr(new AIError('AI request timed out (AbortError): ...'))).toBe(true);
    expect(isTimeoutErr(new AIError('boom', 503))).toBe(false);
  });

  it('isTransientErr classifies 5xx + network + timeout, not 4xx', () => {
    expect(isTransientErr(new AIError('a', 503))).toBe(true);
    expect(isTransientErr(new AIError('b'))).toBe(true); // no status = network (client rewraps)
    expect(isTransientErr(new AIError('c', 400))).toBe(false);
    expect(isTransientErr(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
    expect(isTransientErr(Object.assign(new Error('slow'), { name: 'TimeoutError' }))).toBe(true);
    expect(isTransientErr(new TypeError('fetch failed'))).toBe(true); // undici network failure
    expect(isTransientErr(new Error('something else'))).toBe(false);
  });
});
