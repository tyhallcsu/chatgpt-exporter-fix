use std::path::Path;

/// The userscript is embedded with `include_str!`, which fails with an opaque
/// message when the staging directory is missing. Check for it first and say
/// what to run instead.
fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let staged = Path::new(&manifest_dir).join("userscript");

    for file in ["chatgpt-exporter.user.js", "metadata.json"] {
        let path = staged.join(file);
        if !path.exists() {
            panic!(
                "missing {}\n\n\
                 The desktop app embeds a userscript built from this repository's own source.\n\
                 Run `pnpm run prepare:userscript` in the `desktop/` directory first\n\
                 (or just `pnpm run build`, which does it for you).\n",
                path.display()
            );
        }
        println!("cargo:rerun-if-changed={}", path.display());
    }

    // `main.rs` reads this with `option_env!` to decide whether it may say the
    // build is signed. Rebuild when it changes so a signed build can never
    // inherit an unsigned binary from the cache.
    println!("cargo:rerun-if-env-changed=DESKTOP_BUILD_SIGNED");

    tauri_build::build()
}
