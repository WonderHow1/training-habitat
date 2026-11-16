function bindWorkoutSwipe(scroller) {
  let openRow = null;
  let gesture = null;
  let suppressClick = null;
  const rowFor = target => target.closest('.swipe-workout > .list-row')?.parentElement;

  function reveal(row, visible) {
    if (openRow && openRow !== row) reveal(openRow, false);
    const actions = row.querySelector('.swipe-actions');
    row.style.setProperty('--swipe-offset', visible ? -actions.offsetWidth + 'px' : '0px');
    row.toggleAttribute('data-open', visible);
    actions.inert = !visible;
    openRow = visible ? row : null;
  }

  scroller.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = null;
    const row = rowFor(event.target);
    if (openRow && !openRow.contains(event.target)) reveal(openRow, false);
    gesture = row ? { row, pointer: event.pointerId, x: event.clientX, y: event.clientY, dragging: false } : null;
  });

  scroller.addEventListener('pointermove', event => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const { row } = gesture;
    if (!gesture.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        gesture = null;
        return;
      }
      gesture.dragging = true;
      gesture.width = row.querySelector('.swipe-actions').offsetWidth;
      gesture.wasOpen = openRow === row;
      row.setAttribute('data-swiping', '');
      if (event.pointerType === 'mouse') row.setPointerCapture(event.pointerId);
    }
    const offset = (gesture.wasOpen ? -gesture.width : 0) + dx;
    row.style.setProperty('--swipe-offset', Math.max(-gesture.width, Math.min(0, offset)) + 'px');
  });

  function finish(event) {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const { row, dragging, wasOpen, x } = gesture;
    gesture = null;
    if (!dragging) return;
    suppressClick = row;
    const moved = event.clientX - x;
    const show = event.type === 'pointerup' ? (wasOpen ? moved < 42 : moved <= -42) : wasOpen;
    void getComputedStyle(row.querySelector('.list-row')).transform;
    row.removeAttribute('data-swiping');
    reveal(row, show);
  }
  scroller.addEventListener('pointerup', finish);
  scroller.addEventListener('pointercancel', finish);
  scroller.addEventListener('click', event => {
    if (event.detail === 0) return;
    const row = rowFor(event.target);
    if (!row || row !== suppressClick) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    suppressClick = null;
  }, true);
  scroller.addEventListener('keydown', event => {
    const row = rowFor(event.target);
    if (!row || !['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    reveal(row, event.key === 'ArrowLeft');
  });
}
