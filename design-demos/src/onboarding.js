const onboardingColors = ['#fa8198', '#ffa258', '#ffda49', '#91d568', '#57cfbf', '#7cafff', '#c492f5'];
const onboardingColorInterval = 2000;
const onboardingProfileKey = 'pixel-fitness.new-user-profile';
const dailyGoalWarning = '每日目标超过 2 小时。请留出休息时间，避免过度训练。';

function readOnboardingProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(onboardingProfileKey));
    const minutes = Number(profile?.minutes);
    if (Number.isInteger(minutes) && minutes >= MIN_DAILY_GOAL && minutes <= 1440 &&
      typeof profile.name === 'string' && profile.name.trim() && Object.hasOwn(petSpecies, profile.species) &&
      Object.hasOwn(habitatStyles, profile.habitat)) return profile;
  } catch {
    // The offline prototype can still run when local storage is unavailable.
  }
  return null;
}

function storeOnboardingProfile(profile) {
  try {
    if (profile) localStorage.setItem(onboardingProfileKey, JSON.stringify(profile));
    else localStorage.removeItem(onboardingProfileKey);
  } catch {
    // The current session can keep using the completed setup.
  }
}

function createOnboarding(screen, { palette, habitatPicker, finish }) {
  const view = document.createElement('section');
  view.className = 'onboarding';
  view.hidden = true;
  view.setAttribute('aria-label', '新用户引导');
  screen.append(view);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const easing = getComputedStyle(document.body).getPropertyValue('--glass-ease').trim();
  let draft;
  let step;
  let panel;
  let leaving;
  let exit;
  let color;
  let timer;

  function updateWarning() {
    const warning = panel.querySelector('.onboarding-warning');
    if (!warning) return;
    const minutes = Number(draft.minutes);
    warning.textContent = draft.minutes && minutes < MIN_DAILY_GOAL ? `每日目标至少 ${MIN_DAILY_GOAL} 分钟。` :
      minutes > 120 ? dailyGoalWarning : '';
  }

  function updatePetPreview() {
    const preview = panel.querySelector('.onboarding-pet-preview');
    preview.dataset.species = draft.species;
    preview.parentElement.setAttribute('aria-label', `摸摸${petSpecies[draft.species]}`);
    drawScene(preview);
  }

  function show(index) {
    const previous = panel;
    const direction = Math.sign(index - step);
    step = index;
    panel = document.createElement('div');
    panel.className = 'onboarding-step';
    panel.dataset.step = ['goal', 'pet', 'habitat'][index];
    const titles = ['设定每日训练目标', '领养宠物', '选择栖息地'];
    const contents = [
      () => `<div class="onboarding-goal"><label class="goal-entry">
        <input type="number" name="minutes" min="${MIN_DAILY_GOAL}" max="1440" step="1" inputmode="numeric" value="${escape(draft.minutes)}" aria-label="每日目标分钟数" aria-describedby="onboarding-warning" required><span>分钟</span>
      </label><p class="onboarding-warning" id="onboarding-warning" role="status"></p></div>`,
      () => `<button type="button" class="onboarding-pet-touch"><canvas class="onboarding-pet-preview" width="${petAvatarSize}" height="${petAvatarSize}" data-avatar data-palette="${palette}" aria-hidden="true"></canvas></button>
        <fieldset class="onboarding-species" aria-label="宠物种类">${Object.entries(petSpecies).map(([species, label]) => `<label class="onboarding-choice">
          <input type="radio" name="species" value="${species}" ${species === draft.species ? 'checked' : ''}>
          <span class="onboarding-choice-icon" aria-hidden="true">${petCanvas(palette, 1, false, true, species)}</span><span>${label}</span></label>`).join('')}
        </fieldset>${field('宠物名字', `<input name="name" value="${escape(draft.name)}" maxlength="12" required>`)}`,
      () => habitatPicker(draft.habitat)
    ];
    const fullScene = index === 2 ? `<canvas class="onboarding-habitat-art" width="88" height="192" data-portrait="onboarding" data-centered-pet
      data-palette="${palette}" data-species="${draft.species}" data-habitat="${draft.habitat}" role="img" aria-label="栖息地预览"></canvas>
      <button type="button" class="scene-pet-touch" aria-label="摸摸${petSpecies[draft.species]}"></button>` : '';
    panel.innerHTML = `${fullScene}<form class="onboarding-form">
      <header class="onboarding-head">
        <h2 tabindex="-1">${titles[index]}</h2>
      </header>
      <div class="onboarding-content">${contents[index]()}</div>
      <div class="onboarding-actions">${index ? '<button type="button" data-back>返回</button>' : ''}
        <button type="submit">${index === 2 ? '开始训练' : '继续'} ${icon('arrow', 16)}</button>
      </div>
    </form>`;
    leaving?.remove();
    leaving = null;
    if (previous) {
      previous.inert = true;
      previous.querySelector('[id="onboarding-warning"]')?.removeAttribute('id');
      if (motion.matches) previous.remove();
      else {
        leaving = previous;
        previous.getAnimations().forEach(animation => animation.cancel());
        const distance = previous.dataset.step === 'habitat' ? 0 : -direction * 20;
        previous.animate([
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: `translateX(${distance}px)` }
        ], { duration: 200, easing }).finished.then(() => {
          previous.remove();
          if (leaving === previous) leaving = null;
        }, () => {});
      }
    }
    view.append(panel);
    if (index === 1) {
      updatePetPreview();
      const preview = panel.querySelector('.onboarding-pet-preview');
      animatePet(preview, preview.parentElement);
      panel.querySelectorAll('.onboarding-choice .avatar').forEach(canvas => drawScene(canvas));
    }
    if (index === 2) {
      const preview = panel.querySelector('.onboarding-habitat-art');
      drawScene(preview);
      animatePet(preview, panel.querySelector('.scene-pet-touch'));
    }
    if (previous && !motion.matches) {
      const distance = index === 2 ? 0 : direction * 28;
      panel.animate([
        { opacity: 0, transform: `translateX(${distance}px)` },
        { opacity: 1, transform: 'none' }
      ], { duration: 320, easing });
    }
    updateWarning();
    panel.querySelector('h2').focus({ preventScroll: true });
  }

  view.addEventListener('input', event => {
    if (!panel?.contains(event.target) || view.inert) return;
    const input = event.target;
    draft[input.name] = input.value;
    input.setCustomValidity('');
    updateWarning();
  });
  view.addEventListener('change', event => {
    if (!panel?.contains(event.target) || view.inert) return;
    const input = event.target;
    draft[input.name] = input.value;
    if (input.name === 'species') updatePetPreview();
    if (input.name === 'habitat') {
      const preview = panel.querySelector('.onboarding-habitat-art');
      preview.dataset.habitat = input.value;
      drawScene(preview);
    }
    updateWarning();
  });
  view.addEventListener('click', event => {
    if (panel?.contains(event.target) && !view.inert && event.target.closest('[data-back]')) show(step - 1);
  });
  view.addEventListener('submit', event => {
    event.preventDefault();
    if (!panel?.contains(event.target) || view.inert) return;
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

  function hide() {
    view.hidden = true;
    view.replaceChildren();
    panel = leaving = null;
  }

  function stop({ animate = false } = {}) {
    clearInterval(timer);
    exit?.cancel();
    exit = null;
    view.inert = true;
    if (!animate || view.hidden || motion.matches) {
      hide();
      return;
    }
    const fade = view.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing, fill: 'forwards' });
    exit = fade;
    fade.finished.then(() => {
      if (exit !== fade) return;
      hide();
      fade.cancel();
      exit = null;
    }, () => {});
  }

  return {
    get active() { return !view.hidden && !view.inert; },
    start() {
      stop();
      draft = { minutes: String(DEFAULT_DAILY_GOAL), name: '团团', species: 'cat', habitat: 'garden' };
      color = 0;
      view.style.backgroundColor = onboardingColors[color];
      view.hidden = false;
      view.inert = false;
      show(0);
      timer = setInterval(() => {
        if (document.hidden || motion.matches) return;
        color = (color + 1) % onboardingColors.length;
        view.style.backgroundColor = onboardingColors[color];
      }, onboardingColorInterval);
    },
    stop
  };
}
