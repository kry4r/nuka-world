#[tauri::command]
pub fn close_policy_minimizes_to_tray(
    state: tauri::State<'_, crate::app_state::AppState>,
) -> bool {
    let settings = state.settings();
    crate::tray::ClosePolicy::from_settings(&settings).minimize_to_tray
}
