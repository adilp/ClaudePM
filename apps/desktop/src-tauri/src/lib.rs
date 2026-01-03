use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::net::TcpStream;
use std::path::PathBuf;
use std::env;
use std::fs;

// Global state for the server process
static SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

#[tauri::command]
fn activate_app(app_name: String) -> Result<(), String> {
    let script = format!("tell application \"{}\" to activate", app_name);

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("osascript failed: {}", stderr))
    }
}

/// Check if the server is already running by attempting to connect to the port
fn is_server_running(port: u16) -> bool {
    TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

/// Find npm executable - checks common locations
fn find_npm() -> Option<PathBuf> {
    // Check if npm is in PATH
    if let Ok(output) = Command::new("which").arg("npm").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }

    // Common npm locations on macOS
    let common_paths = [
        "/usr/local/bin/npm",
        "/opt/homebrew/bin/npm",
        "/usr/bin/npm",
    ];

    for path in common_paths {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }

    // Check in user's nvm directory
    if let Ok(home) = env::var("HOME") {
        let nvm_npm = PathBuf::from(&home).join(".nvm/versions/node").join("v20.18.0/bin/npm");
        if nvm_npm.exists() {
            return Some(nvm_npm);
        }

        // Try to find any node version
        let nvm_versions = PathBuf::from(&home).join(".nvm/versions/node");
        if let Ok(entries) = fs::read_dir(&nvm_versions) {
            for entry in entries.flatten() {
                let npm_path = entry.path().join("bin/npm");
                if npm_path.exists() {
                    return Some(npm_path);
                }
            }
        }
    }

    None
}

/// Get the path to the server directory
fn get_server_path() -> Option<PathBuf> {
    // 1. Check environment variable first
    if let Ok(path) = env::var("CLAUDE_PM_SERVER_PATH") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return Some(p);
        }
    }

    // 2. Check the hardcoded project path (most reliable for this project)
    if let Ok(home) = env::var("HOME") {
        let project_path = PathBuf::from(&home)
            .join("Desktop/projects/claudePM/server");
        if project_path.exists() {
            return Some(project_path);
        }
    }

    // 3. Try relative to executable (for development)
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            // Development: executable is in src-tauri/target/debug or release
            let paths_to_try = [
                parent.join("../../../../server"),
                parent.join("../../server"),
                parent.join("../../../server"),
            ];

            for path in paths_to_try {
                if let Ok(canonical) = path.canonicalize() {
                    if canonical.join("package.json").exists() {
                        return Some(canonical);
                    }
                }
            }
        }
    }

    None
}

/// Start the server subprocess with hot reload
fn start_server() -> Result<(), String> {
    let port: u16 = 4847;

    // Check if server is already running
    if is_server_running(port) {
        println!("[Claude PM] Server already running on port {}", port);
        return Ok(());
    }

    // Find npm executable
    let npm_path = find_npm().ok_or_else(|| {
        "Could not find npm. Please ensure Node.js is installed.".to_string()
    })?;
    println!("[Claude PM] Found npm at: {:?}", npm_path);

    // Find server directory
    let server_path = get_server_path().ok_or_else(|| {
        "Could not find server directory. Set CLAUDE_PM_SERVER_PATH environment variable.".to_string()
    })?;
    println!("[Claude PM] Starting server from: {:?}", server_path);

    // Get the bin directory for PATH (needed for tsx and other npm binaries)
    let npm_bin_dir = npm_path.parent().unwrap_or(&npm_path);

    // Build PATH with all necessary directories
    // Include: npm bin, /usr/local/bin (tmux), /opt/homebrew/bin, standard paths
    let home = env::var("HOME").unwrap_or_default();
    let current_path = env::var("PATH").unwrap_or_default();
    let new_path = format!(
        "{}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:{}/.nvm/versions/node/v20.18.0/bin:{}",
        npm_bin_dir.display(),
        home,
        current_path
    );

    // Start the server with npm run dev (uses tsx watch for hot reload)
    let child = Command::new(&npm_path)
        .args(["run", "dev"])
        .current_dir(&server_path)
        .env("PATH", &new_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start server: {}", e))?;

    println!("[Claude PM] Server started with PID: {}", child.id());

    // Store the child process
    let mut server = SERVER_PROCESS.lock().map_err(|e| e.to_string())?;
    *server = Some(child);

    Ok(())
}

/// Stop the server subprocess
fn stop_server() {
    if let Ok(mut server) = SERVER_PROCESS.lock() {
        if let Some(ref mut child) = *server {
            println!("Stopping server (PID: {})", child.id());

            // Try graceful shutdown first
            let _ = child.kill();
            let _ = child.wait();

            println!("Server stopped");
        }
        *server = None;
    }
}

#[tauri::command]
fn restart_server() -> Result<(), String> {
    stop_server();
    std::thread::sleep(std::time::Duration::from_millis(500));
    start_server()
}

#[tauri::command]
fn get_server_status() -> Result<String, String> {
    let port: u16 = 4847;
    if is_server_running(port) {
        Ok("running".to_string())
    } else {
        Ok("stopped".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Start the server before the app
    if let Err(e) = start_server() {
        eprintln!("Warning: Failed to start server: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            activate_app,
            restart_server,
            get_server_status
        ])
        .on_window_event(|_window, event| {
            // Stop server when app is closed
            if let tauri::WindowEvent::Destroyed = event {
                stop_server();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
