// Example canvas wallpaper — animated plasma waves.
// A canvas wallpaper script must export a `render(canvas)` function; the
// canvas is already sized to the full screen and kept in sync on resize.
// Pick this file via Settings → Wallpaper → "Canvas Script...".

export function render(canvas) {
  const ctx = canvas.getContext('2d');
  const t0 = performance.now();

  function frame() {
    const t = (performance.now() - t0) / 1000;
    const w = canvas.width, h = canvas.height;

    const img = ctx.createImageData(w, h);
    const data = img.data;
    // Downsampled plasma field, upscaled with drawImage for performance —
    // computing this per-pixel at full resolution every frame would be
    // far too slow for a wallpaper running continuously in the background.
    const step = 4;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const v =
          Math.sin(x * 0.01 + t * 0.6) +
          Math.sin(y * 0.013 - t * 0.4) +
          Math.sin((x + y) * 0.008 + t * 0.5) +
          Math.sin(Math.sqrt(x * x + y * y) * 0.01 - t * 0.8);
        const r = Math.floor(128 + 100 * Math.sin(v * Math.PI * 0.5));
        const g = Math.floor(128 + 100 * Math.sin(v * Math.PI * 0.5 + 2.0));
        const b = Math.floor(160 + 90 * Math.sin(v * Math.PI * 0.5 + 4.2));
        for (let dy = 0; dy < step && y + dy < h; dy++) {
          for (let dx = 0; dx < step && x + dx < w; dx++) {
            const i = ((y + dy) * w + (x + dx)) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    requestAnimationFrame(frame);
  }
  frame();
}
