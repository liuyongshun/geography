use std::{fs, io, path::PathBuf, sync::Mutex};
#[cfg(not(all(target_os = "windows", not(debug_assertions))))]
use tauri::Manager;

pub struct DataFile(pub PathBuf, pub Mutex<()>);

pub fn location(app: &tauri::App) -> io::Result<PathBuf> {
    // Windows 便携版跟随 exe；开发环境及其他平台使用应用数据目录。
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    let directory = std::env::current_exe()?
        .parent()
        .ok_or_else(|| io::Error::other("无法确定程序目录"))?
        .join("data");
    #[cfg(not(all(target_os = "windows", not(debug_assertions))))]
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(io::Error::other)?
        .join("data");
    Ok(directory.join("leaderboard.json"))
}

#[tauri::command]
pub fn read_portable_data(state: tauri::State<DataFile>) -> Result<serde_json::Value, String> {
    let _guard = state.1.lock().map_err(|e| e.to_string())?;
    let data = match fs::read_to_string(&state.0) {
        Ok(text) => Some(
            serde_json::from_str::<serde_json::Value>(&text)
                .map_err(|e| format!("数据文件损坏，请保留文件并从备份恢复：{e}"))?,
        ),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("无法读取 {}：{error}", state.0.display())),
    };
    Ok(serde_json::json!({ "path": state.0.to_string_lossy(), "data": data }))
}

#[tauri::command]
pub fn write_portable_data(
    state: tauri::State<DataFile>,
    data: serde_json::Value,
) -> Result<(), String> {
    let _guard = state.1.lock().map_err(|e| e.to_string())?;
    if data["format"] != "dili-leaderboard-backup" || data["version"] != 1 {
        return Err("不支持的数据格式".into());
    }
    write_file(&state.0, &data).map_err(|error| {
        format!(
            "无法保存到 {}：{error}。请确认目录可写、U盘已连接且空间充足，并导出数据备份。",
            state.0.display()
        )
    })
}

fn write_file(path: &std::path::Path, data: &serde_json::Value) -> io::Result<()> {
    fs::create_dir_all(path.parent().unwrap())?;
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(data)?;
    let mut file = fs::File::create(&temporary)?;
    use io::Write;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    if path.exists() {
        fs::copy(path, path.with_extension("json.bak"))?;
    }
    fs::rename(temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_round_trip_retains_previous_backup_and_survives_failed_write() {
        let directory = std::env::temp_dir().join(format!(
            "dili-storage-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = directory.join("data/leaderboard.json");
        let first = serde_json::json!({"score": 17, "name": "张三"});
        let second = serde_json::json!({"score": 18, "name": "张三"});
        write_file(&path, &first).unwrap();
        write_file(&path, &second).unwrap();
        let read = |file: &std::path::Path| {
            serde_json::from_str::<serde_json::Value>(&fs::read_to_string(file).unwrap()).unwrap()
        };
        assert_eq!(read(&path), second);
        assert_eq!(read(&path.with_extension("json.bak")), first);
        // 模拟临时文件路径不可写，确认失败不会覆盖当前数据或备份。
        fs::create_dir(path.with_extension("json.tmp")).unwrap();
        assert!(write_file(&path, &first).is_err());
        assert_eq!(read(&path), second);
        assert_eq!(read(&path.with_extension("json.bak")), first);
        fs::remove_dir_all(directory).unwrap();
    }
}
