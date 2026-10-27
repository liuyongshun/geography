mod portable_data;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = portable_data::location(app)?;
            app.manage(portable_data::DataFile(path, std::sync::Mutex::new(())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            portable_data::read_portable_data,
            portable_data::write_portable_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
