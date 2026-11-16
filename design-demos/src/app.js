const root = document.querySelector('#board');
const theme = document.body.dataset.theme;
const usesGlass = document.body.hasAttribute('data-glass');
const habitatPalette = usesGlass ? 'blueGarden' : theme;
const icons = {
  home: 'M3 10.5 12 3l9 7.5V20H3z M9 20v-6h6v6', week: 'M4 6h16v14H4z M4 10h16 M8 4v4 M16 4v4',
  log: 'M5 4h14v16H5z M8 9h8 M8 13h8 M8 17h5', pet: 'M5 11V5l5 4h4l5-4v6l2 3v3l-4 3H7l-4-3v-3z M8 14h.1 M16 14h.1 M11 17h2',
  plus: 'M5 12h14 M12 5v14', arrow: 'm9 6 6 6-6 6', back: 'm15 6-6 6 6 6',
  run: 'M14 4a1.6 1.6 0 1 0 0 .1 M6 10l5-2 4 2 3 3h3 M11 8l-2 6 4 2-2 5 M9 14l-3 4H3',
  dumbbell: 'M8 5v14 M4 8v8 M16 5v14 M20 8v8 M8 12h8', stretch: 'M12 4a1.5 1.5 0 1 0 0 .1 M4 8l8 3 8-3 M12 11v4 M12 15l-5 5 M12 15l5 5',
  check: 'm5 12 4 4L19 6', watch: 'M8 6l1-4h6l1 4 M8 18l1 4h6l1-4 M7 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M12 9v3l2 1',
  bell: 'M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3z M10 21h4', close: 'm6 6 12 12 M18 6 6 18',
  sun: 'M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M19 5l-1.5 1.5 M6.5 17.5 5 19'
};
const icon = (name, size = 21) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const button = (text, action, cls = 'primary', value = '', disabled = false) =>
  `<button type="button" class="${cls}" data-action="${action}" data-value="${escape(value)}" ${disabled ? 'disabled' : ''}>${text}</button>`;
const round = (name, label, action, value = '') =>
  `<button type="button" class="round" aria-label="${label}" title="${label}" data-action="${action}" data-value="${escape(value)}">${icon(name)}</button>`;
const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
const chip = status => `<span class="chip ${status}"><i></i>${statuses[status]}</span>`;
const activity = name => name.includes('跑') ? 'run' : name.includes('拉伸') ? 'stretch' : 'dumbbell';
const heart = filled => `<svg width="19" height="17" viewBox="0 0 11 10" aria-hidden="true" class="${filled ? 'filled' : 'empty'}"><path fill="currentColor" d="M1 0h3v1h3V0h3v1h1v4h-1v1H9v1H8v1H7v1H6v1H5V9H4V8H3V7H2V6H1V5H0V1h1z"/></svg>`;
const orderByDate = (a, b) => a.date.localeCompare(b.date);
const clocks = date => date.split('T');
const trainingHours = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const projectHistoryKey = 'pixel-fitness.training-projects';
let projectHistory = [];
try {
  const saved = JSON.parse(localStorage.getItem(projectHistoryKey) ?? '[]');
  if (Array.isArray(saved)) projectHistory = saved.filter(item => typeof item === 'string' && item.trim());
} catch {
  // Local files can run in browsers that disable storage.
}

function rememberProject(title) {
  const key = title.toLowerCase();
  projectHistory = [title, ...projectHistory.filter(item => item.toLowerCase() !== key)];
  try {
    localStorage.setItem(projectHistoryKey, JSON.stringify(projectHistory));
  } catch {
    // The current demo session can still offer recently used projects.
  }
}

function projectSuggestions(value) {
  const search = value.trim().toLowerCase();
  const matches = projectHistory.filter(title => {
    const key = title.toLowerCase();
    return key !== search && key.includes(search);
  }).slice(0, 6);
  if (!matches.length) return '';
  return `<p>最近使用</p><div class="project-history-options">${matches
    .map(title => button(escape(title), 'pick-project', 'secondary', title)).join('')}</div>`;
}

function projectField(value = '') {
  return field('训练项目', `<input name="title" type="text" autocomplete="off" placeholder="输入训练项目" value="${escape(value)}" required>`) +
    `<div class="project-history">${projectSuggestions(value)}</div>`;
}

function demoState(scenario) {
  const state = seed(scenario);
  if (usesGlass && scenario !== 'onboarding') state.records.push(...sampleTrainingHistory());
  return state;
}

