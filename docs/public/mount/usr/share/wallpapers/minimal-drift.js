// Example canvas wallpaper — minimal: a slowly breathing solid-color
// field with one soft accent circle drifting in a lazy figure-eight, and
// a single hairline that slowly rotates. No particles, no noise, nothing
// busy — for anyone who wants "alive, but barely".
// Pick this file via Settings → Wallpaper → "Canvas Script...".

const BASE = '#101114';
const ACCENT = '#5b7cfa';

export function render(canvas) {
  const ctx = canvas.getContext('2d');
  const t0 = performance.now();

  function frame() {
    const w = canvas.width, h = canvas.height;
    const t = (performance.now() - t0) / 1000;

    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, w, h);

    // Figure-eight drift, slow enough that it reads as "settled" rather
    // than "animating" at a glance.
    const cx = w * 0.5 + Math.sin(t * 0.06) * w * 0.22;
    const cy = h * 0.5 + Math.sin(t * 0.12) * h * 0.16;
    const r = Math.min(w, h) * 0.28;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, ACCENT + '33');
    glow.addColorStop(1, ACCENT + '00');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // One slowly-rotating hairline through the center — the only other
    // moving element, kept extremely subtle.
    const ang = t * 0.03;
    const len = Math.min(w, h) * 0.38;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - Math.cos(ang) * len, h / 2 - Math.sin(ang) * len);
    ctx.lineTo(w / 2 + Math.cos(ang) * len, h / 2 + Math.sin(ang) * len);
    ctx.stroke();

    requestAnimationFrame(frame);
  }
  frame();
}
