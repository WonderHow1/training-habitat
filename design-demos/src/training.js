const DAY = 86_400_000;
const DEMO_AT = '2026-11-16T20:00';
const DEFAULT_DAILY_GOAL = 30;
const MIN_DAILY_GOAL = 10;
const XP_PER_LEVEL = 100;
const statuses = { upcoming: '待训练', grace: '待补记', missed: '已漏练', done: '已完成' };
const tabNames = { home: '今天', week: '计划', log: '记录', pet: '宠物' };
const petSpecies = { cat: '猫', dog: '狗', rabbit: '兔子', hamster: '仓鼠' };
const petWeightsInGrams = { cat: 3200, dog: 6000, rabbit: 1800, hamster: 120 };
const habitatStyles = { garden: '草地', gym: '健身房', 'running-track': '操场跑道', living: '客厅', bedroom: '卧室' };

function bj(date, time = '00:00') {
  return Date.parse(date + 'T' + time + ':00+08:00');
}

function dateAt(time) {
  return new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
}

function dayPlus(date, count) {
  return dateAt(bj(date) + count * DAY);
}

function trainingMinutes(records, start, end = dayPlus(start, 1)) {
  return records.reduce((total, { date, minutes }) =>
    date >= start && date < end ? total + minutes : total, 0);
}

function monday(date) {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  return dayPlus(date, -((weekday + 6) % 7));
}

function isoWeek(date) {
  const start = monday(date);
  const year = dayPlus(start, 3).slice(0, 4);
  const first = monday(year + '-01-04');
  return { year: Number(year), number: 1 + (bj(start) - bj(first)) / (7 * DAY) };
}

function daysInMonth(month) {
  const next = dayPlus(month + '-01', 32).slice(0, 7) + '-01';
  return Number(dayPlus(next, -1).slice(8));
}

function dateLabel(date) {
  return Number(date.slice(5, 7)) + '月' + Number(date.slice(8, 10)) + '日';
}

function deadline(plan) {
  return bj(plan.date) + DAY;
}

function stamp(time) {
  return dateLabel(dateAt(time)) + ' ' + new Date(time + 8 * 3_600_000).toISOString().slice(11, 16);
}

function seed(scenario = 'standard') {
  const add = (id, date, title, minutes) => ({ id, date: '2026-11-' + date, title, minutes, effective: bj('2026-11-09') });
  const first = add('first', '10', '核心训练', 15);
  const old = add('old', '12', '校园夜跑', 20);
  const grace = add('grace', '15', '舒展拉伸', 15);
  const today = add('today', '16', '校园夜跑', 20);
  const next = add('next', '19', '下肢力量', 30);
  const last = add('last', '21', '舒展拉伸', 15);
  const state = {
    now: bj(...DEMO_AT.split('T')),
    reminders: true,
    plans: [first, old, grace, today, next, last],
    records: [
      { id: 'sample-walk', date: '2026-11-14', start: '16:12', minutes: 24, title: '户外跑步', source: 'device' },
      { id: 'sample-stretch', date: '2026-11-13', start: '21:10', minutes: 12, title: '舒展拉伸', source: 'manual' },
      {
      id: 'sample', date: first.date, start: '18:40', minutes: 18, title: first.title,
      source: 'manual', plan: first.id
    }],
    pets: [{ id: 'moss', name: '团团', species: 'cat', weightGrams: petWeightsInGrams.cat, spans: [[bj('2026-11-09'), null]], born: '2026-11-09' }],
    active: 'moss',
    finished: { first: { at: bj(first.date, '19:00'), pet: 'moss', record: 'sample' } },
    misses: {},
    serial: 1
  };
  if (scenario === 'death') {
    state.plans.push(add('miss2', '11', '下肢力量', 25), add('miss3', '13', '核心训练', 15));
  }
  if (scenario === 'onboarding') {
    Object.assign(state, { plans: [], records: [], pets: [], active: null, finished: {} });
  }
  refresh(state);
  return state;
}

function petAt(state, time) {
  return state.pets.find(pet => pet.spans.some(([start, end]) => start <= time && (end === null || time < end)))?.id ?? null;
}

function petAgeInDays(pet, now) {
  const end = pet.needsRecovery ? pet.spans.at(-1)?.[1] ?? now : now;
  return Math.max(0, (bj(dateAt(end)) - bj(pet.born)) / DAY);
}

function petExperienceRecords(state, petId) {
  if (!petId) return [];
  const goal = state.dailyGoal ?? DEFAULT_DAILY_GOAL;
  const dailyTotals = new Map();
  const workouts = [];
  for (const record of state.records) {
    const end = bj(record.date, record.start) + record.minutes * 60_000;
    if (!Number.isFinite(end) || end > state.now || record.minutes <= 0) continue;
    dailyTotals.set(record.date, (dailyTotals.get(record.date) ?? 0) + record.minutes);
    workouts.push({ record, end });
  }
  return workouts.filter(({ record, end }) => dailyTotals.get(record.date) >= goal && petAt(state, end) === petId);
}

function experienceProgress(xp) {
  return { level: Math.floor(xp / XP_PER_LEVEL) + 1, progress: xp % XP_PER_LEVEL };
}

function points(state, petId) {
  return Object.values(state.finished).filter(event => event.pet === petId).length;
}

function health(state, petId) {
  if (!petId) return 0;
  return Math.max(0, 3 - Object.entries(state.misses).filter(([id, pet]) => pet === petId && !state.finished[id]).length);
}

function settlePetDeath(state, at) {
  if (!state.active || health(state, state.active) > 0) return;
  const pet = state.pets.find(entry => entry.id === state.active);
  const span = pet.spans.at(-1);
  span[1] = Math.max(span[0], at);
  pet.needsRecovery = true;
  state.active = null;
}

