#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;

use serde::Deserialize;
use tao::{
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::WindowBuilder,
};
use wry::WebViewBuilder;

const PRODUCT_NAME: &str = "InvoraLite";
const PUBLISHER: &str = "Gyan B. Baraily";

#[derive(Debug, Deserialize)]
struct IpcRequest {
    cmd: String,
    #[serde(default)]
    dir: Option<String>,
}

enum UserEvent {
    RunScript(String),
}

fn previous_install_dir_from_registry() -> Option<String> {
    let key = format!(r"HKCU\Software\{PUBLISHER}\{PRODUCT_NAME}");
    let output = Command::new("reg")
        .args(["query", &key, "/ve"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some((_, value)) = line.split_once("REG_SZ") {
            let path = value.trim();
            if !path.is_empty() {
                return Some(path.to_string());
            }
        }
    }
    None
}

fn default_install_dir() -> String {
    if let Some(previous) = previous_install_dir_from_registry() {
        return previous;
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        return format!(r"{local}\{PRODUCT_NAME}");
    }
    format!(r"C:\{PRODUCT_NAME}")
}

fn extract_inner_installer() -> std::io::Result<PathBuf> {
    const INNER: &[u8] = include_bytes!("../embedded/inner-setup.exe");
    let dir = std::env::temp_dir().join(format!("invora-installer-{}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("inner-setup.exe");
    std::fs::write(&path, INNER)?;
    Ok(path)
}

fn extract_eula() -> std::io::Result<PathBuf> {
    let path = std::env::temp_dir().join(format!("InvoraLite-EULA-{}.txt", std::process::id()));
    std::fs::write(&path, include_str!("../assets/EULA.txt"))?;
    Ok(path)
}

fn open_file(path: &PathBuf) {
    let _ = Command::new("cmd")
        .args(["/C", "start", "", &path.display().to_string()])
        .spawn();
}

fn pick_install_folder(start_dir: &str) -> Option<String> {
    let mut dialog = rfd::FileDialog::new().set_title("Choose install location");
    let start = PathBuf::from(start_dir);
    if start.is_dir() {
        dialog = dialog.set_directory(&start);
    } else if let Some(parent) = start.parent() {
        if parent.is_dir() {
            dialog = dialog.set_directory(parent);
        }
    }
    dialog
        .pick_folder()
        .map(|path| path.display().to_string())
}

fn run_install(inner: &PathBuf, install_dir: &str, proxy: EventLoopProxy<UserEvent>) {
    let target = PathBuf::from(install_dir);
    if let Some(parent) = target.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let ok = Command::new(inner)
        .arg("/S")
        .arg(format!("/D={install_dir}"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    let message = if ok {
        "Installation completed."
    } else {
        "Installation failed. Please try again."
    };
    let script = format!(
        "window.__onInstallDone({}, {});",
        if ok { "true" } else { "false" },
        serde_json::to_string(message).unwrap_or_default()
    );
    let _ = proxy.send_event(UserEvent::RunScript(script));
}

fn load_window_icon() -> Option<tao::window::Icon> {
    let bytes = include_bytes!("../assets/icon.png");
    let img = image::load_from_memory(bytes).ok()?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    tao::window::Icon::from_rgba(rgba.into_raw(), w, h).ok()
}

fn main() {
    let default_dir = default_install_dir();
    let init_script = format!(
        "window.__DEFAULT_DIR__ = {};",
        serde_json::to_string(&default_dir).unwrap()
    );

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let mut window_builder = WindowBuilder::new()
        .with_title("InvoraLite Installer")
        .with_inner_size(tao::dpi::LogicalSize::new(750.0, 450.0))
        .with_resizable(false);
    if let Some(icon) = load_window_icon() {
        window_builder = window_builder.with_window_icon(Some(icon));
    }
    let window = window_builder
        .build(&event_loop)
        .expect("create window");

    let inner_path = extract_inner_installer().expect("extract inner installer");
    let eula_path = extract_eula().expect("extract eula");

    let proxy_ipc = proxy.clone();
    let inner_ipc = inner_path.clone();
    let eula_ipc = eula_path.clone();

    let webview = WebViewBuilder::new()
        .with_html(include_str!(concat!(env!("OUT_DIR"), "/installer.html")))
        .with_initialization_script(&init_script)
        .with_ipc_handler(move |request| {
            let msg = request.into_body();
            let Ok(req) = serde_json::from_str::<IpcRequest>(&msg) else {
                return;
            };
            match req.cmd.as_str() {
                "browse" => {
                    let start = req
                        .dir
                        .filter(|d| !d.trim().is_empty())
                        .unwrap_or_else(default_install_dir);
                    if let Some(p) = pick_install_folder(&start) {
                        let script = format!(
                            "window.__onBrowseResult({});",
                            serde_json::to_string(&p).unwrap_or_default()
                        );
                        let _ = proxy_ipc.send_event(UserEvent::RunScript(script));
                    }
                }
                "eula" => open_file(&eula_ipc),
                "install" => {
                    let dir = req
                        .dir
                        .filter(|d| !d.trim().is_empty())
                        .unwrap_or_else(default_install_dir);
                    let inner = inner_ipc.clone();
                    let proxy = proxy_ipc.clone();
                    thread::spawn(move || run_install(&inner, &dir, proxy));
                }
                "launch" => {
                    let dir = req
                        .dir
                        .filter(|d| !d.trim().is_empty())
                        .unwrap_or_else(default_install_dir);
                    let exe = format!(r"{dir}\invora.exe");
                    let _ = Command::new(&exe).spawn();
                }
                _ => {}
            }
        })
        .build(&window)
        .expect("create webview");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match &event {
            Event::UserEvent(UserEvent::RunScript(script)) => {
                let _ = webview.evaluate_script(script);
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => *control_flow = ControlFlow::Exit,
            _ => {}
        }
    });
}
