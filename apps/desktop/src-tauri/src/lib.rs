use std::process::Command;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![activate_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
