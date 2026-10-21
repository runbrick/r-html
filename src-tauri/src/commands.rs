// 本地与在线网页的读写都在 Rust 侧完成，WebView 只拿结果。
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDoc {
    pub path: String,
    pub name: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDoc {
    pub url: String,
    #[serde(rename = "finalUrl")]
    pub final_url: String,
    pub status: u16,
    pub content: String,
}

fn decode_bytes(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        // 老网页常见 GBK，UTF-8 失败时按 GB18030 兜底
        Err(_) => {
            let (cow, _, _) = encoding_rs::GBK.decode(bytes);
            cow.into_owned()
        }
    }
}

#[tauri::command]
pub fn read_html_file(path: String) -> Result<FileDoc, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("读取文件失败：{e}"))?;
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    Ok(FileDoc {
        path,
        name,
        content: decode_bytes(&bytes),
    })
}

#[tauri::command]
pub fn save_html_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("保存文件失败：{e}"))
}

#[tauri::command]
pub fn fetch_page(url: String) -> Result<PageDoc, String> {
    let url = if url.starts_with("http://") || url.starts_with("https://") {
        url
    } else {
        format!("https://{url}")
    };
    let resp = ureq::get(&url)
        .set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) R-HTML/0.1",
        )
        .set("Accept", "text/html,application/xhtml+xml,*/*;q=0.8")
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(code, _) => format!("请求失败：HTTP {code}"),
            ureq::Error::Transport(t) => format!("网络错误：{t}"),
        })?;
    let status = resp.status();
    let final_url = resp.get_url().to_string();
    let content = resp.into_string().map_err(|e| format!("读取内容失败：{e}"))?;
    Ok(PageDoc {
        url,
        final_url,
        status,
        content,
    })
}
