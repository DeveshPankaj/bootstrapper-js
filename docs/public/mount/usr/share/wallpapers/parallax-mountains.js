// Example canvas wallpaper — layered mountain silhouettes with drifting
// clouds; moving the mouse shifts each layer sideways at a different
// speed for a classic parallax-depth effect (near layers move more).
// Pick this file via Settings → Wallpaper → "Canvas Script...".

const RIDGES = [
  { color: '#8fb8d8', heightFrac: 0.34, jag: 0.05, parallax: 8,  speed: 0.15 },
  { color: '#6f9fc4', heightFrac: 0.44, jag: 0.08, parallax: 22, speed: 0.30 },
  { color: '#4d7fa8', heightFrac: 0.56, jag: 0.11, parallax: 42, speed: 0.55 },
  { color: '#2f5f88', heightFrac: 0.70, jag: 0.15, parallax: 70, speed: 0.9 },
];

function ridgePath(ctx, w, h, ridge, seedOffset) {
  const baseY = h * (1 - ridge.heightFrac);
  ctx.beginPath();
  ctx.moveTo(-40, h + 10);
  const step = 60;
  for (let x = -80; x <= w + 80; x += step) {
    const n = Math.sin((x + seedOffset) * 0.006) + Math.sin((x + seedOffset) * 0.017) * 0.5;
    const y = baseY - n * h * ridge.jag;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w + 40, h + 10);
  ctx.closePath();
}

export function render(canvas, api) {
  const ctx = canvas.getContext('2d');
  const mouse = (api && api.mouse) || { x: -1, y: -1, active: false };
  let smoothedShift = 0;

  const clouds = Array.from({ length: 8 }, () => ({
    x: Math.random(),
    y: 0.08 + Math.random() * 0.22,
    scale: 0.6 + Math.random() * 1.1,
    speed: 0.004 + Math.random() * 0.006,
  }));

  function drawCloud(w, h, c, t) {
    const cx = ((c.x + t * c.speed * 0.02) % 1.2 - 0.1) * w;
    const cy = c.y * h;
    const s = c.scale * 26;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, s, s * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * 0.7, cy + s * 0.1, s * 0.7, s * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - s * 0.7, cy + s * 0.12, s * 0.6, s * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(ts) {
    const w = canvas.width, h = canvas.height;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#bfe3f7');
    sky.addColorStop(0.55, '#e7f4fb');
    sky.addColorStop(1, '#fdf6ea');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const targetShift = mouse.active ? (mouse.x / w) * 2 - 1 : 0;
    smoothedShift += (targetShift - smoothedShift) * 0.03;

    clouds.forEach(c => drawCloud(w, h, c, ts || 0));

    RIDGES.forEach((ridge, i) => {
      ctx.save();
      ridgePath(ctx, w, h, ridge, i * 500 + smoothedShift * ridge.parallax * 6);
      ctx.fillStyle = ridge.color;
      ctx.fill();
      ctx.restore();
    });

    // Sun sitting low, fixed relative to the sky (not the parallax layers)
    // so its position reads as "far away", reinforcing the depth stack.
    const sunX = w * 0.78, sunY = h * 0.22;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255,244,214,0.9)');
    glow.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sunX, sunY, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6da';
    ctx.beginPath(); ctx.arc(sunX, sunY, 34, 0, Math.PI * 2); ctx.fill();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
