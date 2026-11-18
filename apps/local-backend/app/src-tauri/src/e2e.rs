//! An end-to-end run of the Rust side against the real engine: create a backend from the Tempo template, make a
//! certificate in a throwaway CA, serve it over HTTPS, and go through the same proxies the tabs use.
//!
//! It needs mkcert, an engine and free ports, so it is ignored by default. By default the engine is
//! `node dist/cli.mjs` (Node 24 and `yarn workspace @rn-tempo/local-backend-engine build`). With `E2E_SIDECAR` set to
//! the bundled `tempo-engine` executable it runs that instead, and then Node must NOT be on `PATH`: the run proves the
//! packaged engine needs no Node. Run it with `cargo test e2e -- --ignored --nocapture --test-threads=1`. Nothing is added to a trust store: the CA lives in a
//! temporary folder, and the Rust client trusts only that CA.

use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::backends::{preview_limit, upload_one};
use crate::cli::{self, CliAction, Preset};
use crate::engine;
use crate::fleet::{Fleet, RunState};
use crate::proxy::{self, HttpReply, HttpRequest};

fn req(method: &str, path: &str, body: Option<&str>) -> HttpRequest {
    HttpRequest {
        method: method.into(),
        path: path.into(),
        headers: if body.is_some() {
            vec![("content-type".into(), "application/json".into())]
        } else {
            vec![]
        },
        body: body.map(str::to_string),
    }
}

fn json(reply: &HttpReply) -> serde_json::Value {
    serde_json::from_str(&reply.body).unwrap_or(serde_json::Value::Null)
}

fn port_free(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(300),
    )
    .is_err()
}

/// An ISO 8601 UTC time `seconds` from now (no date crate is needed for this one test).
fn iso_after(seconds: u64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + seconds;
    let (days, rest) = ((now / 86_400) as i64, now % 86_400);
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3_600,
        rest % 3_600 / 60,
        rest % 60
    )
}

