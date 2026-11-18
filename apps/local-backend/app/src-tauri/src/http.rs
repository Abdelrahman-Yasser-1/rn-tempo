//! Talks to a running dev API on this machine. The webview never makes these requests itself: a
//! webview does not trust a mkcert CA that is missing from the system store. Here the request is made
//! with `reqwest`, which trusts exactly the project's own `rootCA.pem` and nothing else. Certificate
//! checks stay on.

use std::path::Path;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::project::Connection;

pub const CONTROL_HEADER: &str = "x-tempo-token";
const ALLOWED_METHODS: [&str; 5] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
/// The only request headers the UI may set. The control token is added here, never by the UI.
const ALLOWED_HEADERS: [&str; 4] = [
    "content-type",
    "authorization",
    "accept",
    "x-tempo-scenario",
];
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
pub struct HttpRequest {
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpReply {
    pub status: u16,
    pub body: String,
    pub ms: u64,
    pub content_type: Option<String>,
}

/// A path for the fixed host: one leading slash, no scheme, no whitespace or control characters.
pub fn valid_path(path: &str) -> bool {
    path.starts_with('/')
        && !path.starts_with("//")
        && !path.contains('\\')
        && !path.contains("://")
        && path.chars().all(|c| !c.is_control() && c != ' ')
}

pub fn base_url(conn: &Connection) -> String {
    format!(
        "{}://127.0.0.1:{}",
        if conn.https { "https" } else { "http" },
        conn.port
    )
}

/// A client for one server. Over HTTPS it trusts only the project CA; if that file is missing the
/// error says how to create it, rather than falling back to anything weaker.
pub fn client(conn: &Connection, timeout: Option<Duration>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(3));
    if let Some(timeout) = timeout {
        builder = builder.timeout(timeout);
    }
    if conn.https {
        builder = builder.tls_certs_only([read_ca(&conn.ca)?]);
    }
    builder
        .build()
        .map_err(|error| format!("Could not set up the connection: {error}"))
}

fn read_ca(path: &Path) -> Result<reqwest::Certificate, String> {
    let pem = std::fs::read(path)
        .map_err(|_| "This server uses HTTPS but the project has no CA file yet. Create the certificate on the Certificates screen.".to_string())?;
    let invalid = || "The project's rootCA.pem is not a valid certificate.".to_string();
    if !String::from_utf8_lossy(&pem).contains("-----BEGIN CERTIFICATE-----") {
        return Err(invalid());
    }
    reqwest::Certificate::from_pem(&pem).map_err(|_| invalid())
}

/// Sends one request to the server in `conn`.
pub async fn send(conn: &Connection, request: HttpRequest) -> Result<HttpReply, String> {
    let method = request.method.to_ascii_uppercase();
    if !ALLOWED_METHODS.contains(&method.as_str()) {
        return Err(format!("{method} is not an allowed method."));
    }
    if !valid_path(&request.path) {
        return Err("That request path is not allowed.".to_string());
    }
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_BODY_BYTES)
    {
        return Err("The request body is too large.".to_string());
    }
    let http_method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "Bad method.".to_string())?;
    let url = format!("{}{}", base_url(conn), request.path);
    let mut builder = client(conn, Some(Duration::from_secs(30)))?.request(http_method, url);
    for (name, value) in &request.headers {
        if ALLOWED_HEADERS.contains(&name.to_ascii_lowercase().as_str()) {
            builder = builder.header(name.as_str(), value.as_str());
        }
    }
    if request.path.starts_with("/__tempo/") {
        if let Some(token) = &conn.token {
            builder = builder.header(CONTROL_HEADER, token.as_str());
        }
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let started = Instant::now();
    let response = builder.send().await.map_err(describe_error)?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = response.bytes().await.map_err(describe_error)?;
    if bytes.len() > MAX_BODY_BYTES {
        return Err("The response is too large to show.".to_string());
    }
    Ok(HttpReply {
        status,
        body: String::from_utf8_lossy(&bytes).into_owned(),
        ms: u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
        content_type,
    })
}

/// A short reason for a failed request, without the URL or any header.
pub fn describe_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "The server did not answer in time.".to_string()
    } else if error.is_connect() {
        "Could not connect to the server. Is it running, and does the certificate match?"
            .to_string()
    } else {
        "The request failed.".to_string()
    }
}

/// `true` when the server answers `/__tempo/health` as the dev API with this pid.
pub async fn is_dev_api(conn: &Connection) -> bool {
    let Ok(client) = client(conn, Some(Duration::from_secs(2))) else {
        return false;
    };
    let Ok(response) = client
        .get(format!("{}/__tempo/health", base_url(conn)))
        .send()
        .await
    else {
        return false;
    };
    if !response.status().is_success() {
        return false;
    }
    let Ok(bytes) = response.bytes().await else {
        return false;
    };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return false;
    };
    value.get("service").and_then(|v| v.as_str()) == Some("tempo-dev-api")
        && value.get("pid").and_then(serde_json::Value::as_u64) == Some(u64::from(conn.pid))
}

/// One server-sent event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseMessage {
    pub id: Option<String>,
    pub event: String,
    pub data: String,
}

