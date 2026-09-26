//! Which browsers are installed, and how to hand one a URL.
//!
//! This is an existence check against a fixed list of well-known install
//! locations, and nothing else. It never opens a browser profile, a cookie
//! store, a preferences file or an extension directory, so it cannot tell you
//! which userscript manager is installed — only which browser is. That is a
//! deliberate limit, not an omission: reading a profile to detect Tampermonkey
//! would cross exactly the boundary this app promises not to cross.

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Browser {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// `(id, display name, candidate paths)` — ordered by how likely the browser is
/// to be carrying a userscript manager.
#[cfg(target_os = "macos")]
const CANDIDATES: &[(&str, &str, &[&str])] = &[
    ("chrome", "Google Chrome", &["/Applications/Google Chrome.app"]),
    ("edge", "Microsoft Edge", &["/Applications/Microsoft Edge.app"]),
    ("brave", "Brave Browser", &["/Applications/Brave Browser.app"]),
    ("firefox", "Firefox", &["/Applications/Firefox.app"]),
    ("vivaldi", "Vivaldi", &["/Applications/Vivaldi.app"]),
    ("opera", "Opera", &["/Applications/Opera.app"]),
    ("arc", "Arc", &["/Applications/Arc.app"]),
];

#[cfg(target_os = "windows")]
const CANDIDATES: &[(&str, &str, &[&str])] = &[
    ("chrome", "Google Chrome", &[
        r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
        r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
        r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
    ]),
    ("edge", "Microsoft Edge", &[
        r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
        r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
    ]),
    ("brave", "Brave Browser", &[
        r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe",
        r"%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe",
        r"%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe",
    ]),
    ("firefox", "Firefox", &[
        r"%ProgramFiles%\Mozilla Firefox\firefox.exe",
        r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe",
    ]),
    ("vivaldi", "Vivaldi", &[
        r"%LocalAppData%\Vivaldi\Application\vivaldi.exe",
        r"%ProgramFiles%\Vivaldi\Application\vivaldi.exe",
    ]),
    ("opera", "Opera", &[
        r"%LocalAppData%\Programs\Opera\opera.exe",
        r"%ProgramFiles%\Opera\opera.exe",
    ]),
];

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const CANDIDATES: &[(&str, &str, &[&str])] = &[];

pub fn detect() -> Vec<Browser> {
    CANDIDATES
        .iter()
        .filter_map(|(id, name, paths)| {
            paths.iter().find_map(|raw| {
                let path = expand(raw);
                path.exists().then(|| Browser {
                    id: (*id).to_string(),
                    name: (*name).to_string(),
                    path: path.to_string_lossy().into_owned(),
                })
            })
        })
        .collect()
}

/// Opens `url` in a specific installed browser. The path must be one this
/// module itself reported, so the frontend cannot ask for an arbitrary
/// executable to be run.
pub fn open_in(path: &str, url: &str) -> Result<(), String> {
    let known = detect().into_iter().any(|browser| browser.path == path);
    if !known {
        return Err("that browser is not one of the detected installs".into());
    }

    let spawned = if cfg!(target_os = "macos") {
        Command::new("/usr/bin/open").args(["-a", path, url]).spawn()
    } else {
        Command::new(path).arg(url).spawn()
    };

    spawned.map(|_| ()).map_err(|err| err.to_string())
}

/// Expands `%VAR%` placeholders. An unset variable yields `None` rather than an
/// empty string, because `""\Google\Chrome\…` would be a path rooted at the
/// drive and could match something unintended.
fn expand(raw: &str) -> PathBuf {
    if !raw.contains('%') {
        return PathBuf::from(raw);
    }

    let mut out = String::with_capacity(raw.len());
    // Splitting on '%' alternates literal, variable, literal, variable, …
    for (index, piece) in raw.split('%').enumerate() {
        if index % 2 == 0 {
            out.push_str(piece);
            continue;
        }
        match std::env::var(piece) {
            Ok(value) if !value.is_empty() => out.push_str(&value),
            _ => return PathBuf::new(),
        }
    }
    PathBuf::from(out)
}