#[test]
#[ignore = "needs mkcert, an engine (Node or E2E_SIDECAR) and free ports; run by hand"]
fn the_app_side_runs_a_real_backend_end_to_end() {
    let work = tempfile::tempdir().unwrap();
    let caroot = work.path().join("caroot");
    std::fs::create_dir(&caroot).unwrap();
    std::env::set_var("CAROOT", &caroot);
    let dir: PathBuf = work.path().join("shop");
    std::fs::create_dir(&dir).unwrap();
    let port: u16 = std::env::var("E2E_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8556);
    assert!(port_free(port), "port {port} is in use");

    let launch = match std::env::var_os("E2E_SIDECAR") {
        Some(sidecar) => {
            // The no-Node proof: `node` must not even start from this process's PATH.
            assert!(
                std::process::Command::new("node")
                    .arg("--version")
                    .output()
                    .is_err(),
                "Node is on PATH; run this with a PATH that has no node"
            );
            engine::launch_from(Some(Path::new(&sidecar)), None).unwrap()
        }
        None => engine::launch_from(None, None).unwrap(),
    };

    // 1. New backend from the Tempo template, on a free port.
    let made = cli::run(
        &launch,
        &cli::create_args(&dir, "e2e shop", Preset::TempoTemplate, Some(port)),
        &dir,
        Duration::from_secs(60),
    )
    .unwrap();
    assert_eq!(made.code, 0, "{}", made.stderr);
    let certs = cli::run(
        &launch,
        &CliAction::Certs.args(&dir).unwrap(),
        &dir,
        Duration::from_secs(60),
    )
    .unwrap();
    assert_eq!(certs.code, 0, "{}", certs.stderr);

    // 2. Start (HTTPS).
    let fleet = Fleet::default();
    let status = fleet.start(&launch, &dir, None);
    assert_eq!(
        (status.state, status.scheme.as_deref(), status.port),
        (RunState::Running, Some("https"), Some(port)),
        "{:?}",
        status.error
    );
    let ready = fleet.ready(&dir).unwrap();
    let ca = dir.join(".data/certs/rootCA.pem");
    let admin =
        |request| tauri::async_runtime::block_on(proxy::admin_send(&ready, request)).unwrap();
    let public = |request| tauri::async_runtime::block_on(proxy::public_send(&ready, &ca, request));

    // 3. Endpoints: add a static endpoint, call it for real, switch a scenario.
    let added = admin(req(
        "POST",
        "/endpoints",
        Some(
            r#"{"id":"get.y4","type":"static","method":"GET","path":"/y4-ping","status":200,"body":{"pong":true}}"#,
        ),
    ));
    assert_eq!(added.status, 200, "{}", added.body);
    let pong = public(req("GET", "/y4-ping", None)).unwrap();
    assert_eq!(
        (pong.status, json(&pong)["pong"].clone()),
        (200, serde_json::json!(true))
    );
    assert_eq!(
        admin(req(
            "PUT",
            "/scenarios/get.y4",
            Some(r#"{"name":"notFound"}"#)
        ))
        .status,
        200
    );
    assert_eq!(public(req("GET", "/y4-ping", None)).unwrap().status, 404);
    assert_eq!(admin(req("DELETE", "/scenarios/get.y4", None)).status, 200);
    assert_eq!(public(req("GET", "/y4-ping", None)).unwrap().status, 200);

    // 4. Data: add a product and read it back through the public API; add a field.
    let product = admin(req(
        "POST",
        "/data/products",
        Some(r#"{"title":"Y4 Chair","price":25}"#),
    ));
    assert_eq!(product.status, 201, "{}", product.body);
    let found = public(req("GET", "/products/search?q=Y4", None)).unwrap();
    assert_eq!(found.status, 200);
    assert!(found.body.contains("Y4 Chair"), "{}", found.body);
    let field = admin(req(
        "POST",
        "/collections/products/fields",
        Some(r#"{"name":"weight","type":"number"}"#),
    ));
    assert_eq!(field.status, 200, "{}", field.body);
    // Removing a field that holds data needs the second confirm and shows what is lost.
    let lost = admin(req("DELETE", "/collections/products/fields/price", None));
    assert_eq!(lost.status, 409, "{}", lost.body);
    assert_eq!(json(&lost)["confirmRequired"], serde_json::json!(true));

    // 5. Media: upload a PNG through the same streaming code, download it, check the preview rule.
    let png: Vec<u8> = [
        &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A][..],
        &[7u8; 600_000],
    ]
    .concat();
    let file = work.path().join("pixel.png");
    std::fs::write(&file, &png).unwrap();
    let steps = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let seen = steps.clone();
    tauri::async_runtime::block_on(upload_one(
        &ready,
        &file,
        "pixel.png",
        move |sent, total| seen.lock().unwrap().push((sent, total)),
    ))
    .unwrap();
    assert!(
        steps.lock().unwrap().len() >= 3,
        "progress was reported in chunks"
    );
    let list = json(&admin(req("GET", "/media", None)));
    let item = &list["items"][0];
    let id = item["id"].as_str().unwrap().to_string();
    assert_eq!(item["mime"], "image/png");
    assert!(preview_limit(item["mime"].as_str().unwrap()).is_some());
    let (status, _type, bytes) = tauri::async_runtime::block_on(proxy::admin_bytes(
        &ready,
        &format!("/media/{id}/file"),
        10_000_000,
    ))
    .unwrap();
    assert_eq!((status, bytes.len()), (200, png.len()));

    // 6. Users: add one, log in for real, then "Sign out everywhere" kills the old token.
    let user = admin(req(
        "POST",
        "/users",
        Some(r#"{"username":"y4user","password":"y4pass-123"}"#),
    ));
    assert_eq!(user.status, 201, "{}", user.body);
    let uid = json(&user)["id"].as_u64().unwrap();
    let login = public(req(
        "POST",
        "/auth/login",
        Some(r#"{"username":"y4user","password":"y4pass-123"}"#),
    ))
    .unwrap();
    assert_eq!(login.status, 200, "{}", login.body);
    let token = json(&login)["accessToken"].as_str().unwrap().to_string();
    let me = |token: &str| {
        let mut request = req("GET", "/auth/me", None);
        request
            .headers
            .push(("authorization".into(), format!("Bearer {token}")));
        public(request).unwrap().status
    };
    assert_eq!(me(&token), 200);
    assert_eq!(
        admin(req("POST", &format!("/users/{uid}/revoke"), None)).status,
        200
    );
    assert_eq!(me(&token), 401, "the old token stops working at once");

    // 6b. Content: the template preset seeds an announcement; a draft is private, publish shows it, unpublish
    // hides it, and a schedule 2 seconds ahead appears on its own.
    let announcements = |locale: &str| {
        let answer = public(req(
            "GET",
            &format!("/content/announcement?locale={locale}"),
            None,
        ))
        .unwrap();
        assert_eq!(answer.status, 200, "{}", answer.body);
        json(&answer)
    };
    let seeded = announcements("ar");
    assert_eq!(seeded["total"], serde_json::json!(1), "{seeded}");
    assert_eq!(seeded["items"][0]["slug"], "welcome");
    assert_eq!(seeded["items"][0]["locale"], "ar");
    let draft = admin(req(
        "POST",
        "/content/entries",
        Some(
            r#"{"type":"announcement","slug":"y5","values":{"en":{"title":"Y5 news"},"ar":{"title":"أخبار Y5"}}}"#,
        ),
    ));
    assert_eq!(draft.status, 201, "{}", draft.body);
    let entry = json(&draft)["id"].as_u64().unwrap();
    assert_eq!(
        announcements("ar")["total"],
        serde_json::json!(1),
        "a draft is not public"
    );
    assert_eq!(
        public(req("GET", "/content/announcement/y5", None))
            .unwrap()
            .status,
        404
    );
    let published = admin(req(
        "POST",
        &format!("/content/entries/{entry}/publish"),
        Some("{}"),
    ));
    assert_eq!(published.status, 200, "{}", published.body);
    let live = announcements("ar");
    assert_eq!(live["total"], serde_json::json!(2));
    assert!(live.to_string().contains("أخبار Y5"), "{live}");
    let hidden = admin(req(
        "POST",
        &format!("/content/entries/{entry}/unpublish"),
        Some("{}"),
    ));
    assert_eq!(hidden.status, 200, "{}", hidden.body);
    assert_eq!(
        announcements("ar")["total"],
        serde_json::json!(1),
        "unpublished is hidden"
    );
    let at = iso_after(2);
    let scheduled = admin(req(
        "POST",
        &format!("/content/entries/{entry}/schedule"),
        Some(&format!(r#"{{"publishAt":"{at}"}}"#)),
    ));
    assert_eq!(scheduled.status, 200, "{}", scheduled.body);
    assert_eq!(
        announcements("ar")["total"],
        serde_json::json!(1),
        "not before its time"
    );
    std::thread::sleep(Duration::from_millis(3200));
    assert_eq!(
        announcements("ar")["total"],
        serde_json::json!(2),
        "after its time it is public"
    );
    // Removing a content field that holds values needs the second confirm.
    let lost = admin(req(
        "DELETE",
        "/content/types/announcement/fields/title",
        None,
    ));
    assert_eq!(lost.status, 409, "{}", lost.body);
    assert_eq!(json(&lost)["lost"][0]["kind"], "contentField");

    // 7. Logs: the requests above are in the engine's log, redacted.
    let log = admin(req("GET", "/requests", None));
    assert!(log.body.contains("/y4-ping") && log.body.contains("/auth/login"));
    assert!(
        !log.body.contains("y4pass-123") && !log.body.contains(&token),
        "the log hides passwords and tokens"
    );

    // 8. Settings: a backup, and the OpenAPI check against the template's contract.
    let zip = work.path().join("backup.zip");
    let backup = cli::run(
        &launch,
        &cli::snapshot_export_args(&dir, &zip),
        &dir,
        Duration::from_secs(120),
    )
    .unwrap();
    assert_eq!(backup.code, 0, "{}", backup.stderr);
    assert!(std::fs::metadata(&zip).unwrap().len() > 1000);
    let contract = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../template/api/generated/openapi.json");
    let check = cli::run(
        &launch,
        &cli::check_args(&dir, &contract),
        &dir,
        Duration::from_secs(60),
    )
    .unwrap();
    println!(
        "check: code {} {}",
        check.code,
        check.stdout.lines().take(3).collect::<Vec<_>>().join(" ")
    );
    assert_eq!(check.code, 0, "{}{}", check.stdout, check.stderr);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&check.stdout).unwrap()["ok"],
        serde_json::json!(true)
    );

    // 9. Quit: stopping the fleet stops the engine, and both ports are closed.
    let admin_port = ready.admin_port;
    assert!(!port_free(port) && !port_free(admin_port));
    fleet.stop_all();
    assert_eq!(fleet.status(&dir).state, RunState::Stopped);
    std::thread::sleep(Duration::from_millis(300));
    assert!(
        port_free(port) && port_free(admin_port),
        "the engine is gone"
    );
}
