import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const model = readFileSync(new URL('../src/training.js', import.meta.url), 'utf8');
const { DAY, seed, bj, deadline, eligible, match, refresh, status, health, points, changeDate,
  adopt, restore, recoverable, saveRecord, similarRecord, isoWeek, daysInMonth, setPetHabitat, trainingMinutes,
  editPlan, editRecord, deletePlan, deleteRecord, petExperienceRecords, experienceProgress, petAgeInDays } = vm.runInNewContext(model + `
  ({ DAY, seed, bj, deadline, eligible, match, refresh, status, health, points, changeDate,
     adopt, restore, recoverable, saveRecord, similarRecord, isoWeek, daysInMonth, setPetHabitat, trainingMinutes,
     editPlan, editRecord, deletePlan, deleteRecord, petExperienceRecords, experienceProgress, petAgeInDays })`);
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

test('training duration counts saved records by their dates, across the week and year boundary', () => {
  const records = [
    { date: '2025-12-28', minutes: 10 },
    { date: '2025-12-29', minutes: 20, plan: 'run', source: 'manual' },
    { date: '2025-12-29', minutes: 5, source: 'device' },
    { date: '2026-01-04', minutes: 30, source: 'manual' },
    { date: '2026-01-05', minutes: 40 }
  ];
  assert.equal(trainingMinutes(records, '2025-12-30'), 0);
  assert.equal(trainingMinutes(records, '2025-12-29'), 25);
  assert.equal(trainingMinutes(records, '2025-12-29', '2026-01-05'), 55);
});

test('meeting the daily goal counts all of that day’s minutes once, and deletion rechecks the goal', () => {
  const state = seed();
  const plan = find(state, 'today');
  const total = () => petExperienceRecords(state, 'moss').reduce((xp, { record }) => xp + record.minutes, 0);
  const manual = saveRecord(state, recordFor(plan));
  assert.equal(match(state, plan, manual), true);
  assert.equal(total(), 0);
  const sameWorkout = recordFor(plan, { source: 'device', deviceId: 'same-workout' });
  assert.equal(saveRecord(state, sameWorkout, true), manual);
  assert.equal(total(), 0);
  const later = saveRecord(state, recordFor(plan, { start: '19:00', minutes: 10 }));
  assert.equal(total(), 30);
  assert.equal(total(), 30);
  assert.equal(deletePlan(state, plan.id), true);
  assert.equal(total(), 30);
  assert.equal(deleteRecord(state, later.id), true);
  assert.equal(total(), 0);
});

test('experience uses the chosen goal and goes to the pet present when each workout ended', () => {
  const state = seed('onboarding');
  state.dailyGoal = 10;
  state.now = bj('2026-11-16', '12:00');
  assert.equal(adopt(state, '小栗'), true);
  const pet = state.active;
  state.now = bj('2026-11-16', '20:00');
  saveRecord(state, { date: '2026-11-16', start: '10:00', minutes: 9 });
  assert.equal(petExperienceRecords(state, pet).length, 0);
  const afternoon = saveRecord(state, { date: '2026-11-16', start: '15:00', minutes: 5 });
  saveRecord(state, { date: '2026-11-16', start: '20:00', minutes: 50 });
  assert.deepEqual(Array.from(petExperienceRecords(state, pet), ({ record }) => record.id), [afternoon.id]);
});

test('each 100 experience points advances the level and carries over the remainder', () => {
  assert.deepEqual({ ...experienceProgress(0) }, { level: 1, progress: 0 });
  assert.deepEqual({ ...experienceProgress(100) }, { level: 2, progress: 0 });
  assert.deepEqual({ ...experienceProgress(205) }, { level: 3, progress: 5 });
});

