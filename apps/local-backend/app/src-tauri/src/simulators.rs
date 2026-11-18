//! Lists the iOS simulators that are booted. Read-only: it never changes a simulator.

use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Simulator {
    pub udid: String,
    pub name: String,
    pub runtime: String,
}

#[derive(Deserialize)]
struct SimctlList {
    devices: std::collections::BTreeMap<String, Vec<SimctlDevice>>,
}

#[derive(Deserialize)]
struct SimctlDevice {
    udid: String,
    name: String,
    #[serde(default)]
    state: String,
}

/// `com.apple.CoreSimulator.SimRuntime.iOS-18-0` becomes `iOS 18.0`.
pub fn runtime_label(key: &str) -> String {
    let last = key.rsplit('.').next().unwrap_or(key);
    match last.split_once('-') {
        Some((platform, version)) => format!("{platform} {}", version.replace('-', ".")),
        None => last.to_string(),
    }
}

/// Reads the output of `xcrun simctl list devices booted -j`.
pub fn parse(json: &str) -> Result<Vec<Simulator>, String> {
    let list: SimctlList = serde_json::from_str(json)
        .map_err(|_| "simctl printed something unexpected.".to_string())?;
    let mut found = Vec::new();
    for (runtime, devices) in list.devices {
        for device in devices
            .into_iter()
            .filter(|device| device.state == "Booted")
        {
            found.push(Simulator {
                udid: device.udid,
                name: device.name,
                runtime: runtime_label(&runtime),
            });
        }
    }
    Ok(found)
}

pub fn list_booted(path_env: Option<&str>) -> Result<Vec<Simulator>, String> {
    let mut command = Command::new("xcrun");
    command
        .args(["simctl", "list", "devices", "booted", "-j"])
        .stdin(Stdio::null());
    if let Some(path) = path_env {
        command.env("PATH", path);
    }
    let output = command.output().map_err(|_| {
        "xcrun was not found. Install Xcode and its command line tools.".to_string()
    })?;
    if !output.status.success() {
        return Err("simctl could not list the simulators.".to_string());
    }
    parse(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"devices":{
      "com.apple.CoreSimulator.SimRuntime.iOS-18-0":[
        {"udid":"AAAA-1111","name":"iPhone 16","state":"Booted","isAvailable":true},
        {"udid":"BBBB-2222","name":"iPhone SE","state":"Shutdown"}],
      "com.apple.CoreSimulator.SimRuntime.iOS-17-5":[]}}"#;

    #[test]
    fn lists_only_booted_devices() {
        let found = parse(SAMPLE).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].udid, "AAAA-1111");
        assert_eq!(found[0].runtime, "iOS 18.0");
    }

    #[test]
    fn nothing_booted_is_an_empty_list() {
        assert!(parse(r#"{"devices":{}}"#).unwrap().is_empty());
    }

    #[test]
    fn garbage_is_an_error() {
        assert!(parse("Xcode error").is_err());
    }

    #[test]
    fn labels_runtimes() {
        assert_eq!(
            runtime_label("com.apple.CoreSimulator.SimRuntime.iOS-18-0"),
            "iOS 18.0"
        );
        assert_eq!(runtime_label("weird"), "weird");
    }
}