function refresh(state, revisedAt) {
  const pending = state.plans.filter(plan => !state.finished[plan.id] && !Object.hasOwn(state.misses, plan.id) && deadline(plan) + DAY <= state.now);
  pending.sort((a, b) => deadline(a) - deadline(b));
  for (const plan of pending) {
    const petId = petAt(state, deadline(plan));
    state.misses[plan.id] = petId;
    if (petId === state.active) settlePetDeath(state, revisedAt ?? deadline(plan) + DAY);
  }
}

function status(state, plan) {
  if (state.finished[plan.id]) return 'done';
  if (Object.hasOwn(state.misses, plan.id)) return 'missed';
  return state.now < deadline(plan) ? 'upcoming' : 'grace';
}

function changeDate(state, plan, date) {
  if (status(state, plan) !== 'upcoming' || monday(date) !== monday(plan.date) || date < dateAt(state.now)) return false;
  if (plan.date !== date) {
    plan.date = date;
    plan.effective = state.now;
  }
  return true;
}

function fitsPlan(plan, record, now) {
  if (record.date !== plan.date) return false;
  const start = bj(record.date, record.start);
  const end = start + record.minutes * 60_000;
  return Number.isFinite(end) && start >= plan.effective && end < deadline(plan) && end <= now && record.minutes >= plan.minutes;
}

function eligible(state, plan, record) {
  if (!plan || state.finished[plan.id] || record.plan || !fitsPlan(plan, record, state.now)) return false;
  return state.now < deadline(plan) + DAY || ((record.source === 'device' || Boolean(record.deviceId)) && state.now < deadline(plan) + 7 * DAY);
}

function match(state, plan, record) {
  if (!eligible(state, plan, record)) return false;
  const end = bj(record.date, record.start) + record.minutes * 60_000;
  const pet = Object.hasOwn(state.misses, plan.id) ? state.misses[plan.id] : petAt(state, end);
  state.finished[plan.id] = { at: state.now, pet, record: record.id };
  record.plan = plan.id;
  return true;
}

function saveRecord(state, input, merge = false) {
  const exact = input.deviceId && state.records.find(record => record.deviceId === input.deviceId);
  if (exact) return exact;
  if (merge) {
    const similar = similarRecord(state, input);
    if (similar) {
      similar.deviceId = input.deviceId;
      return similar;
    }
  }
  const record = { ...input, id: 'record-' + ++state.serial };
  state.records.unshift(record);
  return record;
}

function similarRecord(state, input) {
  return state.records.find(record =>
    record.source === 'manual' && record.date === input.date && record.start === input.start && record.minutes === input.minutes
  );
}

function unlinkTraining(state, record) {
  if (!record?.plan) return;
  delete state.finished[record.plan];
  delete record.plan;
  refresh(state, state.now);
  settlePetDeath(state, state.now);
}

function editPlan(state, plan, { title, date = plan?.date, minutes }) {
  if (!plan || !title || !Number.isInteger(minutes) || minutes < 1 || minutes > 1439) return false;
  if (date !== plan.date && (!Number.isFinite(bj(date)) || !changeDate(state, plan, date))) return false;
  Object.assign(plan, { title, minutes });
  const record = state.records.find(entry => entry.plan === plan.id);
  if (record && !fitsPlan(plan, record, state.now)) unlinkTraining(state, record);
  return true;
}

function editRecord(state, record, { title, date, start, minutes }) {
  const end = bj(date, start) + minutes * 60_000;
  if (!record || !title || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || !Number.isFinite(end) || end > state.now) return false;
  Object.assign(record, { title, date, start, minutes });
  const plan = state.plans.find(entry => entry.id === record.plan);
  if (plan && !fitsPlan(plan, record, state.now)) unlinkTraining(state, record);
  return true;
}

function deletePlan(state, id) {
  const index = state.plans.findIndex(plan => plan.id === id);
  if (index < 0) return false;
  state.plans.splice(index, 1);
  const record = state.records.find(entry => entry.plan === id);
  if (record) delete record.plan;
  delete state.finished[id];
  delete state.misses[id];
  return true;
}

function deleteRecord(state, id) {
  const index = state.records.findIndex(record => record.id === id);
  if (index < 0) return false;
  const [record] = state.records.splice(index, 1);
  unlinkTraining(state, record);
  return true;
}

function switchPet(state, pet) {
  const active = state.pets.find(entry => entry.id === state.active);
  if (active) active.spans.at(-1)[1] = state.now;
  pet.spans.push([state.now, null]);
  state.active = pet.id;
}

function adopt(state, name, species = 'cat', habitat = 'garden') {
  if (state.active || !Object.hasOwn(petSpecies, species) || !Object.hasOwn(habitatStyles, habitat)) return false;
  const pet = { id: 'pet-' + ++state.serial, name, species, habitat, weightGrams: petWeightsInGrams[species], spans: [], born: dateAt(state.now) };
  state.pets.push(pet);
  switchPet(state, pet);
  return true;
}

function setPetHabitat(state, habitat) {
  const pet = state.pets.find(entry => entry.id === state.active);
  if (!pet || !Object.hasOwn(habitatStyles, habitat)) return false;
  pet.habitat = habitat;
  return true;
}

function recoverable(state) {
  return state.pets.filter(pet =>
    pet.id !== state.active && health(state, pet.id) > 0 &&
    (pet.needsRecovery || Object.entries(state.misses).some(([id, owner]) => owner === pet.id && state.finished[id]))
  );
}

function restore(state, petId) {
  const pet = recoverable(state).find(entry => entry.id === petId);
  if (!pet) return false;
  switchPet(state, pet);
  delete pet.needsRecovery;
  return true;
}
