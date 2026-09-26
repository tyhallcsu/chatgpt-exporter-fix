//! The userscript this build carries, and the provenance record that came with
//! it.
//!
//! Both are produced by `desktop/scripts/prepare-userscript.mjs`, which builds
//! `dist/chatgpt.user.js` from this repository's source rather than reading the
//! copy committed to `dist/` — a committed artifact is only as fresh as the
//! last `chore: ci build`.

use std::sync::OnceLock;

use serde::Deserialize;
use sha2::{Digest, Sha256};

pub const SOURCE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/userscript/chatgpt-exporter.user.js"
));

const METADATA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/userscript/metadata.json"
));

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub userscript_name: String,
    pub userscript_version: String,
    /// What the build recorded. `actual_sha256()` is what the embedded bytes
    /// really hash to; the app shows the second and flags any disagreement.
    pub userscript_sha256: String,
    pub userscript_bytes: u64,
    pub source_commit: String,
    pub source_commit_short: String,
    pub source_clean: bool,
    pub built_at: String,
}

pub fn metadata() -> &'static Metadata {
    static METADATA: OnceLock<Metadata> = OnceLock::new();
    METADATA.get_or_init(|| {
        serde_json::from_str(METADATA_JSON).expect("userscript/metadata.json is not valid metadata")
    })
}

/// SHA-256 of the bytes this binary will actually serve.
pub fn actual_sha256() -> &'static str {
    static DIGEST: OnceLock<String> = OnceLock::new();
    DIGEST.get_or_init(|| {
        let mut hasher = Sha256::new();
        hasher.update(SOURCE.as_bytes());
        hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    })
}
