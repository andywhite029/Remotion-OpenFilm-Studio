// Only time determines the output: reverse seeks and sub-frame sampling work
// without replaying an animation or accumulating state.
//
// `transform` is used for the entrance, never for the element's own position:
// OpenFilm's clip overrides use the separate `translate` / `scale` / `rotate`
// properties, so an editor moving the whole clip does not fight this script.
const duration = Number(document.body.dataset.duration);
const enters = [...document.querySelectorAll('[data-enter]')].map(el => [el, Number(el.dataset.enter)]);
const rule = document.getElementById('title-rule');
const mark = document.getElementById('title-mark');
const clamp = v => Math.max(0, Math.min(1, v));

// The title card names the same product as the 3D shot: `scenes/shot.js` is
// generated from product-shot.json, so changing the model renames this card
// too. The HTML keeps working copy as its fallback when the data is absent.
// Studio text overrides are applied by the host after this page has drawn, so
// an editor's wording still wins over the parameter.
const shot = window.__PRODUCT_SHOT__;
const setText = (id, value) => {
  if (typeof value !== 'string' || !value) return;
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};
if (shot && typeof shot === 'object') {
  setText('title-headline', shot.title);
  setText('title-subtitle', shot.spec);
}

const frame = t => {
  for (const [el, start] of enters) {
    const amount = 1 - (1 - clamp((t - start) / 0.7)) ** 3;
    el.style.opacity = String(amount);
    el.style.transform = `translateY(${(1 - amount) * 40}px)`;
  }
  if (rule) rule.style.transform = `scaleX(${clamp(t / 0.9)})`;
  if (mark) mark.style.transform = `rotate(${18 + t * 12}deg)`;
};

const ready = document.fonts.ready.then(() => {});
window.film = {width: 1920, height: 1080, duration, ready, frame};
frame(0);

// Standalone preview (opening the file in a browser): OpenFilm supplies the
// clock when the page is inside Studio's film host.
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
