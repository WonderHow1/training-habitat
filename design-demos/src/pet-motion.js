const petRoute = [[0, 0], [-1, .25], [.84, .65], [.35, .12], [-.65, .85], [0, 0]];
const restPosition = { x: 0, y: 0, step: 0 };
const leftFacingSprites = new Set(['cat', 'dog', 'rabbit', 'chinchilla']);
const destinationPause = 2600;

function coverScale(canvas, width = canvas.clientWidth, height = canvas.clientHeight) {
  return Math.max(width / canvas.width, height / canvas.height);
}

function habitatDestination(canvas, target, clientX, clientY) {
  const bounds = canvas.getBoundingClientRect();
  const pet = target.getBoundingClientRect();
  const scale = coverScale(canvas, bounds.width, bounds.height);
  const axis = (point, origin, size, petSize) => {
    const range = Math.max(0, Math.floor((size - petSize) / 2 / scale));
    return Math.max(-range, Math.min(range, Math.round((point - origin - size / 2) / scale)));
  };
  return {
    x: axis(clientX, bounds.left, bounds.width, pet.width),
    y: axis(clientY, bounds.top, bounds.height, pet.height)
  };
}

function walkToward(from, to, elapsed) {
  const duration = Math.hypot(to.x - from.x, to.y - from.y) * 35;
  const progress = duration === 0 ? 1 : Math.min(1, elapsed / duration);
  return {
    x: Math.round(from.x + (to.x - from.x) * progress),
    y: Math.round(from.y + (to.y - from.y) * progress),
    step: progress < 1 ? 1 + Math.floor(elapsed / 135) % 2 : 0,
    duration
  };
}

function reactionFrame(reaction, elapsed, reduced) {
  if (reduced) return elapsed < 650 ? reaction.still : null;
  for (const frame of reaction.frames) {
    if (elapsed < frame.duration) return frame;
    elapsed -= frame.duration;
  }
  return null;
}

function wanderingPet(canvas, target, limit, elapsed) {
  // Pause near each destination and keep the whole touch target clear of scene controls.
  const cycle = Math.max(0, elapsed - 3000);
  const segment = Math.floor(cycle / 4400) % (petRoute.length - 1);
  const travel = Math.min(1, cycle % 4400 / 3200);
  const [fromX, fromY] = petRoute[segment];
  const [toX, toY] = petRoute[segment + 1];
  const scale = coverScale(canvas);
  const rangeX = Math.max(0, Math.floor((canvas.clientWidth - target.offsetWidth) / 2 / scale) - 3);
  const bottom = limit?.offsetTop ?? canvas.clientHeight;
  const rangeY = Math.min(22, Math.max(0, Math.floor((bottom - (canvas.clientHeight + target.offsetHeight) / 2 - 8) / scale)));
  const y = Math.round((fromY + (toY - fromY) * travel) * rangeY);
  const x = Math.round((fromX + (toX - fromX) * travel) * rangeX);
  const feetY = centeredPetPosition(canvas, canvas.dataset.species).y + y + 24;
  const rightEdge = canvas.dataset.habitat === 'garden' ? Math.max(-rangeX, gardenShoreAt(feetY) - canvas.width / 2 - 16) : rangeX;
  const walking = cycle > 0 && travel < 1;
  return { x: Math.min(x, rightEdge), y, step: walking ? 1 + Math.floor(cycle / 160) % 2 : 0 };
}

