// Ambient color extraction — samples the active wallpaper (image or CSS
// gradient) for its dominant color, and exposes it as CSS custom
// properties (--ambient-bg, --ambient-fg, --ambient-blur) that adaptive UI
// surfaces (currently just the context menu, see styles/contextmenu.ts)
// read with a fixed fallback, so nothing looks broken before the async
// sample resolves or if it fails (e.g. a tainted canvas from a
// cross-origin wallpaper URL with no CORS headers).
import { isCssGradient } from './styles/layout'

let requestId = 0

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
    r /= 255; g /= 255; b /= 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0
    const l = (max + min) / 2
    const d = max - min
    if (d !== 0) {
        s = d / (1 - Math.abs(2 * l - 1))
        switch (max) {
            case r: h = ((g - b) / d) % 6; break
            case g: h = (b - r) / d + 2; break
            default: h = (r - g) / d + 4
        }
        h *= 60
        if (h < 0) h += 360
    }
    return [h, s, l]
}

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    let r = 0, g = 0, b = 0
    if (h < 60) { r = c; g = x; b = 0 }
    else if (h < 120) { r = x; g = c; b = 0 }
    else if (h < 180) { r = 0; g = c; b = x }
    else if (h < 240) { r = 0; g = x; b = c }
    else if (h < 300) { r = x; g = 0; b = c }
    else { r = c; g = 0; b = x }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// Resolves any valid CSS color string to [r,g,b] via the browser's own CSS
// engine (handles hex/rgb/rgba/hsl/named colors uniformly) rather than
// hand-parsing every format. Takes `doc` explicitly (see updateAmbientColor)
// rather than using the bare global `document` - this module runs inside
// the layout bundle's own hidden module-loader iframe, a different
// document than the visible top-level page, so getComputedStyle would
// resolve against the wrong (invisible, styleless) document otherwise.
const cssColorToRgb = (doc: Document, color: string): [number, number, number] | null => {
    const el = doc.createElement('div')
    el.style.color = color
    doc.body.appendChild(el)
    const computed = doc.defaultView!.getComputedStyle(el).color
    doc.body.removeChild(el)
    const m = computed.match(/[\d.]+/g)
    if (!m || m.length < 3) return null
    return [Math.round(+m[0]), Math.round(+m[1]), Math.round(+m[2])]
}

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// Downsamples an image (loaded from a same-origin/blob URL — see
// resolveWallpaperUrl in index.tsx, which already converts vfs `/(sw)/...`
// wallpapers to blob: URLs before this ever sees them) to a small grid and
// averages pixel color + measures luminance variance ("business" of the
// image, used to pick a blur amount). Rejects if the canvas ends up
// tainted (a cross-origin wallpaper URL with no CORS headers) — callers
// must catch and fall back.
const sampleImage = (url: string): Promise<{ rgb: [number, number, number]; variance: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            try {
                const size = 24
                const canvas = document.createElement('canvas')
                canvas.width = size
                canvas.height = size
                const ctx = canvas.getContext('2d')!
                ctx.drawImage(img, 0, 0, size, size)
                const { data } = ctx.getImageData(0, 0, size, size)
                let r = 0, g = 0, b = 0
                const lums: number[] = []
                const count = data.length / 4
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i]; g += data[i + 1]; b += data[i + 2]
                    lums.push(luminance(data[i], data[i + 1], data[i + 2]))
                }
                r /= count; g /= count; b /= count
                const meanLum = lums.reduce((a, v) => a + v, 0) / lums.length
                const variance = lums.reduce((a, v) => a + (v - meanLum) ** 2, 0) / lums.length
                resolve({ rgb: [r, g, b], variance })
            } catch (err) {
                reject(err)
            }
        }
        img.onerror = () => reject(new Error('failed to load wallpaper image for ambient sampling'))
        img.src = url
    })
}

