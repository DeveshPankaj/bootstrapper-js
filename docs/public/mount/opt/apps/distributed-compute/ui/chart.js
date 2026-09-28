// ui/chart.js — a deliberately tiny canvas line chart for the per-epoch loss
// readout. No charting library; this app already has enough scope.
export function drawLossChart(canvas, values) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1a1b1e';
  ctx.fillRect(0, 0, w, h);

  if (!values || values.length === 0) return;

  const pad = 8;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = (max - min) || 1;

  ctx.strokeStyle = '#373a40';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + ((h - 2 * pad) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#4dabf7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + ((w - 2 * pad) * i) / Math.max(1, values.length - 1);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#c1c2c5';
  ctx.font = '10px monospace';
  ctx.fillText(`loss ${values[values.length - 1].toFixed(4)}`, pad + 2, pad + 10);
  ctx.fillText(`min ${min.toFixed(4)} / max ${max.toFixed(4)}`, pad + 2, h - pad - 2);
}
