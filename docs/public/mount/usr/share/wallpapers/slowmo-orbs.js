// Example canvas wallpaper — slow-motion drifting orbs.
// A calm, dreamy background: a handful of soft glowing blobs drift and
// slowly pulse over a dark gradient. Not interactive on purpose — the
// point of this one is stillness.
// Pick this file via Settings → Wallpaper → "Canvas Script...".

const ORBS = [
  { hue: 260, speed: 0.021, radius: 0.30, phase: 0.0 },
  { hue: 200, speed: 0.017, radius: 0.24, phase: 2.1 },
  { hue: 320, speed: 0.013, radius: 0.26, phase: 4.4 },
  { hue: 170, speed: 0.026, radius: 0.18, phase: 1.3 },
];

export function render(canvas) {
  const ctx = canvas.getContext('2d');
  const t0 = performance.now();

  function frame() {
    // Divided way down — "slowmo" means seconds-long orbits, not
    // per-frame motion, so the whole animation reads as nearly-still
    // unless you watch it for a while.
    const t = (performance.now() - t0) / 1000 * 0.12;
    const w = canvas.width, h = canvas.height;
    const minSide = Math.min(w, h);

    // Deep base gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#05040a');
    bg.addColorStop(1, '#0c0a1a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (const orb of ORBS) {
      const ang = t * orb.speed * Math.PI * 2 + orb.phase;
      const orbitX = w * 0.5 + Math.cos(ang) * w * 0.28;
      const orbitY = h * 0.5 + Math.sin(ang * 0.8) * h * 0.28;
      const pulse = 0.85 + 0.15 * Math.sin(t * 0.6 + orb.phase);
      const r = minSide * orb.radius * pulse;

      const grad = ctx.createRadialGradient(orbitX, orbitY, 0, orbitX, orbitY, r);
      grad.addColorStop(0, `hsla(${orb.hue}, 85%, 65%, 0.55)`);
      grad.addColorStop(0.5, `hsla(${orb.hue}, 85%, 55%, 0.18)`);
      grad.addColorStop(1, `hsla(${orb.hue}, 85%, 50%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(orbitX, orbitY, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    requestAnimationFrame(frame);
  }
  frame();
}