function createPhone(container) {
  const initial = container.dataset.phone;
  const phone = iosFrame();
  const outlet = phone.querySelector('.ios-content');
  outlet.innerHTML = `<div class="phone-app"><div class="app-scroll"></div>
    <nav class="tabbar" aria-label="App 导航">${Object.entries(tabNames).map(([key, title]) =>
      `<button type="button" data-action="tab" data-value="${key}">${icon(key)}<span>${title}</span></button>`).join('')}</nav>
    <div class="app-overlays"></div></div>`;
  const scrollArea = outlet.querySelector('.app-scroll');
  const tabbar = outlet.querySelector('.tabbar');
  const tabButtons = [...tabbar.querySelectorAll('button')];
  const layers = outlet.querySelector('.app-overlays');
  const phoneScreen = outlet.closest('.ios-screen');
  const habitatEntry = usesGlass ? document.createElement('section') : null;
  if (habitatEntry) {
    habitatEntry.className = 'habitat-entry';
    habitatEntry.setAttribute('aria-label', '栖息地');
    phoneScreen.append(habitatEntry);
  }
  let showHabitat = Boolean(habitatEntry) && initial === 'home';
  let state = demoState('standard');
  let tab = initial;
  let overlay = null;
  let scenario = 'standard';
  let week = monday(dateAt(state.now));
  let selectedDay = null;
  let logFilter = 'all';
  let logDay = null;
  let notice = '';
  let restoreFocus = null;
  let clickTrigger = null;
  const onboarding = usesGlass && initial === 'home' ? createOnboarding(phoneScreen, {
    palette: habitatPalette, speciesPicker, habitatPicker,
    finish({ minutes, name, species, habitat }) {
      if (!adopt(state, name.trim(), species, habitat)) return;
      state.dailyGoal = Number(minutes);
      scenario = 'standard';
      tab = 'home';
      showHabitat = true;
      onboarding.stop();
      render();
      habitatEntry.querySelector('button').focus({ preventScroll: true });
    }
  }) : null;

  const current = () => state.pets.find(pet => pet.id === state.active) ??
    state.pets.reduce((last, pet) => !last || pet.spans.at(-1)[1] >= last.spans.at(-1)[1] ? pet : last, null);
  const getPlan = id => state.plans.find(plan => plan.id === id);
  const getRecord = id => state.records.find(record => record.id === id);
  const today = () => dateAt(state.now);
  const weekday = date => '周' + '日一二三四五六'[new Date(date + 'T00:00:00Z').getUTCDay()];
  const isPetHabitat = () => Boolean(habitatEntry) && tab === 'pet';

  function head(title, sub, action = '', afterTitle = '') {
    return `<header class="app-head"><div>${sub ? `<p class="kicker">${sub}</p>` : ''}<h2>${title}</h2>${afterTitle}</div>${action}</header>`;
  }

  function petDetails(pet) {
    const count = !usesGlass && pet ? points(state, pet.id) : 0;
    const awards = usesGlass ? petExperienceRecords(state, pet?.id) : [];
    const xp = awards.reduce((total, { record }) => total + record.minutes, 0);
    const { level: rank, progress } = experienceProgress(xp);
    const species = pet?.species ?? 'cat';
    const habitat = pet?.habitat ?? 'garden';
    const level = usesGlass ? Math.min(3, rank) : count >= 5 ? 3 : count >= 2 ? 2 : 1;
    const hp = pet ? health(state, pet.id) : 0;
    const name = pet ? escape(pet.name) : '待领养';
    const stage = pet ? (hp ? ['幼苗期', '成长期', '成熟期'][level - 1] : '已离世') : '还没有在养宠物';
    const lives = `<div class="hearts" role="img" aria-label="${hp} 格血，共 3 格">${[1, 2, 3].map(i => heart(i <= hp)).join('')}</div>`;
    return { count, rank, progress, awards, level, hp, name, stage, lives, species, habitat };
  }

  function petGrowth({ count, rank, progress }) {
    if (usesGlass) return `<div class="growth experience">
      <strong>Lv.${rank}</strong><div class="growth-bar" role="progressbar" aria-label="升级经验" aria-valuenow="${progress}" aria-valuemax="${XP_PER_LEVEL}">
        <i style="width:${progress / XP_PER_LEVEL * 100}%"></i></div><span>${progress} / ${XP_PER_LEVEL} XP</span></div>`;
    return `<div class="growth"><div class="growth-bar" aria-hidden="true"><i style="width:${Math.min(100, count * 20)}%"></i></div><span>成长 ${count} 次</span></div>`;
  }

  function profile(pet, full = false) {
    const details = petDetails(pet);
    const { level, hp, name, stage, lives, species, habitat } = details;
    const label = hp ? '栖息地' : pet ? '纪念画像' : '待领养';
    const openScene = habitatEntry && tab === 'home';
    return `<section class="habitat ${full ? 'expanded' : ''}${openScene ? ' habitat-link' : ''}">
      <div class="habitat-art">${petCanvas(habitatPalette, level, !hp, false, species, habitat)}<span class="scene-label">${label}</span></div>
      <div class="pet-meta"><div><strong>${name}</strong><span>${stage}</span></div>${lives}</div>
      ${petGrowth(details)}
      ${openScene ? '<button type="button" class="habitat-open" data-action="habitat" aria-label="打开全屏栖息地"></button>' : ''}
    </section>`;
  }

  function renderHabitat(preserve) {
    if (!habitatEntry) return;
    const petTab = isPetHabitat();
    const active = showHabitat || petTab;
    phoneScreen.toggleAttribute('data-habitat', active);
    phoneScreen.toggleAttribute('data-habitat-tabs', petTab);
    habitatEntry.toggleAttribute('data-active', active);
    habitatEntry.inert = !active || Boolean(overlay);
    if (tab !== 'home' && !petTab) return;
    const pet = current();
    const details = petDetails(pet);
    const { name, stage, lives, hp, level, species, habitat, awards } = details;
    const panelOffset = preserve ? habitatEntry.querySelector('.pet-scene-panel')?.scrollTop ?? 0 : 0;
    habitatEntry.setAttribute('aria-label', petTab ? '我的宠物' : '栖息地');
    habitatEntry.innerHTML = `<canvas class="habitat-landscape" width="88" height="192"
      data-portrait="${petTab ? 'pet' : 'home'}" ${pet ? '' : 'data-empty'} data-palette="${habitatPalette}" data-species="${species}" data-habitat="${habitat}" data-level="${level}" data-faded="${!hp}" aria-hidden="true"></canvas>
      <header class="habitat-entry-header">
        <p>${petTab ? '我的宠物' : '栖息地'}</p><h2>${name}</h2>
        <div class="habitat-entry-status">${pet ? lives : ''}<span>${stage}</span></div>
        ${petTab && pet ? `<p class="pet-born">领养于 ${dateLabel(pet.born)}</p>` : ''}
        ${!petTab && pet ? petGrowth(details) : ''}
      </header>
      ${petTab ? `<section class="pet-scene-panel" aria-label="经验与血量">
        <header class="pet-panel-header"><h3>经验与血量</h3>
          ${state.active ? button('更换背景', 'habitat-settings', 'secondary scene-control') : ''}</header>
        ${petGrowth(details)}
        ${petOptions(pet)}
        ${petTimeline(pet, awards)}
      </section>` : `<button type="button" class="habitat-continue">${icon('arrow', 16)}<span>上滑查看今天</span></button>`}`;
    drawScene(habitatEntry.querySelector('canvas'));
    const panel = habitatEntry.querySelector('.pet-scene-panel');
    if (panel) panel.scrollTop = panelOffset;
  }

  function setHabitat(visible) {
    if (showHabitat === visible) return;
    showHabitat = visible;
    render();
    const target = visible ? habitatEntry.querySelector('button') : scrollArea.querySelector('.app-head h2');
    if (!visible) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }

  function workoutRow(contents, detailAction, id, actions) {
    if (!actions) return button(contents, detailAction, 'list-row', id);
    return `<div class="swipe-workout" data-workout="${id}">
      <button type="button" class="list-row" data-action="${detailAction}" data-value="${id}" aria-keyshortcuts="ArrowLeft ArrowRight">${contents}</button>
      <div class="swipe-actions" inert>${actions}</div></div>`;
  }

  function managementActions(kind, id) {
    if (!usesGlass) return '';
    return button('编辑', 'edit-' + kind, 'primary', id) + button('删除', 'delete-' + kind, 'secondary destructive', id);
  }

  function planRow(plan, showDate = true, actions = '') {
    const stage = status(state, plan);
    const hint = stage === 'grace' ? '补记至 ' + stamp(deadline(plan) + DAY) :
      showDate ? weekday(plan.date) + ' · ' + dateLabel(plan.date) :
      '目标 ' + plan.minutes + ' 分钟' + (actions && stage === 'upcoming' ? ' · 今日结束前' : '');
    return workoutRow(`
      <span class="activity">${icon(activity(plan.title))}</span><span class="list-copy"><strong>${escape(plan.title)}</strong><small>${hint}</small></span>
      <span class="list-end">${chip(stage)}${showDate ? `<small>${plan.minutes} 分钟</small>` : ''}</span>${icon('arrow', 14)}
    `, 'detail', plan.id, actions);
  }

  function home() {
    const now = state.plans.filter(plan => plan.date === today()).sort(orderByDate);
    const due = state.plans.filter(plan => status(state, plan) === 'grace').sort(orderByDate)[0];
    const missed = state.plans.filter(plan => status(state, plan) === 'missed').sort(orderByDate).at(-1);
    const pet = current();
    const todayPlan = now[0];
    const stage = todayPlan && status(state, todayPlan);
    const minutes = usesGlass ? trainingMinutes(state.records, today()) : 0;
    const title = usesGlass ? `<span class="today-duration">今天已经锻炼<span class="duration-value">${trainingHours.format(minutes / 60)}小时</span></span>` : '今天';
    const subtitle = dateLabel(today()) + ' ' + weekday(today()) + (state.dailyGoal ? ` · 目标 ${state.dailyGoal} 分钟` : '');
    const remaining = Math.max(0, (state.dailyGoal ?? DEFAULT_DAILY_GOAL) - minutes);
    const afterTitle = usesGlass ? `<p class="today-remaining">你距离目标还有${remaining}分钟</p>` : '';
    const intro = head(title, subtitle, round('bell', '训练提醒', 'settings'), afterTitle);
    const pulse = `<section class="attention">${due ? `<button type="button" data-action="detail" data-value="${due.id}" class="notice-link"><span><strong>${escape(due.title)}待补记</strong><small>最晚 ${stamp(deadline(due) + DAY)}</small></span>${icon('arrow', 17)}</button>`
      : missed ? `<button type="button" data-action="detail" data-value="${missed.id}" class="notice-link"><span><strong>${escape(missed.title)}已漏练</strong><small>查看扣血和更正期限</small></span>${icon('arrow', 17)}</button>` : ''}</section>`;
    const empty = `<p class="empty-copy">今天无计划训练</p>${button('安排训练', 'new', 'secondary full')}`;
    if (usesGlass) return intro + profile(pet) + `<section class="today-task">
      <div class="task-heading"><h3>今日训练</h3></div>
      ${now.length ? now.map(plan => planRow(plan, false, managementActions('plan', plan.id))).join('') : empty}</section>` + pulse;
    const next = state.plans.filter(plan => plan.date > today()).sort(orderByDate)[0];
    const task = `<section class="today-task"><div class="task-heading"><h3>今日训练</h3>${todayPlan ? chip(stage) : ''}</div>
      ${todayPlan ? `<div class="task-main"><span class="activity">${icon(activity(todayPlan.title), 24)}</span><div><h4>${escape(todayPlan.title)}</h4><p>目标 ${todayPlan.minutes} 分钟 <span>·</span> 今日结束前</p></div></div>
      ${stage === 'upcoming' ? `<div class="task-actions">${button('记录训练', 'manual', 'primary', todayPlan.id)}${button('改期', 'reschedule', 'secondary', todayPlan.id)}</div>` : button('查看训练', 'detail', 'secondary full', todayPlan.id)}
      ${now.slice(1).map(plan => planRow(plan, false)).join('')}` :
      empty}</section>`;
    const following = `<section class="following"><h3>下一次训练</h3>${next ? planRow(next) : '<p class="empty-copy">暂无后续安排</p>'}</section>`;
    if (theme === 'track') return intro + task + `<div class="track-readout">${profile(pet)}</div>` + pulse + following;
    const lastGrowth = pet && Object.entries(state.finished).filter(([, event]) => event.pet === pet.id)
      .sort(([, a], [, b]) => b.at - a.at)[0];
    const diaryCaption = lastGrowth ? '最近成长于 ' + dateLabel(getPlan(lastGrowth[0]).date) + ' · ' + escape(getPlan(lastGrowth[0]).title) : '完成计划后会记录' + escape(pet?.name ?? '宠物') + '的成长。';
    if (theme === 'diary') return intro + `<div class="diary-story">${profile(pet)}<div class="story-caption">${diaryCaption}</div></div>` + pulse + task + following;
    return intro + profile(pet) + task + pulse + following;
  }

  function calendar() {
    const end = dayPlus(week, 6);
    const plans = state.plans.filter(plan => monday(plan.date) === week).sort(orderByDate);
    const shown = selectedDay ? plans.filter(plan => plan.date === selectedDay) : plans;
    const done = plans.filter(plan => status(state, plan) === 'done').length;
    const range = dateLabel(week) + '–' + dateLabel(end);
    const { year, number } = isoWeek(week);
    const weekTitle = usesGlass ? `<button type="button" class="week-trigger" data-action="pick-week" aria-haspopup="dialog">
      <strong>${year} 年第 ${number} 周 ${icon('arrow', 15)}</strong><span>${range}</span></button>` : `<h3>${range}</h3>`;
    const strip = Array.from({ length: 7 }, (_, index) => {
      const date = dayPlus(week, index);
      const slots = plans.filter(plan => plan.date === date);
      const marks = slots.length ? slots.slice(0, 3).map(plan => `<i class="mark ${status(state, plan)}"></i>`).join('') : '<i></i>';
      return `<button type="button" class="day ${date === today() ? 'actual' : ''}" aria-pressed="${selectedDay === date}" data-action="day" data-value="${date}">
        <small>${'一二三四五六日'[index]}</small><strong>${Number(date.slice(8))}</strong><span>${marks}</span></button>`;
    }).join('');
    const completed = `${done}<span> / ${plans.length}</span>`;
    const summary = usesGlass ? `<dl class="week-summary">
      <div><dt>本周已完成</dt><dd>${completed}</dd></div>
      <div><dt>本周训练时长</dt><dd>${trainingMinutes(state.records, week, dayPlus(week, 7))}<span> 分钟</span></dd></div>
    </dl>` : `<div class="week-total"><span>本周已完成</span><strong>${completed}</strong></div>`;
    return head('训练计划', usesGlass ? '' : '周一至周日', round('plus', '新增训练', 'new')) +
      `<section class="week-card"><div class="week-heading">${round('back', '上一周', 'previous')}${weekTitle}${round('arrow', '下一周', 'next')}</div>
      <div class="week-days" aria-label="筛选训练日期">${strip}</div>
      ${summary}</section>
      <section class="plan-list"><div class="section-heading"><h3>${selectedDay ? weekday(selectedDay) + '的安排' : '本周安排'}</h3>${selectedDay ? button('显示全周', 'day', 'text-button') : ''}</div>
      ${shown.map(plan => planRow(plan, true, managementActions('plan', plan.id))).join('') || '<p class="empty-copy">这段时间暂无计划训练</p>'}</section>` + button('新增训练', 'new', 'primary section-add');
  }

  function logged() {
    const options = [['all', '全部'], ['manual', '手动'], ['device', '设备']];
    const records = state.records.filter(record => logFilter === 'all' || logFilter === record.source);
    const entries = records.filter(record => !logDay || logDay === record.date)
      .sort((a, b) => bj(b.date, b.start) - bj(a.date, a.start));
    const sourceLabel = source => source === 'device' ? '设备' : '手动';
    const rows = entries.map((record, index) => {
      const diaryDate = theme === 'diary' && entries[index - 1]?.date !== record.date ? `<h3>${dateLabel(record.date)} ${weekday(record.date)}</h3>` : '';
      const date = theme === 'diary' ? '' : record.date.slice(5).replace('-', '/') + ' ';
      return diaryDate + workoutRow(`<span class="activity">${icon(activity(record.title))}</span>
      <span class="list-copy"><strong>${escape(record.title)}</strong><small>${date}${record.start}<span class="record-source"> · ${sourceLabel(record.source)}</span></small></span>
      <span class="list-end"><strong>${record.minutes} 分钟</strong><small>${record.plan ? '已匹配计划' : '仅训练记录'}</small></span>`,
      'record', record.id, managementActions('record', record.id));
    }).join('');
    return head('训练记录', usesGlass ? '' : '训练历史', round('plus', '手动记录', 'manual')) +
      (usesGlass ? trainingHeatmap(records, today(), logDay, initial) : '') +
      `<div class="record-actions">${button(icon('plus', 20) + '手动记录', 'manual', 'secondary')}${button(icon('watch', 20) + '导入设备', 'import', 'primary')}</div>
      <div class="segments" aria-label="按来源筛选">${options.map(([value, label]) => `<button type="button" data-action="filter" data-value="${value}" aria-pressed="${value === logFilter}">${label}</button>`).join('')}</div>
      <section class="record-feed">${rows || '<p class="empty-copy">暂无此来源的训练记录</p>'}</section>`;
  }

  function petOptions(pet) {
    const recovered = recoverable(state);
    if (state.active && !recovered.length) return '';
    return `<section class="pet-options">${state.active ? '' : button(pet ? '领养新宠物' : '领养宠物', 'adopt')}${recovered.map(entry => button('恢复 ' + escape(entry.name), 'restore', 'secondary', entry.id)).join('')}
      ${pet && !state.active ? '<p class="empty-copy">仍可继续训练。原计划和记录会保留。</p>' : ''}</section>`;
  }

  function petTimeline(pet, awards = []) {
    const gains = usesGlass ? awards.map(({ record, end }) => ({
      id: record.id, action: 'record', at: end, date: record.date, name: record.title, title: `经验 +${record.minutes} XP`, cls: 'done'
    })) : Object.entries(state.finished).filter(([, event]) => event.pet === pet?.id).map(([id, event]) => {
      const plan = getPlan(id);
      return { id, action: 'detail', at: event.at, date: plan.date, name: plan.title, title: '成长 +1', cls: 'done' };
    });
    const effects = [
      ...gains,
      ...Object.entries(state.misses).filter(([id, owner]) => owner === pet?.id && !state.finished[id])
        .map(([id]) => {
          const plan = getPlan(id);
          return { id, action: 'detail', at: deadline(plan) + DAY, date: plan.date, name: plan.title, title: '血量 −1', cls: 'missed' };
        })
    ].sort((a, b) => b.at - a.at);
    return effects.map(event => `<button type="button" class="list-row" data-action="${event.action}" data-value="${event.id}">
      <span class="activity ${event.cls}">${event.cls === 'done' ? icon('check') : heart(true)}</span><span class="list-copy"><strong>${event.title}</strong>
      <small>${dateLabel(event.date)} · ${escape(event.name)}</small></span>${icon('arrow', 14)}</button>`).join('') ||
      `<p class="empty-copy">${usesGlass ? '达到每日训练目标后会获得经验。' : '完成训练后，成长记录会出现在这里。'}</p>`;
  }

  function petScreen() {
    const pet = current();
    return head('我的宠物', pet ? '领养于 ' + dateLabel(pet.born) : '还没有在养宠物') +
      profile(pet, true) + petOptions(pet) +
      `<section class="pet-effects"><h3>成长与血量</h3>${petTimeline(pet)}</section>`;
  }

  function sheet(title, body) {
    return `<div class="shade"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="${initial}-sheet-title"><div class="grab"></div>
      <header><h3 id="${initial}-sheet-title">${title}</h3>${round('close', '关闭', 'close')}</header>${body}</section></div>`;
  }

  function detail(plan) {
    const stage = status(state, plan);
    const done = state.finished[plan.id];
    const record = done && getRecord(done.record);
    let reason;
    if (stage === 'upcoming') reason = usesGlass ? '在计划日内完成一场达标训练并保存记录。' : '在计划日内完成一场达标训练，并确认关联。';
    if (stage === 'grace') reason = '补记期间暂不扣血。请补记在原计划日完成的训练。';
    if (stage === 'missed') reason = state.misses[plan.id] ? '补记期满仍无达标记录，已扣 1 格血。' : '补记期满仍无达标记录。截止时没有在养宠物。';
    if (stage === 'done') {
      if (state.misses[plan.id]) reason = usesGlass ? '已用设备记录更正，撤销本次扣血。' : '已用设备记录更正，撤销本次扣血并补记成长。';
      else if (Object.hasOwn(state.misses, plan.id)) reason = '已用设备记录更正。截止时没有在养宠物。';
      else if (usesGlass) reason = '本次训练已计入计划。';
      else reason = done.pet ? '本次训练已计入成长。' : '训练已经计入计划。训练结束时没有在养宠物。';
    }
    return sheet(escape(plan.title), `<div class="sheet-status">${chip(stage)}<span>目标 ${plan.minutes} 分钟</span></div>
      <dl><div><dt>计划日期</dt><dd>${dateLabel(plan.date)} ${weekday(plan.date)}</dd></div>
      <div><dt>训练截止</dt><dd>${stamp(deadline(plan))}</dd></div>
      <div><dt>补记截止</dt><dd>${stamp(deadline(plan) + DAY)}</dd></div>
      ${stage === 'missed' ? `<div><dt>设备更正截止</dt><dd>${stamp(deadline(plan) + 7 * DAY)}</dd></div>` : ''}
      <div><dt>关联记录</dt><dd>${record ? escape(record.title) + ' · ' + record.minutes + ' 分钟' : '暂无'}</dd></div></dl>
      <p class="sheet-note">${reason}</p><div class="sheet-buttons">${['upcoming', 'grace'].includes(stage) ? button(stage === 'grace' ? '补记训练' : '记录训练', 'manual', 'primary', plan.id) : ''}
      ${stage === 'upcoming' ? button('改期', 'reschedule', 'secondary', plan.id) : ''}
      ${stage === 'missed' && state.now < deadline(plan) + 7 * DAY ? button('导入设备记录', 'import', 'primary', plan.id) : ''}</div>`);
  }

  function trainingForm(target, editing = false) {
    const date = target ? target.date : today();
    return sheet(editing ? '编辑训练记录' : '手动记录', `<form data-form="${editing ? 'edit-record' : 'manual'}">
      ${projectField(target?.title)}
      <div class="form-pair">${field('实际日期', `<input type="date" name="date" value="${date}" max="${today()}" required>`)}
      ${field('开始时间', `<input type="time" name="start" value="${target?.start ?? '18:30'}" required>`)}</div>
      ${field('实际时长（分钟）', `<input type="number" name="minutes" min="1" max="1440" value="${target?.minutes ?? 25}" required>`)}
      ${editing && target.plan ? '<p class="sheet-note">若修改后的记录不再满足原计划，系统会重新结算该计划。</p>' : ''}
      ${usesGlass && !editing && target ? `<p class="sheet-note">符合计划要求时，保存后会计入「${escape(target.title)}」。</p>` : ''}
      <p class="form-error" role="alert"></p><button class="primary full" type="submit">${editing || usesGlass ? '保存记录' : '下一步：确认关联'}</button></form>`);
  }

  function dateForm(plan, editing = false) {
    const start = plan ? monday(plan.date) : monday(selectedDay ?? today());
    const min = today() > start ? today() : start;
    const max = dayPlus(start, 6);
    const picked = plan?.date ?? (selectedDay && selectedDay >= min ? selectedDay : min);
    const rescheduling = plan && !editing;
    const fixedDate = editing && status(state, plan) !== 'upcoming';
    const dateLimit = fixedDate ? 'readonly' : `min="${min}" ${plan ? `max="${max}"` : ''}`;
    return sheet(editing ? '编辑训练计划' : plan ? '改期' : '新增训练', `<form data-form="${editing ? 'edit-plan' : plan ? 'reschedule' : 'new'}">
      ${rescheduling ? `<p class="sheet-note">${escape(plan.title)} · ${plan.minutes} 分钟。请选择同一周内的日期。</p>` : projectField(plan?.title)}
      ${field('计划日期', `<input type="date" name="date" ${dateLimit} value="${picked}" required>`)}
      ${rescheduling ? '' : field('目标时长（分钟）', `<input type="number" name="minutes" min="1" max="1439" value="${plan?.minutes ?? 20}" required>`)}
      ${fixedDate && state.finished[plan.id] ? '<p class="sheet-note">若新目标超过关联记录的时长，系统会重新结算该计划。</p>' : ''}
      <p class="form-error" role="alert"></p><button type="submit" class="primary full">${rescheduling ? '保存改期' : '保存计划'}</button></form>`);
  }

  function weekPicker(date) {
    const [year, month] = date.split('-');
    const yearStart = Math.min(1900, Number(year));
    const yearEnd = Math.max(2100, Number(year));
    const options = (values, current, suffix) => values.map(value =>
      `<option value="${value}" ${value === current ? 'selected' : ''}>${Number(value)}${suffix}</option>`
    ).join('');
    const yearValues = Array.from({ length: yearEnd - yearStart + 1 }, (_, index) => String(yearStart + index));
    const monthValues = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
    const monthKey = year + '-' + month;
    const start = monthKey + '-01';
    const leading = (bj(start) - bj(monday(start))) / DAY;
    const dates = Array.from({ length: daysInMonth(monthKey) }, (_, index) => {
      const value = dayPlus(start, index);
      return `<button type="button" class="picker-day" aria-label="${year}年${dateLabel(value)}" aria-pressed="${value === date}"
        ${value === today() ? 'aria-current="date"' : ''} data-action="pick-date" data-value="${value}">${index + 1}</button>`;
    }).join('');
    return sheet('选择日期', `<form class="week-picker" data-form="pick-week">
      <div class="form-pair">
        ${field('年份', `<select name="year">${options(yearValues, year, '年')}</select>`)}
        ${field('月份', `<select name="month">${options(monthValues, month, '月')}</select>`)}
      </div>
      <div class="picker-calendar" role="group" aria-label="${year}年${Number(month)}月">
        ${[...'一二三四五六日'].map(day => `<span class="picker-weekday">周${day}</span>`).join('')}
        ${'<span aria-hidden="true"></span>'.repeat(leading)}${dates}
      </div>
      <button class="primary full" type="submit">确认日期</button>
    </form>`);
  }

  function habitatPicker(habitat) {
    return field('栖息地背景', `<select name="habitat">${Object.entries(habitatStyles).map(([key, label]) =>
      `<option value="${key}" ${key === habitat ? 'selected' : ''}>${label}</option>`
    ).join('')}</select>`);
  }

  function speciesPicker(selected = 'cat') {
    const choices = Object.entries(petSpecies).map(([species, label]) => `<label class="species-choice">
      <input type="radio" name="species" value="${species}" ${species === selected ? 'checked' : ''}>
      <span aria-hidden="true">${petCanvas(habitatPalette, 1, false, true, species)}</span><span>${label}</span>
    </label>`).join('');
    return `<fieldset class="species-picker"><legend>选择宠物</legend><div class="species-options">${choices}</div></fieldset>`;
  }

  function adoptForm() {
    return sheet('领养宠物', `<form data-form="adopt">
      ${usesGlass ? `${speciesPicker()}
        ${habitatPicker('garden')}
        <div class="habitat-choice-preview">${petCanvas(habitatPalette)}</div>` : `<div class="adopt-avatar">${petCanvas(theme, 1, false, true)}</div>`}
      <p class="sheet-note">${usesGlass ? '它有 3 格血。达成每日目标后，训练每分钟可获得 1 XP。确认漏练会扣 1 格血。' : '它有 3 格血。完成计划会成长，确认漏练会扣 1 格血。'}</p>
      ${field('宠物名字', '<input name="name" value="团团" maxlength="12" required>')}
      <button type="submit" class="primary full">确认领养</button>
    </form>`);
  }

  function habitatForm() {
    const { species, habitat, level } = petDetails(current());
    return sheet('更换背景', `<form data-form="habitat-settings">
      ${habitatPicker(habitat)}
      <div class="habitat-choice-preview">${petCanvas(habitatPalette, level, false, false, species, habitat)}</div>
      <button type="submit" class="primary full">确认背景</button>
    </form>`);
  }

  function matchForm(record, targetId, merge = false) {
    const choices = state.plans.filter(plan => eligible(state, plan, record));
    return sheet('确认关联', `<p class="sheet-note">${escape(record.title)} · ${dateLabel(record.date)} ${record.start} · ${record.minutes} 分钟</p><form data-form="match">
      ${choices.length ? `<fieldset><legend>匹配到哪项训练？</legend>${choices.map((plan, index) => `<label class="choice"><input type="radio" name="plan" value="${plan.id}"
      ${plan.id === targetId || (!choices.some(entry => entry.id === targetId) && index === 0) ? 'checked' : ''}><span><strong>${escape(plan.title)}</strong><small>${dateLabel(plan.date)} · 目标 ${plan.minutes} 分钟</small></span>${chip(status(state, plan))}</label>`).join('')}
      <label class="choice"><input type="radio" name="plan" value=""><span>仅保存到训练历史</span></label></fieldset>` :
      `<p class="sheet-note">${merge && record.plan ? '已匹配过计划，合并后保留原结算。' : '这条记录目前没有可关联的计划，可以保存到训练历史。'}</p>`}
      <button class="primary full" type="submit">${choices.length ? '确认并保存' : '保存记录'}</button></form>`);
  }

  function deviceList(targetId) {
    const devices = [
      { id: 'device-old', date: '2026-11-12', start: '18:30', minutes: 25, title: '户外跑步' },
      { id: 'device-grace', date: '2026-11-15', start: '18:30', minutes: 18, title: '舒展拉伸' },
      { id: 'device-today', date: '2026-11-16', start: '18:30', minutes: 20, title: '户外跑步' }
    ];
    const target = getPlan(targetId);
    if (target) devices.sort((a, b) => Number(b.date === target.date) - Number(a.date === target.date));
    return sheet('导入设备记录', '<p class="sheet-note">Apple 健康演示数据。选择一条训练，再确认要匹配的计划。</p>' +
      devices.map(item => {
        const imported = state.records.some(record => record.deviceId === item.id);
        const { id, ...training } = item;
        const data = JSON.stringify({ ...training, deviceId: id, source: 'device' });
        return button(`<span class="activity">${icon('watch')}</span><span class="list-copy"><strong>${item.title}</strong><small>${dateLabel(item.date)} ${item.start}</small></span>
          <span class="list-end">${imported ? '已导入' : item.minutes + ' 分钟'}</span>${icon('arrow', 14)}`, 'device', 'list-row', data);
      }).join(''));
  }

  function overlayHtml() {
    const plan = getPlan(overlay.value);
    switch (overlay.type) {
      case 'detail': return detail(plan);
      case 'pick-week': return weekPicker(overlay.date);
      case 'manual': return trainingForm(plan);
      case 'new': return dateForm();
      case 'reschedule': return dateForm(plan);
      case 'edit-plan': return dateForm(plan, true);
      case 'edit-record': return trainingForm(getRecord(overlay.value), true);
      case 'delete-plan':
      case 'delete-record': {
        const isPlan = overlay.type === 'delete-plan';
        const item = isPlan ? plan : getRecord(overlay.value);
        const note = isPlan ? '关联的训练记录会保留。这项计划造成的扣血会撤销。' :
          `删除后会重新计算宠物经验。${item.plan ? '关联计划也会重新结算。' : ''}`;
        return sheet(isPlan ? '删除训练计划？' : '删除训练记录？', `<p class="sheet-note">「${escape(item.title)}」将被删除。</p>
          ${note ? `<p class="sheet-note">${note}</p>` : ''}<div class="sheet-buttons">
            ${button('取消', 'close', 'secondary')}${button('确认删除', 'confirm-delete', 'primary destructive')}
          </div>`);
      }
      case 'import': return deviceList(overlay.value);
      case 'match': return matchForm(overlay.record, overlay.value, overlay.merge);
      case 'duplicate': return sheet('可能是同一场训练', `<p class="sheet-note">有同日期、同开始时间和时长的手填记录。</p><div class="sheet-buttons">
        ${button('合并记录', 'merge', 'primary')}${button('是另一场训练', 'separate', 'secondary')}</div>`);
      case 'record': {
        const record = getRecord(overlay.value);
        return sheet(escape(record.title), `<dl><div><dt>开始时间</dt><dd>${dateLabel(record.date)} ${record.start}</dd></div>
          <div><dt>实际时长</dt><dd>${record.minutes} 分钟</dd></div><div><dt>来源</dt><dd>${record.source === 'device' ? '设备' : '手动'}${record.deviceId && record.source === 'manual' ? ' + 设备合并' : ''}</dd></div>
          <div><dt>计划状态</dt><dd>${record.plan ? '已完成 · ' + escape(getPlan(record.plan)?.title ?? '') : '未关联'}</dd></div></dl>
          ${record.plan ? button('查看关联计划', 'detail', 'secondary full', record.plan) : button('关联计划', 'link', 'secondary full', record.id)}`);
      }
      case 'settings': return sheet('训练提醒', `<button type="button" class="switch-row" data-action="reminders" role="switch" aria-checked="${state.reminders}">
        <span><strong>开启提醒</strong><small>训练当天与进入待补记时提醒</small></span><i class="switch"></i></button>
        <p class="sheet-note">时间均为北京时间。首页会持续显示训练状态与截止时间。</p>`);
      case 'adopt': return adoptForm();
      case 'habitat-settings': return habitatForm();
      case 'restore': {
        const pet = state.pets.find(entry => entry.id === overlay.value);
        return sheet('恢复 ' + escape(pet.name), `<p class="sheet-note">更正后剩 ${health(state, pet.id)} 格血。恢复后双方的血量和成长都会保留。</p><div class="sheet-buttons">
          ${button('确认恢复', 'confirm-restore', 'primary', pet.id)}${button(state.active ? '继续养当前宠物' : '稍后决定', 'close', 'secondary')}</div>`);
      }
      case 'health': return sheet('Apple 健康', `<p class="sheet-note">可导入训练类型、实际开始时间和时长。也可以用手动记录。</p><div class="sheet-buttons">
        ${button('使用演示数据', 'onboard-finish', 'primary')}${button('暂时跳过', 'onboard-finish', 'secondary')}</div>`);
      default: return '';
    }
  }

  const screens = { home, week: calendar, log: logged, pet: petScreen };

  function positionHeatmap(offset) {
    const heatmap = scrollArea.querySelector('.heat-weeks');
    if (heatmap) heatmap.scrollLeft = offset ?? heatmap.scrollWidth;
  }

  function render({ preserve = false, focusSheet = false } = {}) {
    const offset = preserve ? scrollArea.scrollTop : 0;
    const heatmapOffset = preserve ? scrollArea.querySelector('.heat-weeks')?.scrollLeft : undefined;
    scrollArea.innerHTML = isPetHabitat() ? '' : screens[tab]();
    positionHeatmap(heatmapOffset);
    scrollArea.inert = showHabitat || isPetHabitat() || Boolean(overlay) || Boolean(onboarding?.active);
    tabbar.inert = Boolean(overlay) || showHabitat || Boolean(onboarding?.active);
    const index = tabButtons.findIndex(button => button.dataset.value === tab);
    tabButtons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    tabbar.style.setProperty('--tab-index', index);
    layers.innerHTML = `${notice ? `<div class="toast" role="status">${notice}</div>` : ''}${overlay ? overlayHtml() : ''}`;
    outlet.querySelectorAll('canvas').forEach(drawScene);
    scrollArea.scrollTop = offset;
    renderHabitat(preserve);
    if (focusSheet) outlet.querySelector('.sheet button')?.focus({ preventScroll: true });
  }

  function animateSheet(origin) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sheetPanel = layers.querySelector('.sheet');
    const sheetBounds = sheetPanel.getBoundingClientRect();
    const startsInButton = origin && origin.width > 0 && sheetBounds.width > 0;
    const dx = startsInButton ? origin.left + origin.width / 2 - sheetBounds.left - sheetBounds.width / 2 : 0;
    const dy = startsInButton ? origin.top + origin.height / 2 - sheetBounds.top - sheetBounds.height / 2 : 32;
    const startScale = startsInButton ? Math.min(0.88, Math.max(0.28, origin.width / sheetBounds.width)) : 0.98;
    sheetPanel.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${startScale})`, borderRadius: '36px', opacity: 0.3 },
      { transform: 'translate(0, 0) scale(1)', borderRadius: '30px', opacity: 1 }
    ], { duration: 330, easing: 'cubic-bezier(.2,.78,.24,1)' });
  }

  function open(type, value = '', extra = {}) {
    const trigger = clickTrigger ?? document.activeElement;
    const opening = !overlay;
    if (opening && trigger?.dataset.action) {
      const { action, value: key } = trigger.dataset;
      restoreFocus = { action, value: key };
    }
    const origin = usesGlass && opening && trigger?.dataset.action ? trigger.getBoundingClientRect() : null;
    overlay = { type, value, ...extra };
    render({ preserve: true, focusSheet: true });
    if (usesGlass && opening) animateSheet(origin);
  }

  function close() {
    const focus = restoreFocus;
    overlay = null;
    restoreFocus = null;
    render({ preserve: true });
    if (focus) {
      const target = [...phoneScreen.querySelectorAll('[data-action]')].find(button =>
        button.dataset.action === focus.action && button.dataset.value === focus.value
      );
      const accessibleTarget = target?.closest('.swipe-workout')?.querySelector('.list-row') ?? target ?? scrollArea.querySelector('.app-head h2');
      if (accessibleTarget?.tagName === 'H2') accessibleTarget.tabIndex = -1;
      accessibleTarget?.focus({ preventScroll: true });
    }
  }

  function feedback(message) {
    notice = message;
    close();
    const previous = message;
    window.setTimeout(() => {
      if (notice !== previous) return;
      notice = '';
      outlet.querySelector('.toast')?.remove();
    }, 3000);
  }

  function load(nextScenario) {
    onboarding?.stop();
    if (usesGlass && !onboarding && nextScenario === 'onboarding') nextScenario = 'standard';
    scenario = nextScenario;
    state = demoState(nextScenario === 'no-plan' ? 'standard' : nextScenario);
    if (nextScenario === 'no-plan') {
      state.now = bj('2026-11-17', '20:00');
      refresh(state);
    }
    week = monday(today());
    selectedDay = null;
    logFilter = 'all';
    logDay = null;
    tab = nextScenario === 'death' || (nextScenario === 'onboarding' && !onboarding) ? 'pet' : nextScenario === 'no-plan' ? 'home' : initial;
    showHabitat = Boolean(habitatEntry) && nextScenario === 'standard' && tab === 'home';
    overlay = null;
    restoreFocus = null;
    notice = '';
    if (nextScenario === 'onboarding' && onboarding) onboarding.start();
    render();
    if (nextScenario === 'onboarding' && !onboarding && initial === 'home') open('adopt');
  }

  function selectDevice(record, target) {
    const existing = state.records.find(entry => entry.deviceId === record.deviceId);
    if (existing) {
      open('record', existing.id);
    } else if (similarRecord(state, record)) {
      open('duplicate', target, { record });
    } else {
      open('match', target, { record });
    }
  }

  function updateLogSelection() {
    if (logDay && !state.records.some(record => record.date === logDay && (logFilter === 'all' || logFilter === record.source))) logDay = null;
  }

  const handle = {
    tab(value) {
      if (tab !== value) showHabitat = false;
      tab = value;
      notice = '';
      render();
      tabbar.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    },
    habitat() { setHabitat(true); },
    detail: value => open('detail', value),
    manual: value => open('manual', value),
    reschedule: value => open('reschedule', value),
    record: value => open('record', value),
    'edit-plan': value => open('edit-plan', value),
    'edit-record': value => open('edit-record', value),
    'delete-plan': value => open('delete-plan', value),
    'delete-record': value => open('delete-record', value),
    'confirm-delete'() {
      if (overlay.type === 'delete-plan' && deletePlan(state, overlay.value)) feedback('已删除训练计划');
      if (overlay?.type === 'delete-record' && deleteRecord(state, overlay.value)) {
        updateLogSelection();
        feedback('已删除训练记录');
      }
    },
    import: value => open('import', value),
    restore: value => open('restore', value),
    new: () => open('new'),
    settings: () => open('settings'),
    adopt: () => open('adopt'),
    'habitat-settings': () => open('habitat-settings'),
    link: value => open('match', '', { record: getRecord(value) }),
    close,
    'pick-project'(value) {
      const input = layers.querySelector('input[name="title"]');
      input.value = value;
      input.form.querySelector('.project-history').innerHTML = projectSuggestions(value);
      input.focus({ preventScroll: true });
    },
    'pick-week'() {
      const date = selectedDay ?? (week === monday(today()) ? today() : week);
      open('pick-week', '', { date });
    },
    'pick-date'(date) {
      overlay.date = date;
      render({ preserve: true });
      layers.querySelector('.picker-day[aria-pressed="true"]').focus({ preventScroll: true });
    },
    previous() { week = dayPlus(week, -7); selectedDay = null; render(); outlet.querySelector('[data-action="previous"]').focus(); },
    next() { week = dayPlus(week, 7); selectedDay = null; render(); outlet.querySelector('[data-action="next"]').focus(); },
    day(value) { selectedDay = value === selectedDay ? null : (value || null); render({ preserve: true }); },
    filter(value) {
      logFilter = value;
      logDay = null;
      render({ preserve: true });
      outlet.querySelector('[data-action="filter"][aria-pressed="true"]').focus({ preventScroll: true });
    },
    'log-day'(value) {
      const previous = value || logDay;
      logDay = value && logDay !== value ? value : null;
      render({ preserve: true });
      outlet.querySelector(`[data-action="log-day"][data-value="${previous}"]`)?.focus({ preventScroll: true });
    },
    reminders() {
      state.reminders = !state.reminders;
      const control = layers.querySelector('[role="switch"]');
      control.setAttribute('aria-checked', String(state.reminders));
      control.focus({ preventScroll: true });
    },
    device(value) { selectDevice(JSON.parse(value), overlay.value); },
    merge() { open('match', overlay.value, { record: { ...similarRecord(state, overlay.record), deviceId: overlay.record.deviceId }, incoming: overlay.record, merge: true }); },
    separate() { open('match', overlay.value, { record: overlay.record }); },
    'confirm-restore'(value) {
      if (restore(state, value)) feedback('已恢复原宠物');
    },
    'onboard-finish'() { scenario = 'standard'; tab = 'home'; feedback('可以开始训练了'); }
  };

  if (habitatEntry) bindHabitatGesture({
    screen: phoneScreen, habitatEntry, scrollArea,
    getMode: () => !overlay && !onboarding?.active && tab === 'home' ? showHabitat : null,
    setHabitat
  });
  if (usesGlass) bindWorkoutSwipe(scrollArea);

  function handleClick(event) {
    const control = event.target.closest('[data-action]');
    if (control) {
      clickTrigger = control;
      handle[control.dataset.action]?.(control.dataset.value);
      clickTrigger = null;
    } else if (event.target.classList.contains('shade')) close();
  }
  outlet.addEventListener('click', handleClick);
  habitatEntry?.addEventListener('click', handleClick);
  outlet.addEventListener('keydown', event => {
    if (!overlay) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
    if (event.key !== 'Tab') return;
    const items = [...outlet.querySelectorAll('.sheet :is(button, input, select):not(:disabled)')];
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault();
      items[0]?.focus();
    }
  });
  outlet.addEventListener('input', event => {
    const input = event.target;
    if (input.name !== 'title') return;
    const history = input.form?.querySelector('.project-history');
    if (history) history.innerHTML = projectSuggestions(input.value);
  });
  outlet.addEventListener('change', event => {
    const input = event.target;
    const preview = input.form?.querySelector('.habitat-choice-preview canvas');
    if (preview && (input.name === 'species' || input.name === 'habitat')) {
      preview.dataset[input.name] = input.value;
      drawScene(preview);
      return;
    }
    const picker = input.closest('.week-picker');
    if (!picker || input.tagName !== 'SELECT') return;
    const month = picker.elements.year.value + '-' + picker.elements.month.value;
    const day = Math.min(Number(overlay.date.slice(8)), daysInMonth(month));
    overlay.date = month + '-' + String(day).padStart(2, '0');
    render({ preserve: true });
    layers.querySelector(`.week-picker select[name="${input.name}"]`)?.focus({ preventScroll: true });
  });
  outlet.addEventListener('submit', event => {
    const form = event.target;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (Object.hasOwn(data, 'title')) {
      data.title = data.title.trim();
      if (!data.title) {
        form.querySelector('.form-error').textContent = '请输入训练项目。';
        form.elements.title.focus();
        return;
      }
    }
    switch (form.dataset.form) {
      case 'pick-week':
        selectedDay = overlay.date;
        week = monday(selectedDay);
        close();
        break;
      case 'manual': {
        const record = { ...data, minutes: Number(data.minutes), source: 'manual' };
        const end = bj(record.date, record.start) + record.minutes * 60_000;
        if (!Number.isFinite(end) || end > state.now) {
          form.querySelector('.form-error').textContent = '请填写已结束的训练。';
          return;
        }
        if (!usesGlass) {
          open('match', overlay.value, { record });
          break;
        }
        const plan = getPlan(overlay.value);
        const saved = saveRecord(state, record);
        rememberProject(saved.title);
        if (plan && match(state, plan, saved)) feedback('训练计划已完成');
        else feedback(plan ? '已保存训练记录，计划尚未完成' : '训练记录已保存');
        break;
      }
      case 'match': {
        const { record, merge, incoming } = overlay;
        const saved = record.id && !merge ? record : saveRecord(state, incoming ?? record, merge);
        if (!record.id && record.source === 'manual') rememberProject(saved.title);
        const plan = getPlan(data.plan);
        const previousStatus = plan && status(state, plan);
        const updated = plan && match(state, plan, saved);
        feedback(updated ? (previousStatus === 'missed' ? '已更正计划结算' : '训练计划已完成') : '训练记录已保存');
        break;
      }
      case 'reschedule': {
        if (!changeDate(state, getPlan(overlay.value), data.date)) {
          form.querySelector('.form-error').textContent = '请选择原计划同一周内的有效日期。';
          return;
        }
        feedback('已改期，截止时间已更新');
        break;
      }
      case 'edit-plan': {
        const plan = getPlan(overlay.value);
        const originalDate = plan.date;
        if (!editPlan(state, plan, { ...data, minutes: Number(data.minutes) })) {
          form.querySelector('.form-error').textContent = '请选择原计划同一周内的有效日期，并核对目标时长。';
          return;
        }
        if (selectedDay === originalDate) selectedDay = plan.date;
        rememberProject(plan.title);
        feedback('已更新训练计划');
        break;
      }
      case 'edit-record': {
        const record = getRecord(overlay.value);
        if (!editRecord(state, record, { ...data, minutes: Number(data.minutes) })) {
          form.querySelector('.form-error').textContent = '请填写已结束的训练，并核对日期、时间和时长。';
          return;
        }
        rememberProject(record.title);
        updateLogSelection();
        feedback('已更新训练记录');
        break;
      }
      case 'new': {
        const plan = { ...data, minutes: Number(data.minutes), id: 'plan-' + ++state.serial, effective: state.now };
        state.plans.push(plan);
        rememberProject(plan.title);
        week = monday(plan.date);
        selectedDay = null;
        if (scenario === 'onboarding') open('health');
        else { tab = 'week'; feedback('已保存训练计划'); }
        break;
      }
      case 'adopt': {
        const name = data.name.trim();
        if (!name) {
          form.elements.name.setCustomValidity('请输入宠物的名字。');
          form.elements.name.reportValidity();
          form.elements.name.setCustomValidity('');
          return;
        }
        if (!adopt(state, name, data.species, data.habitat)) return;
        if (scenario === 'onboarding') open('new');
        else feedback('已领养 ' + escape(name));
        break;
      }
      case 'habitat-settings':
        if (setPetHabitat(state, data.habitat)) feedback('已更换背景');
        break;
      default: break;
    }
  });

  render();
  container.append(phone);
  positionHeatmap();
  return { load, advance(date) {
    const time = bj(...clocks(date));
    if (!Number.isFinite(time) || time < state.now) return false;
    state.now = time;
    if (logDay && logDay < heatmapStart(today())) logDay = null;
    refresh(state);
    overlay = null;
    restoreFocus = null;
    render();
    return true;
  } };
}

const phones = [...root.querySelectorAll('[data-phone]')].map(createPhone);

const lead = phones.find((_, index) => root.querySelectorAll('[data-phone]')[index].dataset.phone === 'home');
const demoScene = document.querySelector('#demo-scene');
const demoTime = document.querySelector('#demo-time');
const demoHint = document.querySelector('#demo-feedback');

demoScene.addEventListener('change', () => {
  phones.forEach(app => app.load(demoScene.value));
  demoTime.value = demoScene.value === 'no-plan' ? '2026-11-17T20:00' : DEMO_AT;
  demoHint.textContent = '';
});
document.querySelector('#reset').addEventListener('click', () => {
  demoScene.value = 'standard';
  demoScene.dispatchEvent(new Event('change'));
  demoHint.textContent = '已重置演示。';
});
document.querySelector('#advance').addEventListener('click', () => {
  if (!lead.advance(demoTime.value)) {
    demoHint.textContent = '请选择当前演示时间或之后的时间。';
    return;
  }
  phones.filter(app => app !== lead).forEach(app => app.advance(demoTime.value));
  demoHint.textContent = '已按北京时间更新结算。';
});
