// Example canvas wallpaper — interactive particle field.
// Particles drift slowly and are gently pushed away from the cursor
// whenever it's over empty desktop space (icons/windows still get
// clicks normally — see the mouse-forwarding note in render() below).
// Pick this file via Settings → Wallpaper → "Canvas Script...".

const N = 140;
const LINK_DIST = 110;
const PUSH_RADIUS = 130;

export function render(canvas, api) {
  const ctx = canvas.getContext('2d');
  // `api.mouse` is kept live-updated by the host (desktop wallpaper or
  // the Settings preview thumbnail) — {x, y, active}. The wallpaper
  // iframe itself never receives real pointer events (that would swallow
  // desktop clicks), so this forwarded position is the only way a
  // wallpaper script can react to the cursor.
  const mouse = (api && api.mouse) || { x: -1, y: -1, active: false };

  let particles = [];
  function seed() {
    particles = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: 1 + Math.random() * 1.8,
    }));
  }
  seed();
  let lastW = canvas.width, lastH = canvas.height;

  function frame() {
    // Re-seed on resize so particles stay spread across the new area
    // rather than clumped in the old (smaller) top-left corner.
    if (canvas.width !== lastW || canvas.height !== lastH) {
      lastW = canvas.width; lastH = canvas.height; seed();
    }

    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      // Gentle drift
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x += canvas.width; if (p.x > canvas.width) p.x -= canvas.width;
      if (p.y < 0) p.y += canvas.height; if (p.y > canvas.height) p.y -= canvas.height;

      // Push away from the cursor
      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < PUSH_RADIUS && dist > 0.001) {
          const force = (1 - dist / PUSH_RADIUS) * 0.6;
          p.vx += (dx / dist) * force * 0.06;
          p.vy += (dy / dist) * force * 0.06;
        }
      }
      // Mild drag so pushed particles settle back into a slow drift
      p.vx *= 0.98; p.vy *= 0.98;
    }

    // Connective lines between nearby particles
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK_DIST) {
          ctx.strokeStyle = `rgba(120,170,255,${0.18 * (1 - d / LINK_DIST)})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }

    // Particles themselves
    ctx.fillStyle = 'rgba(180,210,255,0.85)';
    for (const p of particles) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }

    requestAnimationFrame(frame);
  }
  frame();
}
