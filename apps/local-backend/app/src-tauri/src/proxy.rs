//! The two ways this app talks to a running engine. The webview never makes either request itself.
//!
//! * Admin calls go to `http://127.0.0.1:<adminPort>/__admin<path>` with the per-launch token, which is added
//!   here and nowhere else. The path is checked first, so the UI cannot reach anything but admin routes.
//! * "Try it" calls go to the public API on this machine. Over HTTPS the client trusts only the backend's own
//!   `rootCA.pem`; certificate checks stay on. The admin token is never sent to the public port.

use std::path::Path;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::engine::Ready;
use crate::http::{describe_error, valid_path};

const ALLOWED_METHODS: [&str; 5] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
/// The only request headers "Try it" may set.
const PUBLIC_HEADERS: [&str; 4] = [
    "content-type",
    "authorization",
    "accept",
    "x-tempo-scenario",
];
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_REPLY_BYTES: usize = 16 * 1024 * 1024;
pub const ADMIN_PREFIX: &str = "/__admin";

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

fn path_part_ok(part: &str) -> bool {
    part.split('/').all(|segment| {
        let lower = segment.to_ascii_lowercase();
        segment != ".."
            && segment != "."
            && !lower.contains("%2e")
            && !lower.contains("%2f")
            && !lower.contains("%5c")
            && !lower.contains("%00")
    }) && !part.contains('#')
}

/// A path for an admin call: a plain path (and query) with no way out of `/__admin`.
pub fn admin_path_ok(path: &str) -> bool {
    if !valid_path(path) || path.contains('#') {
        return false;
    }
    let (route, _query) = path.split_once('?').unwrap_or((path, ""));
    path_part_ok(route) && route != "/events"
}

/// A path for a public ("Try it") call: ordinary paths only, never an engine admin or internal route.
pub fn public_path_ok(path: &str) -> bool {
    if !valid_path(path) || path.contains('#') {
        return false;
    }
    let (route, _query) = path.split_once('?').unwrap_or((path, ""));
    path_part_ok(route) && !route.starts_with(ADMIN_PREFIX)
}

fn method_of(request: &HttpRequest) -> Result<reqwest::Method, String> {
    let method = request.method.to_ascii_uppercase();
    if !ALLOWED_METHODS.contains(&method.as_str()) {
        return Err(format!("{method} is not an allowed method."));
    }
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_BODY_BYTES)
    {
        return Err("The request body is too large.".to_string());
    }
    reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "Bad method.".to_string())
}

pub fn admin_base(ready: &Ready) -> String {
    format!("http://127.0.0.1:{}", ready.admin_port)
}

pub fn public_base(ready: &Ready) -> String {
    format!("{}://127.0.0.1:{}", ready.scheme, ready.port)
}

pub fn admin_client(timeout: Option<Duration>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(3));
    if let Some(timeout) = timeout {
        builder = builder.timeout(timeout);
    }
    builder
        .build()
        .map_err(|error| format!("Could not set up the connection: {error}"))
}

/// A client for the public API. Over HTTPS it trusts only the CA file of this backend.
pub fn public_client(
    scheme: &str,
    ca: &Path,
    timeout: Duration,
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(3))
        .timeout(timeout);
    if scheme == "https" {
        builder = builder.tls_certs_only([read_ca(ca)?]);
    }
    builder
        .build()
        .map_err(|error| format!("Could not set up the connection: {error}"))
}

fn read_ca(path: &Path) -> Result<reqwest::Certificate, String> {
    let pem = std::fs::read(path).map_err(|_| {
        "This backend uses HTTPS but has no CA file yet. Create the certificate in Settings."
            .to_string()
    })?;
    let invalid = || "The backend's rootCA.pem is not a valid certificate.".to_string();
    if !String::from_utf8_lossy(&pem).contains("-----BEGIN CERTIFICATE-----") {
        return Err(invalid());
    }
    reqwest::Certificate::from_pem(&pem).map_err(|_| invalid())
}

async fn reply_of(response: reqwest::Response, started: Instant) -> Result<HttpReply, String> {
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = response.bytes().await.map_err(describe_error)?;
    if bytes.len() > MAX_REPLY_BYTES {
        return Err("The answer is too large to show.".to_string());
    }
    Ok(HttpReply {
        status,
        body: String::from_utf8_lossy(&bytes).into_owned(),
        ms: u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
        content_type,
    })
}

/// One admin call. The token header is added here.
pub async fn admin_send(ready: &Ready, request: HttpRequest) -> Result<HttpReply, String> {
    let method = method_of(&request)?;
    if !admin_path_ok(&request.path) {
        return Err("That request path is not allowed.".to_string());
    }
    let url = format!("{}{ADMIN_PREFIX}{}", admin_base(ready), request.path);
    let mut builder = admin_client(Some(Duration::from_secs(60)))?
        .request(method, url)
        .header("x-tempo-token", ready.token());
    if let Some(body) = request.body {
        builder = builder
            .header("content-type", "application/json")
            .body(body);
    }
    let started = Instant::now();
    reply_of(builder.send().await.map_err(describe_error)?, started).await
}

