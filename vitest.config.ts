import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@layout': path.resolve(__dirname, 'src/core/layout'),
            '@modules': path.resolve(__dirname, 'src/modules'),
        },
    },
})
