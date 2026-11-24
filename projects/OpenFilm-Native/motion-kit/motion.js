// Each shot takes only its own local time. No playback state is shared, so an
// editor can scrub backwards or render the same frame out of order.
(() => {
  const {motion, duration: value} = document.body.dataset;
  const duration = Number(value);
  const byId = id => document.getElementById(id);
  const clamp = n => Math.max(0, Math.min(1, n));
  const easeOut = n => 1 - (1 - n) ** 3;
  const smooth = n => n * n * (3 - 2 * n);
  const progress = (t, start, length, ease = easeOut) => ease(clamp((t - start) / length));

  const shots = {
    editorial() {
      const lines = [...document.querySelectorAll('[data-reveal]')];
      return t => {
        for (const line of lines) {
          const p = progress(t, Number(line.dataset.reveal), 0.68);
          line.style.clipPath = `inset(${100 * (1 - p)}% 0 0 0)`;
        }
        byId('editorial-note').style.opacity = String(progress(t, .9, .45));
      };
    },
    evidence() {
      const line = byId('evidence-line');
      const dot = byId('evidence-dot');
      const values = line.dataset.values.split(',').map(Number);
      if (values.length < 2 || values.some(n => !Number.isFinite(n) || n < 0 || n > 100)) {
        throw new Error('Evidence example requires at least two values between 0 and 100');
      }
      line.setAttribute('points', values.map((n, i) => `${80 + i / (values.length - 1) * 770},${380 - 3.4 * n}`).join(' '));
      byId('evidence-last').textContent = String(values.at(-1));
      const length = line.getTotalLength();
      return t => {
        const p = progress(t, .35, 2.15, smooth);
        line.style.strokeDashoffset = String(1 - p);
        line.style.opacity = p > 0 ? '1' : '0';
        const point = line.getPointAtLength(p * length);
        dot.setAttribute('cx', point.x);
        dot.setAttribute('cy', point.y);
        dot.style.opacity = String(progress(t, .35, .2));
        byId('evidence-value').style.opacity = String(progress(t, 2.1, .65));
      };
    },
    product() {
      const capture = byId('product-capture');
      const target = byId('product-target');
      const label = byId('product-callout');
      return t => {
        const zoom = progress(t, .65, 1, smooth);
        const cue = progress(t, 1.34, .45);
        capture.style.transform = `scale(${1 + .12 * zoom})`;
        target.style.boxShadow = `0 0 0 ${.5 * cue}vw #7accaa`;
        label.style.opacity = String(cue);
        label.style.transform = `translateX(${(1 - cue) * 28}px)`;
      };
    },
  };

  const frame = shots[motion]();
  const ready = document.fonts.ready.then(() => {});
  window.film = {width: 1920, height: 1080, duration, frame, ready};
  frame(0);
  if (!window.filmHost) ready.then(() => {
    let first;
    function tick(now) {
      first ??= now;
      frame(((now - first) / 1000) % duration);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
