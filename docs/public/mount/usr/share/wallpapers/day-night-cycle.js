// Example canvas wallpaper — sky that follows the real local time of day.
// Sun/moon position and sky colors are driven by the actual clock, not a
// simulated loop, so the wallpaper always matches what time it really is.
// Pick this file via Settings → Wallpaper → "Canvas Script...".

// Key hours (0-24) mapped to sky colors — interpolated between neighbors.
const STOPS = [
  { h: 0,    top: '#02040f', bot: '#0a0f2e' }, // deep night
  { h: 5,    top: '#0a1030', bot: '#2b2f5c' }, // pre-dawn
  { h: 6.5,  top: '#ff9a6b', bot: '#ffd08a' }, // sunrise
  { h: 9,    top: '#5aa9e6', bot: '#bfe3ff' }, // morning
  { h: 13,   top: '#3d8ee0', bot: '#cdeeff' }, // midday
  { h: 17,   top: '#4a76c9', bot: '#ffcf8a' }, // afternoon
  { h: 18.5, top: '#a34b6a', bot: '#ff9a5c' }, // sunset
  { h: 20,   top: '#1a1440', bot: '#4a3068' }, // dusk
  { h: 24,   top: '#02040f', bot: '#0a0f2e' }, // wrap to night
];

function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
function skyColors(hourFloat) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (hourFloat >= a.h && hourFloat <= b.h) {
      const t = (hourFloat - a.h) / (b.h - a.h);
      return { top: mixColor(a.top, b.top, t), bot: mixColor(a.bot, b.bot, t) };
    }
  }
  return { top: STOPS[0].top, bot: STOPS[0].bot };
}

export function render(canvas) {
  const ctx = canvas.getContext('2d');
  let stars = [];
  let lastW = 0, lastH = 0;

  function seedStars() {
    stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.7,
      r: Math.random() * 1.4 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));
  }

  function frame() {
    if (canvas.width !== lastW || canvas.height !== lastH) {
      lastW = canvas.width; lastH = canvas.height; seedStars();
    }
    const now = new Date();
    const hourFloat = now.getHours() + now.getMinutes() / 60;
    const w = canvas.width, h = canvas.height;
    const { top, bot } = skyColors(hourFloat);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Night-ness: how close to full darkness, drives star visibility.
    const isNight = hourFloat < 5.5 || hourFloat > 19.5;
    const nightAmount = hourFloat < 5.5
      ? 1 - hourFloat / 5.5
      : hourFloat > 19.5 ? Math.min(1, (hourFloat - 19.5) / 2) : 0;

    if (nightAmount > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.6 * nightAmount})`;
      const t = Date.now() / 1000;
      stars.forEach(s => {
        const twinkle = 0.5 + 0.5 * Math.sin(t * 1.5 + s.tw);
        ctx.globalAlpha = nightAmount * twinkle;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // Sun/moon: a single arc across the sky, up during the day
    // (6-18h), below the horizon otherwise (moon takes the night arc).
    const daylight = hourFloat >= 6 && hourFloat <= 18;
    const cycleHour = daylight ? hourFloat : (hourFloat < 6 ? hourFloat + 24 : hourFloat) - 18;
    const cycleFrac = daylight ? (hourFloat - 6) / 12 : (cycleHour) / 12;
    const arcX = w * cycleFrac;
    const arcY = h * 0.85 - Math.sin(cycleFrac * Math.PI) * h * 0.65;

    if (daylight) {
      const glow = ctx.createRadialGradient(arcX, arcY, 0, arcX, arcY, 70);
      glow.addColorStop(0, 'rgba(255,244,200,0.9)');
      glow.addColorStop(1, 'rgba(255,244,200,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(arcX, arcY, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath(); ctx.arc(arcX, arcY, 26, 0, Math.PI * 2); ctx.fill();
    } else {
      const glow = ctx.createRadialGradient(arcX, arcY, 0, arcX, arcY, 45);
      glow.addColorStop(0, 'rgba(220,225,255,0.5)');
      glow.addColorStop(1, 'rgba(220,225,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(arcX, arcY, 45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8ecff';
      ctx.beginPath(); ctx.arc(arcX, arcY, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mixColor(top, bot, 0.3);
      ctx.beginPath(); ctx.arc(arcX + 7, arcY - 4, 15, 0, Math.PI * 2); ctx.fill();
    }

    requestAnimationFrame(frame);
  }
  frame();
}
