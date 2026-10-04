import test from 'node:test';
import assert from 'node:assert/strict';
import { CALL_ALL_MAX_PER_RUN, limitFor, limitMessage, periodKey } from '../../lib/usage/rules';

test('monthly limits match the plans', () => {
  assert.deepEqual(['starter', 'growth', 'enterprise'].map((p) => limitFor('ai_call', p as 'starter')), [80, 250, 600]);
  assert.deepEqual(['starter', 'growth', 'enterprise'].map((p) => limitFor('whatsapp', p as 'starter')), [150, 500, 1500]);
});

test('daily caps are the same for every plan', () => {
  for (const p of ['starter', 'growth', 'enterprise'] as const) {
    assert.equal(limitFor('ai_chat', p), 100);
    assert.equal(limitFor('google_lookup', p), 100);
  }
});

test('Call All is capped at 100 per click', () => {
  assert.equal(CALL_ALL_MAX_PER_RUN, 100);
});

test('periods follow India time, not UTC', () => {
  // 19:00 UTC on 31 Oct is already 00:30 on 1 Nov in India.
  const t = Date.UTC(2026, 9, 31, 19, 0, 0);
  assert.equal(periodKey('ai_call', t), '2026-11');
  assert.equal(periodKey('ai_chat', t), '2026-11-01');
  // 17:00 UTC on 31 Oct is 22:30 on 31 Oct in India.
  assert.equal(periodKey('whatsapp', Date.UTC(2026, 9, 31, 17, 0, 0)), '2026-10');
});

test('messages are plain and name the plan, the limit and the reset', () => {
  const now = Date.UTC(2026, 9, 10);
  const monthly = limitMessage('ai_call', 'starter', 80, now);
  assert.match(monthly, /all 80 AI calls/);
  assert.match(monthly, /Starter plan/);
  assert.match(monthly, /1 Nov 2026/);
  assert.match(limitMessage('whatsapp', 'growth', 500, Date.UTC(2026, 11, 5)), /1 Jan 2027/);
  assert.match(limitMessage('ai_chat', 'starter', 100, now), /today's limit of 100 AI chat messages/);
});
