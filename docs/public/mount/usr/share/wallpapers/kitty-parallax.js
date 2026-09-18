// Example canvas wallpaper — a cute kitty that acts like the classic
// Office "Clippy" assistant: mostly tucked out of sight, then every so
// often pops up from the corner, taps the desk, and offers a little tip
// in a speech bubble — with big googly eyes tracking the cursor the
// whole time she's visible. Sits over a soft parallax hill backdrop.
// Pick this file via Settings → Wallpaper → "Canvas Script...".

const LAYERS = [
  { color: '#2a2a4a', y: 0.62, amp: 14, speed: 0.00012, parallax: 6 },
  { color: '#22203c', y: 0.74, amp: 20, speed: 0.00009, parallax: 14 },
  { color: '#1a1830', y: 0.86, amp: 26, speed: 0.00006, parallax: 24 },
];

const TIPS = [
  "Right-click the desktop for more options!",
  "Looks like you're writing code. Want a tip?",
  "Don't forget to save your work~",
  "Meow. That's all, just meow.",
  "You can drag windows by their title bar!",
  "Pssst — try the Settings app for wallpapers like me.",
  "Did you know cats sleep 70% of the day? Relatable.",
  "Ctrl+S is your friend.",
];

// Idle for a while, rise up, stay a bit while showing a tip, then hide —
// a state machine rather than a permanent fixture, matching Clippy's
// classic "pops up occasionally" cadence instead of always sitting there.
const HIDDEN_MIN = 7000, HIDDEN_MAX = 13000;
const VISIBLE_MIN = 5000, VISIBLE_MAX = 8000;
const TRANSITION = 550;

