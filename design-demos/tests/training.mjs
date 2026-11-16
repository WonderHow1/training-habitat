import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const model = readFileSync(new URL('../src/training.js', import.meta.url), 'utf8');
const { DAY, seed, bj, deadline, eligible, match, refresh, status, health, points, changeDate,
  adopt, restore, recoverable, saveRecord, similarRecord, isoWeek, daysInMonth } = vm.runInNewContext(model + `
  ({ DAY, seed, bj, deadline, eligible, match, refresh, status, health, points, changeDate,
     adopt, restore, recoverable, saveRecord, similarRecord, isoWeek, daysInMonth })`);
const find = (state, id) => state.plans.find(plan => plan.id === id);
const recordFor = (plan, patch = {}) => ({
  id: 'test', date: plan.date, start: '18:30', minutes: plan.minutes, title: '户外跑步', source: 'manual', ...patch
});

test('week numbers use Monday and handle year boundaries', () => {
  const cases = [
    ['2026-11-16', 2026, 47], ['2026-11-22', 2026, 47],
    ['2027-01-01', 2026, 53], ['2027-01-04', 2027, 1],
    ['2025-12-29', 2026, 1]
  ];
  for (const [date, year, number] of cases) {
    assert.deepEqual({ ...isoWeek(date) }, { year, number }, date);
  }
});

test('the calendar has the correct length for each month', () => {
  assert.equal(daysInMonth('2024-02'), 29);
  assert.equal(daysInMonth('2100-02'), 28);
  assert.equal(daysInMonth('2026-11'), 30);
  assert.equal(daysInMonth('2026-12'), 31);
});

test('one eligible session completes one plan and increments growth once (A01–A03, A11)', () => {
  const state = seed();
  const plan = find(state, 'today');
  assert.equal(eligible(state, plan, recordFor(plan, { minutes: 10 })), false);
  assert.equal(eligible(state, plan, recordFor(plan, { minutes: 10 })), false);
  const record = recordFor(plan, { source: 'device' });
  assert.equal(match(state, plan, record), true);
  assert.equal(match(state, plan, record), false);
  assert.equal(eligible(state, { ...plan, id: 'another' }, record), false);
  assert.equal(status(state, plan), 'done');
  assert.equal(points(state, 'moss'), 2);
  assert.equal(health(state, 'moss'), 2);
});

test('rescheduling stays in the plan week and updates the original plan (A04–A05)', () => {
  const state = seed();
  const plan = find(state, 'today');
  assert.equal(changeDate(state, plan, '2026-11-23'), false);
  assert.equal(changeDate(state, plan, '2026-11-17'), true);
  assert.equal(plan.id, 'today');
  assert.equal(deadline(plan), bj('2026-11-18'));
  assert.equal(eligible(state, plan, recordFor(plan, { date: '2026-11-16' })), false);
  assert.equal(changeDate(state, find(state, 'grace'), '2026-11-16'), false);
  assert.equal(changeDate(state, find(state, 'first'), '2026-11-16'), false);
});

test('training before the plan took effect, after it expired, or ending at midnight cannot count', () => {
  const state = seed();
  const plan = find(state, 'grace');
  assert.equal(eligible(state, plan, recordFor(plan, { date: '2026-11-16' })), false);
  assert.equal(eligible(state, plan, recordFor(plan, { start: '23:45' })), false);
  plan.effective = bj(plan.date, '19:00');
  assert.equal(eligible(state, plan, recordFor(plan)), false);
});

test('manual grace period and lapse boundaries are half-open (A06–A08)', () => {
  const state = seed();
  const plan = find(state, 'grace');
  const record = recordFor(plan);
  assert.equal(status(state, plan), 'grace');
  assert.equal(eligible(state, plan, record), true);
  assert.equal(eligible(state, plan, { ...record, date: '2026-11-16' }), false);
  state.now = deadline(plan) + DAY;
  refresh(state);
  refresh(state);
  assert.equal(status(state, plan), 'missed');
  assert.equal(health(state, 'moss'), 1);
  assert.equal(eligible(state, plan, record), false);
});

test('late automatic record reverses the specific loss and awards growth once (A09–A10)', () => {
  const state = seed();
  const plan = find(state, 'old');
  assert.equal(status(state, plan), 'missed');
  const automatic = recordFor(plan, { source: 'device' });
  assert.equal(eligible(state, plan, recordFor(plan)), false);
  state.now = deadline(plan) + DAY;
  assert.equal(eligible(state, plan, automatic), true);
  state.now = deadline(plan) + 7 * DAY;
  assert.equal(eligible(state, plan, automatic), false);
  state.now -= 1;
  assert.equal(match(state, plan, automatic), true);
  assert.equal(match(state, plan, automatic), false);
  assert.equal(health(state, 'moss'), 3);
  assert.equal(points(state, 'moss'), 2);
});

test('repeated device import and merging with hand-entry reuse the same history record (A11)', () => {
  const state = seed();
  const plan = find(state, 'today');
  const manual = saveRecord(state, recordFor(plan));
  assert.equal(match(state, plan, manual), true);
  const device = recordFor(plan, { source: 'device', deviceId: 'import-one' });
  assert.equal(similarRecord(state, device), manual);
  assert.equal(saveRecord(state, device, true), manual);
  assert.equal(saveRecord(state, device), manual);
  assert.equal(state.records.length, 4);
  assert.equal(points(state, 'moss'), 2);
});

test('death preserves training and a correction can restore the original pet (A12–A13)', () => {
  const state = seed('death');
  assert.equal(state.active, null);
  assert.equal(health(state, 'moss'), 0);
  assert.equal(adopt(state, '点点'), true);
  const newer = state.active;
  const old = find(state, 'old');
  assert.equal(match(state, old, recordFor(old, { source: 'device' })), true);
  assert.equal(state.active, newer);
  assert.equal(recoverable(state).length, 1);
  assert.equal(restore(state, 'moss'), true);
  assert.equal(state.active, 'moss');
  assert.equal(health(state, newer), 3);
  assert.equal(health(state, 'moss'), 1);
  assert.equal(state.records.length, 3);
});

test('pending deductions belong to the pet active at the original deadline (A12, A14–A15)', () => {
  const state = seed('death');
  const template = find(state, 'old');
  state.plans.push({ ...template, id: 'past', date: '2026-11-13' });
  refresh(state);
  assert.equal(state.misses.past, 'moss');
  assert.equal(match(state, template, recordFor(template, { source: 'device' })), true);
  assert.equal(health(state, 'moss'), 0);
  assert.equal(recoverable(state).length, 0);
  assert.equal(adopt(state, '点点'), true);
  state.now = bj('2026-11-17', '00:00');
  refresh(state);
  assert.equal(state.misses.grace, null);
  assert.equal(health(state, state.active), 3);
});
