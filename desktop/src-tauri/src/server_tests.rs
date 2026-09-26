//! End-to-end checks against a really-listening loopback server.
//!
//! These exist because the install path is the one thing the app does that a
//! user cannot verify by looking at the window: the userscript manager, not the
//! person, is what reads this response.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::sync::OnceLock;

use super::server;

const BODY: &str = "// ==UserScript==\n// @name Test\n// ==/UserScript==\nconsole.log(1)\n";

fn running() -> &'static server::InstallServer {
    static SERVER: OnceLock<server::InstallServer> = OnceLock::new();
    SERVER.get_or_init(|| server::start(BODY).expect("server should bind to loopback"))
}

/// `(host, port, path)` split out of the install URL.
fn parts() -> (String, String) {
    let url = running().url.clone();
    let rest = url.strip_prefix("http://").expect("loopback http url");
    let (authority, path) = rest.split_once('/').expect("url has a path");
    (authority.to_string(), format!("/{path}"))
}

fn request(raw: &str) -> (String, Vec<u8>) {
    let (authority, _) = parts();
    let mut stream = TcpStream::connect(&authority).expect("connect to the server");
    stream.write_all(raw.as_bytes()).expect("send request");
    stream.flush().expect("flush request");

    let mut reader = BufReader::new(stream);
    let mut status = String::new();
    reader.read_line(&mut status).expect("read status line");

    let mut headers = String::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).expect("read header line");
        if line == "\r\n" || line.is_empty() {
            break;
        }
        headers.push_str(&line);
    }

    let mut body = Vec::new();
    reader.read_to_end(&mut body).expect("read body");
    (format!("{status}{headers}"), body)
}

#[test]
fn serves_the_bundled_script_at_its_own_path() {
    let (authority, path) = parts();
    let (head, body) = request(&format!(
        "GET {path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n"
    ));

    assert!(head.starts_with("HTTP/1.1 200 OK"), "unexpected status: {head}");
    assert!(head.contains("Content-Type: text/javascript"), "missing js content type: {head}");
    assert!(head.contains("X-Content-Type-Options: nosniff"), "missing nosniff: {head}");
    assert_eq!(body, BODY.as_bytes());
}

#[test]
fn binds_loopback_and_ends_in_user_js() {
    let url = running().url.clone();
    assert!(url.starts_with("http://127.0.0.1:"), "not loopback: {url}");
    // Userscript managers key their install prompt off this suffix.
    assert!(url.ends_with("/chatgpt-exporter.user.js"), "not a userscript url: {url}");
}

#[test]
fn head_returns_headers_without_a_body() {
    let (authority, path) = parts();
    let (head, body) = request(&format!(
        "HEAD {path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n"
    ));

    assert!(head.starts_with("HTTP/1.1 200 OK"), "unexpected status: {head}");
    assert!(head.contains(&format!("Content-Length: {}", BODY.len())));
    assert!(body.is_empty(), "HEAD must not carry a body");
}

#[test]
fn a_guessed_path_is_not_served() {
    let (authority, _) = parts();
    for target in [
        "/chatgpt-exporter.user.js",
        "/",
        "/../chatgpt-exporter.user.js",
        "/0000000000000000/chatgpt-exporter.user.js",
    ] {
        let (head, body) = request(&format!(
            "GET {target} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n"
        ));
        assert!(head.starts_with("HTTP/1.1 404"), "{target} was served: {head}");
        assert!(body.is_empty());
    }
}

#[test]
fn a_query_string_does_not_defeat_the_path_match() {
    let (authority, path) = parts();
    let (head, body) = request(&format!(
        "GET {path}?v=1 HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n"
    ));
    assert!(head.starts_with("HTTP/1.1 200 OK"), "unexpected status: {head}");
    assert_eq!(body, BODY.as_bytes());
}

#[test]
fn writing_methods_are_refused() {
    let (authority, path) = parts();
    let (head, _) = request(&format!(
        "POST {path} HTTP/1.1\r\nHost: {authority}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    ));
    assert!(head.starts_with("HTTP/1.1 405"), "unexpected status: {head}");
}
