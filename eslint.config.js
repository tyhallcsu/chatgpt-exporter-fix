import { pionxzh } from '@pionxzh/eslint-config'

export default pionxzh(
    {
        typescript: true,
        react: true,
        vue: false,
        yaml: false,
        // `desktop/` is the packaging project, not the userscript: plain
        // browser JS against `window.__TAURI__`, Node build scripts and a Rust
        // crate. It is linted by its own toolchain, not by the exporter's
        // React-flavoured config.
        ignores: ['*.md', '.release-please-manifest.json', 'desktop/**'],
    },
    {
        rules: {
            'no-alert': 'off',
            'ts/no-empty-object-type': 'off',
            'node/prefer-global/process': 'off',
            // Splitting JSX text into separate children changes the emitted
            // bundle for no runtime benefit.
            'style/jsx-one-expression-per-line': 'off',
            // Buttons here never live inside a <form>, so the implicit submit
            // type is harmless.
            'react-dom/no-missing-button-type': 'off',
            // Userscript bundle, no fast refresh.
            'react-refresh/only-export-components': 'off',
        },
    },
)
