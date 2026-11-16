function bindHabitatGesture({ screen, habitatEntry, scrollArea, getMode, setHabitat }) {
  let drag = null;
  let wheel = null;
  const switchDistance = 72;

  function paint(distance, fromHabitat) {
    const travel = Math.min(245, screen.clientHeight * 0.29);
    const fraction = Math.min(1, distance / travel);
    screen.setAttribute('data-habitat-dragging', '');
    screen.style.setProperty('--gesture-progress', fromHabitat ? 1 - fraction : fraction);
  }

  function settle({ distance, fromHabitat }, committed) {
    // Commit the frame at the finger position before letting the rest of the transition ease.
    if (screen.hasAttribute('data-habitat-dragging')) void getComputedStyle(habitatEntry).transform;
    screen.removeAttribute('data-habitat-dragging');
    screen.style.removeProperty('--gesture-progress');
    if (committed && distance >= switchDistance && getMode() === fromHabitat) {
      setHabitat(!fromHabitat);
    }
  }

  function finish(event) {
    if (!drag) return;
    settle(drag, event.type === 'touchend');
    drag = null;
  }

  screen.addEventListener('touchstart', event => {
    if (wheel) {
      clearTimeout(wheel.timer);
      settle(wheel, false);
      wheel = null;
    }
    if (event.touches.length !== 1) {
      finish(event);
      return;
    }
    const fromHabitat = getMode();
    const surface = fromHabitat ? habitatEntry : scrollArea;
    if (fromHabitat === null || !surface.contains(event.target)) return;
    const { clientX, clientY } = event.touches[0];
    drag = { fromHabitat, x: clientX, y: clientY, lastY: clientY, distance: 0, captured: false };
  }, { passive: true });

  screen.addEventListener('touchmove', event => {
    if (!drag || event.touches.length !== 1 || !event.cancelable || getMode() !== drag.fromHabitat) return;
    const { clientX, clientY } = event.touches[0];
    if (!drag.captured) {
      const dy = clientY - drag.y;
      if (Math.abs(dy) < 6) return;
      if (Math.abs(clientX - drag.x) > Math.abs(dy) || (drag.fromHabitat ? dy > 0 : dy < 0)) {
        drag = null;
        return;
      }
      drag.captured = true;
    }

    event.preventDefault();
    const step = clientY - drag.lastY;
    drag.lastY = clientY;
    if (drag.fromHabitat) {
      drag.distance = Math.max(0, drag.distance - step);
    } else {
      // Spend the downward drag on the existing scroll position first. Only the remainder expands the scene.
      const remainder = drag.distance + step - Math.max(0, scrollArea.scrollTop);
      scrollArea.scrollTop = Math.max(0, -remainder);
      drag.distance = Math.max(0, remainder);
    }
    paint(drag.distance, drag.fromHabitat);
  }, { passive: false });

  screen.addEventListener('touchend', finish);
  screen.addEventListener('touchcancel', finish);
  screen.addEventListener('wheel', event => {
    const fromHabitat = getMode();
    if (drag || fromHabitat === null || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const surface = fromHabitat ? habitatEntry : scrollArea;
    if (!surface.contains(event.target) || (!fromHabitat && scrollArea.scrollTop > 1)) return;
    const direction = fromHabitat ? 1 : -1;
    const pixelsPerUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? screen.clientHeight : 1;
    const step = direction * event.deltaY * pixelsPerUnit;
    if (step < 0 && !wheel) return;
    event.preventDefault();
    if (wheel) clearTimeout(wheel.timer);
    if (!wheel || wheel.fromHabitat !== fromHabitat) wheel = { fromHabitat, distance: 0 };
    wheel.distance = Math.max(0, wheel.distance + step);
    paint(wheel.distance, fromHabitat);
    wheel.timer = setTimeout(() => {
      settle(wheel, true);
      wheel = null;
    }, 110);
  }, { passive: false });

  habitatEntry.addEventListener('click', event => {
    if (getMode() && event.target.closest('.habitat-continue')) setHabitat(false);
  });
}
