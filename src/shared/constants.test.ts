import { describe, it, expect } from 'vitest'
import * as constants from './constants'

describe('constants', () => {
    it('all path constants are non-empty strings starting with /', () => {
        const pathConstants = [
            'LAYOUTS_PATH', 'LAYOUT_CONFIG_PATH', 'WM_CURRENT_PATH',
            'WM_THEMES_DIR', 'WM_DEFAULT_THEME_PATH', 'WM_DIR',
            'DESKTOPS_CONFIG_PATH', 'PROC_DIR', 'WINDOW_MANAGER_MODULE_PATH',
            'KEYBINDINGS_FILE', 'WIDGETS_DIR', 'WIDGET_POSITIONS_PATH',
            'WIDGETS_CONFIG_PATH', 'DESKTOP_PATH',
        ] as const

        for (const name of pathConstants) {
            const value = (constants as any)[name]
            expect(value, `${name} should be a non-empty string`).toBeTruthy()
            expect(typeof value, `${name} should be a string`).toBe('string')
            expect(value[0], `${name} should start with /`).toBe('/')
        }
    })

    it('SW_CACHE_NAME is a non-empty string', () => {
        expect(constants.SW_CACHE_NAME).toBeTruthy()
        expect(typeof constants.SW_CACHE_NAME).toBe('string')
    })

    it('FS_BACKEND constants are non-empty strings', () => {
        expect(constants.FS_BACKEND_STORAGE_KEY).toBeTruthy()
        expect(constants.FS_BACKEND_QUERY_PARAM).toBeTruthy()
    })
})
