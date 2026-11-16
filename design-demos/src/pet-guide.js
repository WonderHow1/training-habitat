function bindPetGuideView(view, species) {
  const carousel = view.querySelector('.pet-guide-carousel');
  const slides = [...carousel.querySelectorAll('.pet-guide-portrait')];
  const navigation = view.querySelector('.pet-guide-navigation');
  const name = navigation.querySelector('strong');
  const previous = navigation.querySelector('[data-step="-1"]');
  const next = navigation.querySelector('[data-step="1"]');
  const animated = new WeakSet();
  const last = slides.length - 1;
  const clamp = index => Math.max(0, Math.min(last, index));
  let active = -1;
  let drag;
  let suppressClick = false;

  function select(index) {
    if (active === index) return;
    const old = slides[active];
    const selected = slides[index];
    const keepFocus = old === document.activeElement;
    active = index;
    selected.tabIndex = 0;
    selected.removeAttribute('aria-hidden');
    if (keepFocus) selected.focus({ preventScroll: true });
    if (old) {
      old.tabIndex = -1;
      old.setAttribute('aria-hidden', 'true');
    }
    name.textContent = petSpecies[selected.dataset.species];
    previous.disabled = index === 0;
    next.disabled = index === last;
    if (!animated.has(selected)) {
      animatePet(selected.querySelector('canvas'), selected);
      animated.add(selected);
    }
  }

  function go(index) {
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    carousel.scrollTo({ left: clamp(index) * carousel.clientWidth, behavior });
  }

  const initial = clamp(slides.findIndex(slide => slide.dataset.species === species));
  carousel.scrollLeft = initial * carousel.clientWidth;
  select(initial);
  carousel.addEventListener('scroll', () => select(clamp(Math.round(carousel.scrollLeft / carousel.clientWidth))), { passive: true });
  previous.addEventListener('click', () => go(active - 1));
  next.addEventListener('click', () => go(active + 1));
  view.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    go(active + (event.key === 'ArrowLeft' ? -1 : 1));
  });

  // Touch and trackpad scroll natively. Mouse dragging shares the same snap points.
  carousel.addEventListener('pointerdown', event => {
    suppressClick = false;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { pointer: event.pointerId, x: event.clientX, offset: carousel.scrollLeft, index: active, moved: false };
  });
  carousel.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    const dx = drag.x - event.clientX;
    if (!drag.moved) {
      if (Math.abs(dx) < 8) return;
      drag.moved = true;
      carousel.setAttribute('data-dragging', '');
      carousel.setPointerCapture(event.pointerId);
    }
    carousel.scrollLeft = drag.offset + dx;
  });
  function finishDrag(event) {
    if (drag?.pointer !== event.pointerId) return;
    const { moved, index, x } = drag;
    drag = null;
    if (!moved) return;
    suppressClick = true;
    carousel.removeAttribute('data-dragging');
    const dx = x - event.clientX;
    go(index + (event.type === 'pointerup' && Math.abs(dx) >= 32 ? Math.sign(dx) : 0));
  }
  carousel.addEventListener('pointerup', finishDrag);
  carousel.addEventListener('pointercancel', finishDrag);
  carousel.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  }, true);
}