/// An admin GET that returns raw bytes (a media file), at most `max` bytes. Returns the status and content type too.
pub async fn admin_bytes(
    ready: &Ready,
    path: &str,
    max: usize,
) -> Result<(u16, Option<String>, bytes::Bytes), String> {
    if !admin_path_ok(path) {
        return Err("That request path is not allowed.".to_string());
    }
    let response = admin_client(Some(Duration::from_secs(300)))?
        .get(format!("{}{ADMIN_PREFIX}{path}", admin_base(ready)))
        .header("x-tempo-token", ready.token())
        .send()
        .await
        .map_err(describe_error)?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if response
        .content_length()
        .is_some_and(|length| length > max as u64)
    {
        return Err("That file is too large.".to_string());
    }
    let bytes = response.bytes().await.map_err(describe_error)?;
    if bytes.len() > max {
        return Err("That file is too large.".to_string());
    }
    Ok((status, content_type, bytes))
}

/// The engine's plain message for a failed answer (`detail` or `title` of its problem+json), else the status.
pub fn engine_message(reply: &HttpReply) -> String {
    serde_json::from_str::<serde_json::Value>(&reply.body)
        .ok()
        .and_then(|value| {
            value
                .get("detail")
                .or_else(|| value.get("title"))
                .or_else(|| value.get("message"))
                .and_then(|text| text.as_str().map(str::to_string))
        })
        .unwrap_or_else(|| format!("The engine answered {}.", reply.status))
}

/// One "Try it" call to the public API.
pub async fn public_send(
    ready: &Ready,
    ca: &Path,
    request: HttpRequest,
) -> Result<HttpReply, String> {
    let method = method_of(&request)?;
    if !public_path_ok(&request.path) {
        return Err("That request path is not allowed.".to_string());
    }
    let url = format!("{}{}", public_base(ready), request.path);
    let mut builder =
        public_client(&ready.scheme, ca, Duration::from_secs(30))?.request(method, url);
    for (name, value) in &request.headers {
        if PUBLIC_HEADERS.contains(&name.to_ascii_lowercase().as_str()) {
            builder = builder.header(name.as_str(), value.as_str());
        }
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let started = Instant::now();
    reply_of(builder.send().await.map_err(describe_error)?, started).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_paths_stay_inside_admin() {
        for ok in [
            "/info",
            "/data/products?limit=50&skip=0&q=a%20b",
            "/collections/products/fields/title",
            "/media/0123456789abcdef0123456789abcdef/file",
        ] {
            assert!(admin_path_ok(ok), "{ok}");
        }
        for bad in [
            "",
            "info",
            "//evil.example/x",
            "/../etc/passwd",
            "/data/../../x",
            "/a/./b",
            "/%2e%2e/x",
            "/a%2Fb",
            "/a%5cb",
            "/events",
            "/x#frag",
            "/a b",
            "/a\nb",
            "http://evil/x",
            "/x://y",
        ] {
            assert!(!admin_path_ok(bad), "{bad:?}");
        }
    }

    #[test]
    fn public_paths_never_reach_the_admin_routes() {
        assert!(public_path_ok("/products?limit=3"));
        assert!(public_path_ok("/__health"));
        for bad in [
            "/__admin/definition",
            "/__admin",
            "/../x",
            "//x",
            "http://x",
        ] {
            assert!(!public_path_ok(bad), "{bad}");
        }
    }

    #[test]
    fn rejects_unknown_methods_and_big_bodies_before_connecting() {
        let request = |method: &str, body: Option<String>| HttpRequest {
            method: method.into(),
            path: "/x".into(),
            headers: vec![],
            body,
        };
        assert!(method_of(&request("CONNECT", None)).is_err());
        assert!(method_of(&request("get", None)).is_ok());
        assert!(method_of(&request("POST", Some("x".repeat(MAX_BODY_BYTES + 1)))).is_err());
    }

    #[test]
    fn reads_the_engines_plain_message() {
        let reply = |body: &str| HttpReply {
            status: 409,
            body: body.into(),
            ms: 1,
            content_type: None,
        };
        assert_eq!(
            engine_message(&reply(
                r#"{"title":"Conflict","detail":"Would lose 3 rows."}"#
            )),
            "Would lose 3 rows."
        );
        assert_eq!(engine_message(&reply("<html>")), "The engine answered 409.");
    }

    #[test]
    fn https_without_a_ca_file_is_a_clear_error() {
        let error = public_client(
            "https",
            Path::new("/does/not/exist.pem"),
            Duration::from_secs(1),
        )
        .unwrap_err();
        assert!(error.contains("Settings"));
    }

    #[test]
    fn https_with_garbage_in_the_ca_file_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let ca = dir.path().join("rootCA.pem");
        std::fs::write(&ca, "not a certificate").unwrap();
        assert!(public_client("https", &ca, Duration::from_secs(1)).is_err());
        // Plain HTTP needs no CA at all.
        assert!(public_client("http", &ca, Duration::from_secs(1)).is_ok());
    }
}