test('adoption records the pet species and chosen habitat independently of health', () => {
  const state = seed('onboarding');
  assert.equal(adopt(state, '米粒', 'dog', 'unsupported'), false);
  assert.equal(adopt(state, '米粒', 'unsupported', 'gym'), false);
  assert.equal(adopt(state, '米粒', 'rabbit', 'running-track'), true);
  const pet = state.pets.find(entry => entry.id === state.active);
  assert.equal(pet.species, 'rabbit');
  assert.equal(pet.weightGrams, 1800);
  assert.equal(petAgeInDays(pet, state.now), 0);
  assert.equal(pet.habitat, 'running-track');
  assert.equal(setPetHabitat(state, 'bedroom'), true);
  assert.equal(setPetHabitat(state, 'unsupported'), false);
  assert.equal(pet.habitat, 'bedroom');
  assert.equal(health(state, pet.id), 3);
});

test('pet age advances at local midnight and a memorial retains the age at death', () => {
  const living = seed().pets[0];
  assert.equal(living.weightGrams, 3200);
  assert.equal(petAgeInDays(living, bj('2026-11-16', '23:59')), 7);
  assert.equal(petAgeInDays(living, bj('2026-11-17')), 8);
  const memorial = seed('death').pets[0];
  assert.equal(petAgeInDays(memorial, bj('2026-11-17')), 6);
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

test('editing a plan preserves its ID and updates an invalidated completion', () => {
  const state = seed();
  const future = find(state, 'next');
  assert.equal(editPlan(state, future, { title: '深蹲', date: '2026-11-23', minutes: 35 }), false);
  assert.equal(future.title, '下肢力量');
  assert.equal(editPlan(state, future, { title: '深蹲', date: '2026-11-20', minutes: 35 }), true);
  assert.equal(future.id, 'next');
  assert.equal(future.effective, state.now);
  const done = find(state, 'first');
  assert.equal(editPlan(state, done, { title: '核心', date: '2026-11-11', minutes: 25 }), false);
  assert.equal(status(state, done), 'done');
  assert.equal(editPlan(state, done, { title: '核心', minutes: 25 }), true);
  assert.equal(status(state, done), 'missed');
  assert.equal(state.records.find(record => record.id === 'sample').plan, undefined);
  assert.equal(points(state, 'moss'), 0);
});

test('editing a linked record maintains the link only while it still meets the plan', () => {
  const state = seed();
  const record = state.records.find(entry => entry.id === 'sample');
  assert.equal(editRecord(state, record, { ...record, title: '核心', minutes: 17 }), true);
  assert.equal(record.plan, 'first');
  assert.equal(editRecord(state, record, { ...record, date: '2026-11-17' }), false);
  assert.equal(record.date, '2026-11-10');
  assert.equal(editRecord(state, record, { ...record, minutes: 10 }), true);
  assert.equal(status(state, find(state, 'first')), 'missed');
  assert.equal(record.plan, undefined);
});

test('deleting a plan retains its workout and removes its growth or deduction', () => {
  const state = seed('death');
  assert.equal(deletePlan(state, 'old'), true);
  assert.equal(deletePlan(state, 'old'), false);
  assert.equal(health(state, 'moss'), 1);
  assert.equal(restore(state, 'moss'), true);
  assert.equal(deletePlan(state, 'first'), true);
  assert.equal(points(state, 'moss'), 0);
  const actual = state.records.find(record => record.id === 'sample');
  assert.equal(actual.minutes, 18);
  assert.equal(actual.plan, undefined);
});

test('deleting a correction reapplies its original deduction without rewriting pet history', () => {
  const state = seed('death');
  const plan = find(state, 'old');
  const correction = saveRecord(state, recordFor(plan, { source: 'device', deviceId: 'correction' }));
  assert.equal(match(state, plan, correction), true);
  assert.equal(restore(state, 'moss'), true);
  const pet = state.pets[0];
  assert.equal(deleteRecord(state, correction.id), true);
  assert.equal(deleteRecord(state, correction.id), false);
  assert.equal(status(state, plan), 'missed');
  assert.equal(health(state, 'moss'), 0);
  assert.equal(state.active, null);
  assert.deepEqual([...pet.spans.at(-1)], [state.now, state.now]);
});