function animatePet(canvas, target, { roam = false, previewOffset = null } = {}) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const limit = roam ? canvas.parentElement.querySelector('.pet-scene-panel, .habitat-continue') : null;
  let species = canvas.dataset.species;
  let idleSince = performance.now();
  let lastPaint = idleSince;
  let touchedAt = -Infinity;
  let walked = 0;
  let position = restPosition;
  let trip = null;
  let previousX = 0;
  let walkFlip = false;
  let previousFrame;
  let previousPose = '';

  function paint(now) {
    if (canvas.dataset.species !== species) {
      species = canvas.dataset.species;
      idleSince = now;
      touchedAt = -Infinity;
      position = restPosition;
      trip = null;
      previousX = 0;
      walkFlip = false;
      previousPose = '';
    }
    const reduced = motion.matches;
    const reaction = petReactions[species];
    const elapsed = Math.max(0, now - touchedAt);
    const idle = Math.max(0, now - idleSince + (previewOffset ?? 0));
    const preview = previewOffset !== null && !reduced && elapsed > 2400;
    const frame = reactionFrame(reaction, elapsed, reduced) ?? (preview ? reactionFrame(reaction, idle % 7800, false) : null);
    const moving = roam && !reduced;
    const delta = Math.min(100, Math.max(0, now - lastPaint));
    if (!frame) {
      if (trip) trip.elapsed += delta;
      else if (moving) walked += delta;
    }
    lastPaint = now;
    const automatic = moving && species !== 'goldfish' ? wanderingPet(canvas, target, limit, walked) : restPosition;
    position = automatic;
    if (trip) {
      position = walkToward(trip.from, trip.to, reduced ? Infinity : trip.elapsed);
      const leaveAt = position.duration + destinationPause;
      if (!reduced && trip.elapsed > leaveAt) {
        position = walkToward(trip.to, automatic, trip.elapsed - leaveAt);
        if (trip.elapsed >= leaveAt + position.duration) trip = null;
      }
    }
    const swimPhase = Math.floor(Math.max(0, walked - 3000) / 420) % 8;
    const swimX = moving && species === 'goldfish' ? [0, 1, 2, 1, 0, -1, -2, -1][swimPhase] : 0;
    const x = frame ? (frame.x ?? 0) : swimX;
    if (roam && !frame) {
      const currentX = position.x + swimX;
      if (currentX !== previousX) walkFlip = (currentX < previousX) !== leftFacingSprites.has(species);
      previousX = currentX;
    }
    const footstep = frame || species === 'goldfish' ? 0 : position.step;
    const y = frame?.y ?? (footstep === 2 ? -1 : 0);
    const flip = roam && (!frame || species === 'cat') ? walkFlip : Boolean(frame?.flip);
    const blink = frame?.blink ?? (!frame && !reduced && idle % 3000 >= 2750);
    const scale = roam ? coverScale(canvas) : 1;
    const offsetX = position.x * scale;
    const offsetY = position.y * scale;
    const pose = `${offsetX},${offsetY},${position.x},${position.y},${x},${y},${flip},${blink},${footstep}`;
    if (pose === previousPose && frame === previousFrame) return;
    previousPose = pose;
    previousFrame = frame;
    if (roam) {
      target.style.setProperty('--pet-offset-x', offsetX + 'px');
      target.style.setProperty('--pet-offset-y', offsetY + 'px');
    }
    drawScene(canvas, { ...frame, walk: position, x, y, flip, blink, footstep });
  }

  function tick(now) {
    if (!canvas.isConnected || target.closest('[inert]')) return;
    if (now - lastPaint >= 65) paint(now);
    requestAnimationFrame(tick);
  }

  target.addEventListener('click', () => {
    // Synchronize the species before starting a reaction on a freshly selected preview.
    const now = performance.now();
    paint(now);
    touchedAt = now;
    paint(now);
  });
  if (roam) {
    let tap;
    canvas.addEventListener('pointerdown', event => {
      if (event.isPrimary) tap = { x: event.clientX, y: event.clientY, moved: false };
    });
    canvas.addEventListener('pointermove', event => {
      if (tap && event.isPrimary && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) tap.moved = true;
    });
    canvas.addEventListener('pointercancel', () => { tap = null; });
    canvas.addEventListener('click', event => {
      const moved = tap?.moved;
      tap = null;
      if (moved || canvas.closest('[data-habitat-dragging]')) return;
      const now = performance.now();
      paint(now);
      touchedAt = -Infinity;
      trip = { from: position, to: habitatDestination(canvas, target, event.clientX, event.clientY), elapsed: 0 };
      paint(now);
    });
  }
  requestAnimationFrame(tick);
}
