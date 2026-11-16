const petRoute = [[0, 0], [-1, .25], [.84, .65], [.35, .12], [-.65, .85], [0, 0]];
const restPosition = { x: 0, y: 0, flip: false, step: 0 };

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
  const scale = Math.max(canvas.clientWidth / canvas.width, canvas.clientHeight / canvas.height);
  const rangeX = Math.max(0, Math.floor((canvas.clientWidth - target.offsetWidth) / 2 / scale) - 3);
  const bottom = limit?.offsetTop ?? canvas.clientHeight;
  const rangeY = Math.min(22, Math.max(0, Math.floor((bottom - (canvas.clientHeight + target.offsetHeight) / 2 - 8) / scale)));
  const y = Math.round((fromY + (toY - fromY) * travel) * rangeY);
  const x = Math.round((fromX + (toX - fromX) * travel) * rangeX);
  const feetY = centeredPetPosition(canvas, canvas.dataset.species).y + y + 24;
  const rightEdge = canvas.dataset.habitat === 'garden' ? Math.max(-rangeX, gardenShoreAt(feetY) - canvas.width / 2 - 16) : rangeX;
  const walking = cycle > 0 && travel < 1;
  return { x: Math.min(x, rightEdge), y, flip: cycle > 0 && toX < fromX, step: walking ? 1 + Math.floor(cycle / 160) % 2 : 0, scale };
}

function animatePet(canvas, target, { roam = false } = {}) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const limit = roam ? canvas.parentElement.querySelector('.pet-scene-panel, .habitat-continue') : null;
  let species = canvas.dataset.species;
  let idleSince = performance.now();
  let lastPaint = idleSince;
  let touchedAt = -Infinity;
  let walked = 0;
  let previousFrame;
  let previousPose = '';

  function paint(now) {
    if (canvas.dataset.species !== species) {
      species = canvas.dataset.species;
      idleSince = now;
      touchedAt = -Infinity;
      previousPose = '';
    }
    const reduced = motion.matches;
    const frame = reactionFrame(petReactions[species], Math.max(0, now - touchedAt), reduced);
    const moving = roam && !reduced;
    if (moving && !frame) walked += Math.min(100, Math.max(0, now - lastPaint));
    lastPaint = now;
    const walks = moving && species !== 'goldfish';
    const walk = walks ? wanderingPet(canvas, target, limit, walked) : restPosition;
    const swimPhase = Math.floor(Math.max(0, walked - 3000) / 420) % 8;
    const x = frame?.x ?? (moving && species === 'goldfish' && !frame ? [0, 1, 2, 1, 0, -1, -2, -1][swimPhase] : 0);
    const footstep = frame ? 0 : walk.step;
    const y = frame?.y ?? (footstep === 2 ? -1 : 0);
    const flip = frame ? Boolean(frame.flip) : walk.flip;
    const blink = frame?.blink ?? (!frame && !reduced && (now - idleSince) % 3000 >= 2750);
    const offsetX = walks ? walk.x * walk.scale : 0;
    const offsetY = walks ? walk.y * walk.scale : 0;
    const pose = `${offsetX},${offsetY},${walk.x},${walk.y},${x},${y},${flip},${blink},${footstep}`;
    if (pose === previousPose && frame === previousFrame) return;
    previousPose = pose;
    previousFrame = frame;
    if (roam) {
      target.style.setProperty('--pet-offset-x', offsetX + 'px');
      target.style.setProperty('--pet-offset-y', offsetY + 'px');
    }
    drawScene(canvas, { ...frame, walk, x, y, flip, blink, footstep });
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
  requestAnimationFrame(tick);
}