/// Splits a byte stream into server-sent events. Chunks may cut anywhere, including inside a
/// multi-byte character, so it buffers bytes and decodes only whole events.
#[derive(Debug, Default)]
pub struct SseParser {
    buffer: Vec<u8>,
}

impl SseParser {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<SseMessage> {
        self.buffer.extend_from_slice(chunk);
        let mut messages = Vec::new();
        while let Some(end) = find_blank_line(&self.buffer) {
            let block: Vec<u8> = self.buffer.drain(..end.0 + end.1).take(end.0).collect();
            if let Some(message) = parse_block(&String::from_utf8_lossy(&block)) {
                messages.push(message);
            }
        }
        messages
    }
}

/// Position of the first blank line and its length (`\n\n`, or with `\r`).
fn find_blank_line(buffer: &[u8]) -> Option<(usize, usize)> {
    let mut i = 0;
    while i < buffer.len() {
        if buffer[i..].starts_with(b"\r\n\r\n") {
            return Some((i, 4));
        }
        if buffer[i..].starts_with(b"\n\n") {
            return Some((i, 2));
        }
        i += 1;
    }
    None
}

fn parse_block(block: &str) -> Option<SseMessage> {
    let mut id = None;
    let mut event = "message".to_string();
    let mut data: Vec<&str> = Vec::new();
    for line in block.lines() {
        if line.starts_with(':') || line.is_empty() {
            continue; // a comment such as the keep-alive line
        }
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "id" => id = Some(value.to_string()),
            "event" => event = value.to_string(),
            "data" => data.push(value),
            _ => {}
        }
    }
    (!data.is_empty()).then(|| SseMessage {
        id,
        event,
        data: data.join("\n"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_plain_paths() {
        for ok in ["/", "/__tempo/info", "/products/1?q=a%20b", "/a#frag"] {
            assert!(valid_path(ok), "{ok}");
        }
        for bad in [
            "",
            "no-slash",
            "//evil.example/x",
            "/x://y",
            "/a b",
            "/a\nb",
            "/a\\b",
            "http://x",
        ] {
            assert!(!valid_path(bad), "{bad:?}");
        }
    }

    #[test]
    fn builds_loopback_urls() {
        let conn = Connection {
            port: 8555,
            https: true,
            token: None,
            ca: "x".into(),
            pid: 1,
        };
        assert_eq!(base_url(&conn), "https://127.0.0.1:8555");
        assert_eq!(
            base_url(&Connection {
                https: false,
                ..conn
            }),
            "http://127.0.0.1:8555"
        );
    }

    #[test]
    fn https_without_a_ca_file_is_a_clear_error() {
        let conn = Connection {
            port: 1,
            https: true,
            token: None,
            ca: "/does/not/exist.pem".into(),
            pid: 1,
        };
        let error = client(&conn, None).unwrap_err();
        assert!(error.contains("Certificates"));
    }

    #[test]
    fn https_with_garbage_in_the_ca_file_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let ca = dir.path().join("rootCA.pem");
        std::fs::write(&ca, "not a certificate").unwrap();
        let conn = Connection {
            port: 1,
            https: true,
            token: None,
            ca,
            pid: 1,
        };
        assert!(client(&conn, None).is_err());
    }

    #[test]
    fn rejects_unknown_methods_before_connecting() {
        let conn = Connection {
            port: 1,
            https: false,
            token: None,
            ca: "x".into(),
            pid: 1,
        };
        let request = HttpRequest {
            method: "CONNECT".into(),
            path: "/".into(),
            headers: vec![],
            body: None,
        };
        let error = tauri::async_runtime::block_on(send(&conn, request)).unwrap_err();
        assert!(error.contains("not an allowed method"));
    }

    #[test]
    fn parses_events_split_across_chunks() {
        let mut parser = SseParser::default();
        assert!(parser.push(b"retry: 2000\n\nid: 1\nevent: req").is_empty());
        let messages = parser.push(
            b"uest\ndata: {\"a\":1}\n\n: keep-alive\n\nid: 2\nevent: request\ndata: {\"a\":2}\n\n",
        );
        let ids: Vec<_> = messages.iter().filter_map(|m| m.id.clone()).collect();
        assert_eq!(ids, ["1", "2"]);
        assert_eq!(messages[0].event, "request");
        assert_eq!(messages[1].data, "{\"a\":2}");
    }

    #[test]
    fn keeps_multibyte_text_whole_across_a_cut() {
        let mut parser = SseParser::default();
        let bytes = "id: 1\nevent: request\ndata: \"é\"\n\n".as_bytes();
        let cut = bytes.iter().position(|b| *b == 0xC3).unwrap() + 1;
        assert!(parser.push(&bytes[..cut]).is_empty());
        let messages = parser.push(&bytes[cut..]);
        assert_eq!(messages[0].data, "\"é\"");
    }

    #[test]
    fn ignores_comments_and_blocks_without_data() {
        let mut parser = SseParser::default();
        assert!(parser.push(b": hello\n\nretry: 1\n\n").is_empty());
    }

    #[test]
    fn handles_crlf_and_multiline_data() {
        let mut parser = SseParser::default();
        let messages = parser.push(b"event: x\r\ndata: a\r\ndata: b\r\n\r\n");
        assert_eq!(messages[0].data, "a\nb");
    }
}
