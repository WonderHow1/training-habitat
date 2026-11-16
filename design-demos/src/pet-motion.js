function animatePet(canvas, target) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let species = canvas.dataset.species;
  let idleSince = performance.now();
  let touchedAt = -Infinity;
  let previousPose = '';

  function paint(now) {
    if (canvas.dataset.species !== species) {
      species = canvas.dataset.species;
      idleSince = now;
      touchedAt = -Infinity;
      previousPose = '';
    }
    const { reaction } = petSprites[species];
    const elapsed = Math.max(0, now - touchedAt);
    const index = Math.floor(elapsed / 110);
    const heart = elapsed < (motion.matches ? 660 : reaction.length * 110);
    const [x, y] = !motion.matches && heart ? reaction[index] : [0, 0];
    const blink = !motion.matches && (heart ? index === 2 : (now - idleSince) % 3000 >= 2750);
    const pose = `${x},${y},${blink},${heart}`;
    if (pose === previousPose) return;
    previousPose = pose;
    drawScene(canvas, { x, y, blink, heart });
  }

  function tick(now) {
    if (!canvas.isConnected || target.closest('[inert]')) return;
    paint(now);
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
