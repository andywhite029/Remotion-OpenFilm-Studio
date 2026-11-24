// Only time determines the output: reverse seeks and sub-frame sampling work
// without replaying an animation or accumulating state.
const duration = Number(document.body.dataset.duration);
const enters = [...document.querySelectorAll('[data-enter]')].map(el => [el, Number(el.dataset.enter)]);
const mark = document.getElementById('intro-mark');
const clamp = v => Math.max(0, Math.min(1, v));
const frame = t => {
  for (const [el, start] of enters) {
    const amount = 1 - (1 - clamp((t - start) / 0.65)) ** 3;
    el.style.opacity = String(amount);
    // Use transform; clip overrides use the separate translate/scale/rotate properties.
    el.style.transform = `translateY(${(1 - amount) * 46}px)`;
  }
  if (mark) mark.style.transform = `rotate(${20 + t * 24}deg)`;
};
const ready = document.fonts.ready.then(() => {});
window.film = {width: 1920, height: 1080, duration, ready, frame};
frame(0);
if (!window.filmHost) {
  ready.then(() => {
    let start;
    function tick(now) {
      start ??= now;
      frame(((now - start) / 1000) % duration);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}
