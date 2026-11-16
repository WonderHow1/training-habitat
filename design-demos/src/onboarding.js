const onboardingColors = ['#e9f2ff', '#e6f3e8', '#f5eaf9', '#fbefdf', '#fae9eb'];
const dailyGoalWarning = '每日目标超过 2 小时。请留出休息时间，避免过度训练。';

function createOnboarding(screen, { palette, speciesPicker, habitatPicker, finish, cancel }) {
  const view = document.createElement('section');
  view.className = 'onboarding';
  view.hidden = true;
  view.setAttribute('aria-label', '新用户引导');
  screen.append(view);
  let draft;
  let step;
  let color = -1;
  let timer;
  let canExit = false;

  function changeColor() {
    const length = onboardingColors.length;
    color = color < 0 ? Math.floor(Math.random() * length) : (color + 1 + Math.floor(Math.random() * (length - 1))) % length;
    view.style.backgroundColor = onboardingColors[color];
  }

  function updateWarning() {
    const warning = view.querySelector('.onboarding-warning');
    if (!warning) return;
    const minutes = Number(draft.minutes);
    warning.textContent = draft.minutes && minutes < MIN_DAILY_GOAL ? `每日目标至少 ${MIN_DAILY_GOAL} 分钟。` :
      minutes > 120 ? dailyGoalWarning : '';
  }

  function show(index) {
    step = index;
    changeColor();
    const titles = ['设定每日训练目标', '领养宠物', '选择栖息地'];
    const contents = [
      () => `<label class="onboarding-goal"><span class="goal-caption">每日目标</span><span class="goal-entry">
        <input type="number" name="minutes" min="${MIN_DAILY_GOAL}" max="1440" step="1" inputmode="numeric" value="${escape(draft.minutes)}" required aria-describedby="onboarding-warning"><span>分钟</span>
      </span></label><p class="onboarding-warning" id="onboarding-warning" role="status"></p>`,
      () => speciesPicker(draft.species) + field('宠物名字', `<input name="name" value="${escape(draft.name)}" maxlength="12" required>`),
      () => `<div class="onboarding-preview habitat-choice-preview">${petCanvas(palette, 1, false, false, draft.species, draft.habitat)}</div>` + habitatPicker(draft.habitat)
    ];
    view.innerHTML = `<form class="onboarding-form">
      <header class="onboarding-head">
        ${canExit ? `<button type="button" class="round onboarding-exit" data-exit aria-label="退出新用户引导">${icon('close')}</button>` : ''}
        <progress max="3" value="${index + 1}" aria-label="引导进度"></progress>
        <h2 tabindex="-1">${titles[index]}</h2>
      </header>
      <div class="onboarding-content">${contents[index]()}</div>
      <div class="onboarding-actions">${index ? '<button type="button" class="secondary" data-back>返回</button>' : ''}
        <button type="submit" class="primary">${index === 2 ? '开始训练' : '继续'}</button>
      </div>
    </form>`;
    view.scrollTop = 0;
    view.querySelectorAll('canvas').forEach(drawScene);
    updateWarning();
    view.querySelector('h2').focus({ preventScroll: true });
  }

  view.addEventListener('input', event => {
    const input = event.target;
    draft[input.name] = input.value;
    input.setCustomValidity('');
    updateWarning();
  });
  view.addEventListener('change', event => {
    const input = event.target;
    draft[input.name] = input.value;
    if (input.name === 'habitat') {
      const preview = view.querySelector('.onboarding-preview canvas');
      preview.dataset.habitat = input.value;
      drawScene(preview);
    }
    updateWarning();
  });
  view.addEventListener('click', event => {
    if (event.target.closest('[data-back]')) show(step - 1);
    if (event.target.closest('[data-exit]')) cancel();
  });
  view.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    Object.assign(draft, data);
    if (step === 1 && !draft.name.trim()) {
      const input = event.target.elements.name;
      input.setCustomValidity('请输入宠物的名字。');
      input.reportValidity();
      return;
    }
    if (step === 2) finish(draft);
    else show(step + 1);
  });

  function stop() {
    clearInterval(timer);
    view.hidden = true;
    view.innerHTML = '';
  }

  return {
    get active() { return !view.hidden; },
    start(options = {}) {
      stop();
      canExit = options.canExit ?? false;
      draft = { minutes: String(DEFAULT_DAILY_GOAL), name: '团团', species: 'cat', habitat: 'garden' };
      view.hidden = false;
      show(0);
      view.scrollIntoView({ block: 'start', inline: 'nearest' });
      timer = setInterval(() => {
        if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) changeColor();
      }, 7000);
    },
    stop
  };
}
