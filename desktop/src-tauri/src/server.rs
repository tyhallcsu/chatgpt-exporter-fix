//! A single-file HTTP server on the loopback interface.
//!
//! Userscript managers install a script when the browser *navigates* to a URL
//! whose path ends in `.user.js`; they cannot be written to from outside the
//! browser, and this app does not try. Serving the bundled script from
//! `127.0.0.1` and opening that URL is the supported install path, and it is
//! the whole reason this server exists.
//!
//! Deliberate limits:
//! * bound to `127.0.0.1` only — never `0.0.0.0`, so nothing off-machine can
//!   reach it;
//! * an ephemeral port plus a random path segment, so the URL is not guessable
//!   by another local process;
//! * exactly one path is answered, compared by equality, so no traversal is
//!   possible; everything else is a 404;
//! * `GET` and `HEAD` only;
//! * read/write timeouts, and a capped request-line length, so a stuck client
//!   cannot pin the thread;
//! * it holds no state, reads nothing from disk, and dies with the process.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const IO_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REQUEST_LINE: u64 = 8 * 1024;

pub struct InstallServer {
    pub url: String,
}

pub fn start(body: &'static str) -> std::io::Result<InstallServer> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    let port = listener.local_addr()?.port();
    let path = format!("/{}/chatgpt-exporter.user.js", random_token());
    let url = format!("http://127.0.0.1:{port}{path}");

    thread::Builder::new()
        .name("userscript-install-server".into())
        .spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { continue };
                // Serial handling is fine: a manager makes one or two requests,
                // and both ends carry timeouts.
                let _ = handle(stream, &path, body);
            }
        })?;

    Ok(InstallServer { url })
}

fn handle(mut stream: TcpStream, expected_path: &str, body: &'static str) -> std::io::Result<()> {
    stream.set_read_timeout(Some(IO_TIMEOUT))?;
    stream.set_write_timeout(Some(IO_TIMEOUT))?;

    let mut request_line = String::new();
    BufReader::new(stream.try_clone()?)
        .take(MAX_REQUEST_LINE)
        .read_line(&mut request_line)?;

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();

    // Query strings and fragments are not part of the match.
    let path = target
        .split(['?', '#'])
        .next()
        .unwrap_or_default();

    let allowed_method = matches!(method, "GET" | "HEAD");
    if !allowed_method || path != expected_path {
        let status = if allowed_method { "404 Not Found" } else { "405 Method Not Allowed" };
        write!(
            stream,
            "HTTP/1.1 {status}\r\n\
             Content-Length: 0\r\n\
             Cache-Control: no-store\r\n\
             Connection: close\r\n\r\n"
        )?;
        return stream.flush();
    }

    write!(
        stream,
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/javascript; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store\r\n\
         X-Content-Type-Options: nosniff\r\n\
         Connection: close\r\n\r\n",
        body.len()
    )?;
    if method == "GET" {
        stream.write_all(body.as_bytes())?;
    }
    stream.flush()
}

/// 128 bits from the OS-seeded hasher state `std` already maintains, which
/// avoids pulling in a randomness crate for a path segment.
fn random_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or_default();

    (0..2)
        .map(|i| {
            let mut hasher = RandomState::new().build_hasher();
            hasher.write_u64(nanos ^ i);
            format!("{:016x}", hasher.finish())
        })
        .collect()
}