// Averages every color stop found in a CSS gradient string.
const sampleGradient = (doc: Document, gradient: string): { rgb: [number, number, number]; variance: number } | null => {
    const matches = gradient.match(/rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}\b/g)
    if (!matches || !matches.length) return null
    const colors = matches.map(c => cssColorToRgb(doc, c)).filter((c): c is [number, number, number] => c !== null)
    if (!colors.length) return null
    const r = colors.reduce((a, c) => a + c[0], 0) / colors.length
    const g = colors.reduce((a, c) => a + c[1], 0) / colors.length
    const b = colors.reduce((a, c) => a + c[2], 0) / colors.length
    const lums = colors.map(c => luminance(c[0], c[1], c[2]))
    const meanLum = lums.reduce((a, v) => a + v, 0) / lums.length
    const variance = lums.reduce((a, v) => a + (v - meanLum) ** 2, 0) / lums.length
    return { rgb: [r, g, b], variance }
}

// Neutral fallback for canvas wallpapers (live JS-rendered, behind a
// sandboxed cross-origin iframe with no pixel access from here) and for
// anything that fails to sample (tainted canvas, network error, etc.).
const FALLBACK: { rgb: [number, number, number]; variance: number } = { rgb: [30, 32, 38], variance: 600 }

const applyAmbient = (doc: Document, rgb: [number, number, number], variance: number) => {
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2])
    // Keep the wallpaper's hue/saturation, but clamp lightness into a band
    // that stays legible as a translucent menu material regardless of how
    // dark or bright the source is — mirrors how macOS/iOS "vibrancy"
    // materials bias toward usable contrast rather than reproducing the
    // backdrop exactly.
    const clampedL = clamp(l, 0.22, 0.62)
    const [br, bg, bb] = hslToRgb(h, clamp(s, 0, 0.55), clampedL)

    const bgLuminance = luminance(br, bg, bb)
    const fg = bgLuminance > 150 ? '#111318' : '#f5f6f8'

    // More "business"/detail in the sampled wallpaper -> more blur, to
    // soften it into a calmer backdrop for menu text; a flat/plain
    // wallpaper needs less blur to still read as intentional depth rather
    // than a fog. 600 is a representative variance for a fairly busy photo.
    const blur = clamp(12 + (variance / 600) * 16, 10, 28)

    const root = doc.documentElement.style
    root.setProperty('--ambient-bg', `rgba(${br}, ${bg}, ${bb}, 0.35)`)
    root.setProperty('--ambient-fg', fg)
    root.setProperty('--ambient-blur', `${blur.toFixed(0)}px`)
}

// Called from applyCss() (src/core/layout/index.tsx) every time the
// wallpaper changes, and once at boot. `doc` must be platform.window.document
// (the actual visible top-level page) - this module is bundled into the
// layout bundle, which loads inside its own hidden module-loader iframe, so
// the bare global `document` here would silently resolve to that invisible
// iframe's own (styleless, non-rendered) document instead - the same
// "bare document inside the layout bundle resolves to the wrong iframe"
// gotcha documented elsewhere in index.tsx (see windowsSubject.subscribe).
// `wallpaper` is the raw preference value (may be `canvas:...`, a CSS
// gradient, or an image URL/path); `resolvedImageUrl` is only meaningful
// for the image case and should already be resolveWallpaperUrl()'d (blob:
// for vfs wallpapers) so same-origin sampling works without a CORS round-trip.
export const updateAmbientColor = async (doc: Document, wallpaper: string, resolvedImageUrl: string) => {
    const myRequestId = ++requestId
    const commit = (rgb: [number, number, number], variance: number) => {
        if (myRequestId !== requestId) return // a newer wallpaper change superseded this one
        applyAmbient(doc, rgb, variance)
    }

    if (wallpaper.startsWith('canvas:')) {
        commit(FALLBACK.rgb, FALLBACK.variance)
        return
    }
    if (isCssGradient(wallpaper) || wallpaper === 'none') {
        const sampled = wallpaper === 'none' ? null : sampleGradient(doc, wallpaper)
        commit(sampled?.rgb ?? FALLBACK.rgb, sampled?.variance ?? FALLBACK.variance)
        return
    }
    try {
        const { rgb, variance } = await sampleImage(resolvedImageUrl)
        commit(rgb, variance)
    } catch (err) {
        console.warn('[ambient-color] failed to sample wallpaper, using fallback', err)
        commit(FALLBACK.rgb, FALLBACK.variance)
    }
}