export function render(canvas, api) {
  const ctx = canvas.getContext('2d');
  const mouse = (api && api.mouse) || { x: -1, y: -1, active: false };

  let phase = 'hidden'; // hidden -> rising -> idle -> hiding -> hidden...
  let phaseStart = performance.now();
  let phaseDur = HIDDEN_MIN + Math.random() * (HIDDEN_MAX - HIDDEN_MIN);
  let tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  let blinkT = Math.random() * 3;

  function drawSky(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0d0f2b');
    g.addColorStop(0.6, '#241b3d');
    g.addColorStop(1, '#3a2444');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(w * 0.82, h * 0.22, 0, w * 0.82, h * 0.22, 70);
    grad.addColorStop(0, 'rgba(255,248,220,0.9)');
    grad.addColorStop(1, 'rgba(255,248,220,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(w * 0.82, h * 0.22, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8e0';
    ctx.beginPath(); ctx.arc(w * 0.82, h * 0.22, 30, 0, Math.PI * 2); ctx.fill();
  }

  function drawHillLayer(layer, w, h, t, mouseShift) {
    const baseY = h * layer.y;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const step = 40;
    for (let x = -step; x <= w + step; x += step) {
      const y = baseY + Math.sin(x * 0.006 + t * layer.speed) * layer.amp - mouseShift * layer.parallax * 0.02;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = layer.color;
    ctx.fill();
  }

  function drawSpeechBubble(x, y, text) {
    ctx.font = '13px system-ui, sans-serif';
    const padX = 12, padY = 9;
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2, bh = 30;
    const bx = x - bw - 14, by = y - bh - 20;

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    const r = 8;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fill();
    // Little tail pointing down-right toward the kitty
    ctx.beginPath();
    ctx.moveTo(bx + bw - 22, by + bh);
    ctx.lineTo(bx + bw - 8, by + bh + 12);
    ctx.lineTo(bx + bw - 30, by + bh);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#2a2035';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + padX, by + bh / 2);
  }

  function drawKitty(w, h, rise, lookX, lookY, tapPhase, blink, showBubble) {
    // rise: 0 = fully tucked below the corner, 1 = fully popped up.
    const baseX = w - 110, baseY = h - 40 + (1 - rise) * 90;
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.globalAlpha = Math.max(0, Math.min(1, rise * 1.6));

    ctx.fillStyle = '#000000cc';

    // Tail
    const tailSway = Math.sin(performance.now() * 0.0016) * 10;
    ctx.beginPath();
    ctx.moveTo(45, 10);
    ctx.quadraticCurveTo(80 + tailSway, -10, 70 + tailSway, -45);
    ctx.quadraticCurveTo(66 + tailSway, -55, 58 + tailSway, -48);
    ctx.quadraticCurveTo(64, -15, 32, 4);
    ctx.closePath();
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.ellipse(0, 10, 55, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(-38, -14, 26, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.beginPath();
    ctx.moveTo(-56, -28); ctx.lineTo(-50, -42); ctx.lineTo(-42, -30); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-30, -32); ctx.lineTo(-22, -44); ctx.lineTo(-18, -28); ctx.closePath(); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.ellipse(-38, -10, 20, 16, 0, 0, Math.PI * 2); ctx.fill();

    // Big googly eyes — Clippy's signature trait — clamp the look offset
    // so they read as comically wide-eyed rather than subtle.
    const eyeY = -14;
    [-44, -30].forEach(ex => {
      if (blink) {
        ctx.strokeStyle = '#bfe6ff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ex - 5, eyeY); ctx.lineTo(ex + 5, eyeY); ctx.stroke();
        return;
      }
      // White of the eye (bigger + rounder than the sleepy kitty look)
      ctx.fillStyle = '#f4fbff';
      ctx.beginPath(); ctx.ellipse(ex, eyeY, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
      // Pupil follows the cursor, clamped inside the white
      const clampedX = Math.max(-3.5, Math.min(3.5, lookX));
      const clampedY = Math.max(-3, Math.min(3, lookY));
      ctx.fillStyle = '#2a2035';
      ctx.beginPath(); ctx.arc(ex + clampedX, eyeY + clampedY, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + clampedX - 1.2, eyeY + clampedY - 1.2, 1.1, 0, Math.PI * 2); ctx.fill();
    });

    // Blush
    ctx.fillStyle = 'rgba(255,150,160,0.5)';
    ctx.beginPath(); ctx.ellipse(-58, -6, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-16, -6, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // Tapping paw — a little "ahem, over here" gesture while idle.
    const tap = Math.max(0, Math.sin(tapPhase)) * 10;
    ctx.fillStyle = '#000000cc';
    ctx.beginPath();
    ctx.ellipse(50, 34 - tap, 8, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (showBubble && rise > 0.85) {
      ctx.globalAlpha = Math.min(1, (rise - 0.85) / 0.15);
      drawSpeechBubble(baseX - 40, baseY - 70, tip);
      ctx.globalAlpha = 1;
    }
  }

  function frame() {
    const w = canvas.width, h = canvas.height;
    const now = performance.now();
    drawSky(w, h);

    const mouseNormX = mouse.active ? (mouse.x / w) * 2 - 1 : 0;
    LAYERS.forEach(layer => drawHillLayer(layer, w, h, now, mouseNormX * 20));

    // Advance the state machine.
    const elapsed = now - phaseStart;
    if (elapsed >= phaseDur) {
      phaseStart = now;
      if (phase === 'hidden') {
        phase = 'rising'; phaseDur = TRANSITION;
        tip = TIPS[Math.floor(Math.random() * TIPS.length)];
      } else if (phase === 'rising') {
        phase = 'idle'; phaseDur = VISIBLE_MIN + Math.random() * (VISIBLE_MAX - VISIBLE_MIN);
      } else if (phase === 'idle') {
        phase = 'hiding'; phaseDur = TRANSITION;
      } else {
        phase = 'hidden'; phaseDur = HIDDEN_MIN + Math.random() * (HIDDEN_MAX - HIDDEN_MIN);
      }
    }

    let rise;
    if (phase === 'hidden') rise = 0;
    else if (phase === 'rising') rise = Math.min(1, elapsed / TRANSITION);
    else if (phase === 'idle') rise = 1;
    else rise = Math.max(0, 1 - elapsed / TRANSITION);

    if (rise > 0.01) {
      const kittyX = w - 110, kittyY = h - 40;
      const lookX = mouse.active ? (mouse.x - kittyX) * 0.03 : Math.sin(now * 0.0004) * 2;
      const lookY = mouse.active ? (mouse.y - kittyY) * 0.03 : 0;

      blinkT -= 1 / 60;
      const blink = blinkT < 0.1;
      if (blinkT < 0) blinkT = 2 + Math.random() * 3;

      drawKitty(w, h, rise, lookX, lookY, now * 0.006, blink, phase === 'idle');
    }

    requestAnimationFrame(frame);
  }
  frame();
}
