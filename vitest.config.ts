import preact from '@preact/preset-vite'
import { defineConfig } from 'vitest/config'

// Most tests target plain modules, but the dialog's list-load lifecycle is only
// observable by rendering the component, which needs the JSX transform and the
// react -> preact/compat aliasing. The aliases are spelled out because Vitest
// resolves externalised dependencies without consulting plugin aliases, and
// `react-i18next` is inlined so it picks up preact's hooks rather than React's.
// `vite-plugin-monkey` stays out: the modules that import it are mocked per test.
export default defineConfig({
    plugins: [
        preact({
            devToolsEnabled: false,
            devtoolsInProd: false,
        }),
    ],
    resolve: {
        alias: {
            'react/jsx-runtime': 'preact/jsx-runtime',
            'react-dom/test-utils': 'preact/test-utils',
            'react-dom': 'preact/compat',
            'react': 'preact/compat',
        },
    },
    test: {
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        server: {
            deps: {
                inline: ['react-i18next', '@radix-ui/react-dialog'],
            },
        },
    },
})
