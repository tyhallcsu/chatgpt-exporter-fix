// Windows: no console window behind the app in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod browsers;
mod server;
mod userscript;

#[cfg(test)]
#[path = "server_tests.rs"]
mod server_tests;

use std::sync::Mutex;

use serde::Serialize;
use tauri::Manager;

/// Bumped when the desktop packaging changes without the userscript changing.
/// The release tag is `desktop-v{userscript version}.{this}`.
const PACKAGING_REVISION: &str = "1";

const REPO_URL: &str = "https://github.com/tyhallcsu/chatgpt-exporter-fix";
const UPSTREAM_URL: &str = "https://github.com/pionxzh/chatgpt-exporter";

static INSTALL_SERVER: Mutex<Option<server::InstallServer>> = Mutex::new(None);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    packaging_version: String,
    packaging_revision: &'static str,
    userscript_name: &'static str,
    userscript_version: &'static str,
    /// Hash of the bytes this binary will actually serve.
    userscript_sha256: &'static str,
    /// Hash the build recorded. Shown only when it disagrees with the above.
    recorded_sha256: &'static str,
    sha256_matches: bool,
    userscript_bytes: u64,
    source_commit: &'static str,
    source_commit_short: &'static str,
    source_clean: bool,
    built_at: &'static str,
    repo_url: &'static str,
    upstream_url: &'static str,
    os: &'static str,
    arch: &'static str,
    /// Only ever true when the build was handed signing credentials. Nothing in
    /// the app infers this.
    code_signed: bool,
}

#[tauri::command]
fn app_info() -> AppInfo {
    let meta = userscript::metadata();
    let actual = userscript::actual_sha256();

    AppInfo {
        packaging_version: format!("{}.{}", env!("CARGO_PKG_VERSION"), PACKAGING_REVISION),
        packaging_revision: PACKAGING_REVISION,
        userscript_name: &meta.userscript_name,
        userscript_version: &meta.userscript_version,
        userscript_sha256: actual,
        recorded_sha256: &meta.userscript_sha256,
        sha256_matches: actual == meta.userscript_sha256,
        userscript_bytes: meta.userscript_bytes,
        source_commit: &meta.source_commit,
        source_commit_short: &meta.source_commit_short,
        source_clean: meta.source_clean,
        built_at: &meta.built_at,
        repo_url: REPO_URL,
        upstream_url: UPSTREAM_URL,
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        code_signed: option_env!("DESKTOP_BUILD_SIGNED") == Some("true"),
    }
}

/// Starts the loopback server on first use and returns the install URL.
#[tauri::command]
fn install_url() -> Result<String, String> {
    let mut slot = INSTALL_SERVER.lock().map_err(|_| "install server state is poisoned")?;
    if slot.is_none() {
        *slot = Some(server::start(userscript::SOURCE).map_err(|err| {
            format!("could not open a local port for the install URL: {err}")
        })?);
    }
    Ok(slot.as_ref().expect("just populated").url.clone())
}

#[tauri::command]
fn open_install_page(browser_path: Option<String>) -> Result<String, String> {
    let url = install_url()?;
    match browser_path {
        Some(path) => browsers::open_in(&path, &url)?,
        None => tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())?,
    }
    Ok(url)
}

#[tauri::command]
fn detect_browsers() -> Vec<browsers::Browser> {
    browsers::detect()
}

#[tauri::command]
fn userscript_text() -> &'static str {
    userscript::SOURCE
}

/// Writes the bundled script next to the user's other downloads and reveals it,
/// for the case where their manager prefers a local file over a URL.
#[tauri::command]
fn save_to_downloads(app: tauri::AppHandle) -> Result<String, String> {
    let meta = userscript::metadata();
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|err| format!("could not locate a downloads folder: {err}"))?;

    let target = dir.join(format!(
        "chatgpt-exporter-{}.user.js",
        meta.userscript_version
    ));
    std::fs::write(&target, userscript::SOURCE)
        .map_err(|err| format!("could not write {}: {err}", target.display()))?;

    let _ = tauri_plugin_opener::reveal_item_in_dir(&target);
    Ok(target.to_string_lossy().into_owned())
}

/// The webview may only open `https:` links and the install URL — never an
/// arbitrary scheme, path or local program.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let is_install_url = INSTALL_SERVER
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(|server| server.url == url))
        .unwrap_or(false);

    if !url.starts_with("https://") && !is_install_url {
        return Err("only https links can be opened from here".into());
    }
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|err| err.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            install_url,
            open_install_page,
            detect_browsers,
            userscript_text,
            save_to_downloads,
            open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ChatGPT Exporter Desktop");
}
