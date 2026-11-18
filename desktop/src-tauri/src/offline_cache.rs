//! Opaque encrypted offline snapshots. Encryption belongs to the shared signer seam.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Record {
    scope: String,
    kind: String,
    id: String,
    ciphertext: String,
    saved_at: i64,
    last_visited_at: i64,
    bytes: i64,
}
fn open(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("channel-head-cache.db")).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; PRAGMA user_version=2;
      CREATE TABLE IF NOT EXISTS offline_snapshot(scope TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,ciphertext TEXT NOT NULL,saved_at INTEGER NOT NULL,last_visited_at INTEGER NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(scope,kind,id));").map_err(|e| e.to_string())?;
    // Legacy plaintext paint rows are disposable. Never import them as trusted snapshots.
    conn.execute("DELETE FROM channel_head", [])
        .or_else(|error| {
            if error.to_string().contains("no such table") {
                Ok(0)
            } else {
                Err(error)
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(conn)
}
fn cap(kind: &str) -> Result<(i64, i64), String> {
    match kind {
        "head" => Ok((64, 3 * 1024 * 1024)),
        "thread" => Ok((200, 3 * 256 * 1024)),
        "sidebar" => Ok((1, 3 * 1024 * 1024)),
        "profile" => Ok((2000, 3 * 32 * 1024)),
        _ => Err("Unknown offline snapshot kind".into()),
    }
}
/// Lists ciphertext snapshots for exactly one account/relay scope and unit type.
#[tauri::command]
pub(crate) async fn offline_cache_list(
    app: AppHandle,
    scope: String,
    kind: String,
) -> Result<Vec<Record>, String> {
    cap(&kind)?;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = open(&app)?;
        let mut query = conn.prepare("SELECT scope,kind,id,ciphertext,saved_at,last_visited_at,bytes FROM offline_snapshot WHERE scope=?1 AND kind=?2 ORDER BY last_visited_at DESC,id ASC").map_err(|e| e.to_string())?;
        let rows = query.query_map(params![scope,kind], |row| Ok(Record { scope: row.get(0)?,kind: row.get(1)?,id: row.get(2)?,ciphertext: row.get(3)?,saved_at: row.get(4)?,last_visited_at: row.get(5)?,bytes: row.get(6)? })).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}
/// Atomically persists an encrypted snapshot and enforces count and scope byte budgets.
#[tauri::command]
pub(crate) async fn offline_cache_put(app: AppHandle, record: Record) -> Result<(), String> {
    let (count, size) = cap(&record.kind)?;
    if record.ciphertext.len() as i64 > size || record.bytes != record.ciphertext.len() as i64 {
        return Err("Offline snapshot exceeds size cap".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = open(&app)?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
        tx.execute("INSERT OR REPLACE INTO offline_snapshot VALUES(?1,?2,?3,?4,?5,?6,?7)", params![record.scope,record.kind,record.id,record.ciphertext,record.saved_at,record.last_visited_at,record.bytes]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM offline_snapshot WHERE rowid IN (SELECT rowid FROM offline_snapshot WHERE scope=?1 AND kind=?2 ORDER BY last_visited_at DESC,id ASC LIMIT -1 OFFSET ?3)",params![record.scope,record.kind,count]).map_err(|e| e.to_string())?;
        loop {
            let bytes: i64 = tx.query_row("SELECT COALESCE(SUM(bytes),0) FROM offline_snapshot WHERE scope=?1", [&record.scope], |row| row.get(0)).map_err(|e| e.to_string())?;
            if bytes <= 48 * 1024 * 1024 { break; }
            tx.execute("DELETE FROM offline_snapshot WHERE rowid=(SELECT rowid FROM offline_snapshot WHERE scope=?1 ORDER BY last_visited_at ASC,id DESC LIMIT 1)",[&record.scope]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}
/// Removes every cached payload in a community/account scope.
#[tauri::command]
pub(crate) async fn offline_cache_clear(app: AppHandle, scope: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        open(&app)?
            .execute("DELETE FROM offline_snapshot WHERE scope=?1", [scope])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
