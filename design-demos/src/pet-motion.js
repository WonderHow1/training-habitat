const petRoute = [[0, 0], [-1, .25], [.84, .65], [.35, .12], [-.65, .85], [0, 0]];
const restPosition = { x: 0, y: 0, step: 0 };
const leftFacingSprites = new Set(['cat', 'dog', 'rabbit', 'chinchilla']);
const strollDelay = 3000;
const destinationPause = 2600;

function coverScale(canvas, width = canvas.clientWidth, height = canvas.clientHeight) {
  return Math.max(width / canvas.width, height / canvas.height);
}

function sceneTerrain(canvas, target) {
  const scale = coverScale(canvas);
  const visibleX = Math.max(0, Math.floor((canvas.clientWidth - target.offsetWidth) / 2 / scale));
  const visibleY = Math.max(0, Math.floor((canvas.clientHeight - target.offsetHeight) / 2 / scale));
  const habitat = canvas.dataset.habitat;
  const floor = habitat === 'garden' ? 83 : habitat === 'running-track' ? Math.round(canvas.height * .39) + 3 : 81;
  const feet = centeredPetPosition(canvas, canvas.dataset.species).y + 24;
  const minY = Math.max(-visibleY, Math.min(0, floor + feet - canvas.height));
  const rightAt = y => habitat === 'garden' ? Math.min(visibleX, gardenShoreAt(Math.max(84, feet + y)) - canvas.width / 2 - 16) : visibleX;
  let maxY = visibleY;
  while (maxY > minY && rightAt(maxY) < -visibleX) maxY--;
  return { visibleX, minY, maxY, rightAt };
}

function keepOnTerrain(terrain, point) {
  let y = Math.max(terrain.minY, Math.min(terrain.maxY, point.y));
  while (y > terrain.minY && terrain.rightAt(y) < -terrain.visibleX) y--;
  const x = Math.max(-terrain.visibleX, Math.min(terrain.rightAt(y), point.x));
  return { ...point, x, y };
}

function habitatDestination(canvas, target, clientX, clientY) {
  const bounds = canvas.getBoundingClientRect();
  const scale = coverScale(canvas, bounds.width, bounds.height);
  const point = { x: Math.round((clientX - bounds.left - bounds.width / 2) / scale), y: Math.round((clientY - bounds.top - bounds.height / 2) / scale) };
  const terrain = sceneTerrain(canvas, target);
  let nearest = keepOnTerrain(terrain, point);
  let best = (nearest.x - point.x) ** 2 + (nearest.y - point.y) ** 2;
  for (let y = terrain.minY; y <= terrain.maxY && best > 0; y++) {
    if (terrain.rightAt(y) < -terrain.visibleX || (y - point.y) ** 2 >= best) continue;
    const candidate = keepOnTerrain(terrain, { x: point.x, y });
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance >= best) continue;
    nearest = candidate;
    best = distance;
  }
  return nearest;
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

function wanderingPet(canvas, target, limit, elapsed, origin = null, terrain = sceneTerrain(canvas, target)) {
  // Pause near each destination and keep the whole touch target clear of scene controls.
  const cycle = Math.max(0, elapsed - strollDelay);
  const segment = Math.floor(cycle / 4400) % (petRoute.length - 1);
  const travel = Math.min(1, cycle % 4400 / 3200);
  const [fromX, fromY] = petRoute[segment];
  const [toX, toY] = petRoute[segment + 1];
  const scale = coverScale(canvas);
  const { visibleX } = terrain;
  const rangeX = Math.max(0, visibleX - 3);
  const bottom = limit?.offsetTop ?? canvas.clientHeight;
  const floor = Math.floor((bottom - (canvas.clientHeight + target.offsetHeight) / 2 - 8) / scale);
  const rangeY = origin ? 13 : Math.min(22, Math.max(0, floor));
  const lowerBound = origin ? Math.min(terrain.maxY, Math.max(origin.y, floor)) : rangeY;
  const vertical = origin && origin.y + rangeY > lowerBound ? -1 : 1;
  const horizontal = origin && origin.x < 0 ? -1 : 1;
  const xLimit = origin ? visibleX : rangeX;
  const stride = origin ? Math.round(rangeX * .65) : rangeX;
  const y = Math.min(lowerBound, (origin?.y ?? 0) + Math.round((fromY + (toY - fromY) * travel) * rangeY * vertical));
  const x = (origin?.x ?? 0) + Math.round((fromX + (toX - fromX) * travel) * stride * horizontal);
  const walking = cycle > 0 && travel < 1;
  return keepOnTerrain(terrain, { x: Math.max(-xLimit, Math.min(x, xLimit)), y, step: walking ? 1 + Math.floor(cycle / 160) % 2 : 0 });
}

function animatePet(canvas, target, { roam = false, previewOffset = null, marker = null } = {}) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const limit = roam ? canvas.parentElement.querySelector('.pet-scene-panel, .habitat-continue') : null;
  let species = canvas.dataset.species;
  let idleSince = performance.now();
  let lastPaint = idleSince;
  let touchedAt = -Infinity;
  let walked = 0;
  let strollOrigin = null;
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
      walked = 0;
      strollOrigin = null;
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
    const terrain = roam ? sceneTerrain(canvas, target) : null;
    if (trip) {
      position = keepOnTerrain(terrain, walkToward(trip.from, trip.to, reduced ? Infinity : trip.elapsed));
      const leaveAt = position.duration + destinationPause;
      if (!reduced && trip.elapsed >= leaveAt) {
        strollOrigin = { ...trip.to, step: 0 };
        walked = strollDelay + trip.elapsed - leaveAt;
        trip = null;
      }
    }
    if (!trip) {
      position = moving && species !== 'goldfish' ? wanderingPet(canvas, target, limit, walked, strollOrigin, terrain) : strollOrigin ?? restPosition;
    }
    const swimPhase = Math.floor(Math.max(0, walked - strollDelay) / 420) % 8;
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
    if (marker) {
      const show = trip && (position.x !== trip.to.x || position.y !== trip.to.y);
      marker.hidden = !show;
      if (show) {
        marker.style.setProperty('--target-x', trip.to.x * scale + 'px');
        marker.style.setProperty('--target-y', trip.to.y * scale + 'px');
      }
    }
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
