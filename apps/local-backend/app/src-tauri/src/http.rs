//! Small helpers shared by the proxies: the path rule, a short reason for a failed request, and the
//! server-sent-event parser. The requests themselves are made in `proxy.rs`.

/// A path for the fixed host: one leading slash, no scheme, no whitespace or control characters.
pub fn valid_path(path: &str) -> bool {
    path.starts_with('/')
        && !path.starts_with("//")
        && !path.contains('\\')
        && !path.contains("://")
        && path.chars().all(|c| !c.is_control() && c != ' ')
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
