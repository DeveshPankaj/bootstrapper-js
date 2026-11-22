// Appearance: light or dark, for apps drawn on the glass material (Settings,
// Files) and for the glass window material itself.
//
// The user picks a mode in Settings › Window Manager › Themes:
//   system — follow the OS (prefers-color-scheme), the default
//   dark / light — fixed
//   time — light from 07:00 to 19:00 (local time), dark otherwise
// The mode lives in /user-preferences.json (`appearance_mode`). This resolves it,
// publishes the result on `host.appearance$`, and sets `data-appearance` on the
// desktop document (window.ts styles `.window.material-glass` per appearance).
// Apps set the same attribute on their own document from `appearance$`.
import type { Appearance, AppearanceMode, Host } from '@shared/index'
import { APPEARANCE_MODES } from '@shared/index'

const PREFS_PATH = '/user-preferences.json'
const PREF_KEY = 'appearance_mode'
export const DAY_START_HOUR = 7
export const DAY_END_HOUR = 19

const isMode = (v: unknown): v is AppearanceMode => typeof v === 'string' && (APPEARANCE_MODES as readonly string[]).includes(v)

export const resolveAppearance = (mode: AppearanceMode, prefersDark: boolean, now: Date = new Date()): Appearance => {
  if (mode === 'dark' || mode === 'light') return mode
  if (mode === 'time') {
    const h = now.getHours()
    return h >= DAY_START_HOUR && h < DAY_END_HOUR ? 'light' : 'dark'
  }
  return prefersDark ? 'dark' : 'light'
}

export function startAppearance(host: Host, win: Window = window): void {
  const fs = host.getFS()
  const media = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: dark)') : null

  const readPrefs = (): Record<string, unknown> => {
    try { return JSON.parse(String(fs.readFileSync(PREFS_PATH, 'utf8')) || '{}') || {} } catch (_) { return {} }
  }
  const readMode = (): AppearanceMode => {
    const v = readPrefs()[PREF_KEY]
    return isMode(v) ? v : 'system'
  }

  let mode = readMode()
  const apply = () => {
    const resolved = resolveAppearance(mode, !!media?.matches)
    win.document.documentElement.setAttribute('data-appearance', resolved)
    host.setAppearance(resolved)
  }
  apply()

  media?.addEventListener?.('change', () => { if (mode === 'system') apply() })
  // Time mode flips at the hour; checking each minute keeps it within a minute.
  win.setInterval(() => { if (mode === 'time') apply() }, 60_000)

  host.registerCommand('get-appearance-mode', () => ({ mode, appearance: host.getAppearance() }))
  host.registerCommand('set-appearance-mode', (next: unknown) => {
    if (!isMode(next)) return false
    mode = next
    try {
      const prefs = readPrefs()
      prefs[PREF_KEY] = next
      fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2))
    } catch (err) {
      console.error('[appearance] could not save the mode:', err)
    }
    apply()
    return true
  })
}
