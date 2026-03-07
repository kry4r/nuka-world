use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, Runtime, Window, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
const MAIN_TRAY_ID: &str = "main";
const SHOW_MENU_ID: &str = "show";
const QUIT_MENU_ID: &str = "quit";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    HideToTray,
    Exit,
}

#[derive(Debug, Clone, Copy)]
pub struct ClosePolicy {
    pub minimize_to_tray: bool,
}

impl ClosePolicy {
    pub fn from_settings(settings: &crate::settings::SettingsState) -> Self {
        Self {
            minimize_to_tray: settings.minimize_to_tray,
        }
    }
}

impl Default for ClosePolicy {
    fn default() -> Self {
        Self::from_settings(&crate::settings::SettingsState::default())
    }
}

pub fn close_action(policy: &ClosePolicy) -> CloseAction {
    if policy.minimize_to_tray {
        CloseAction::HideToTray
    } else {
        CloseAction::Exit
    }
}

pub fn install<R: Runtime>(app: &mut tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, SHOW_MENU_ID, "Show", true, Option::<&str>::None)?;
    let quit = MenuItem::with_id(app, QUIT_MENU_ID, "Quit", true, Option::<&str>::None)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut tray = TrayIconBuilder::with_id(MAIN_TRAY_ID)
        .menu(&menu)
        .tooltip("Nuka World Desktop")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            if event.id() == SHOW_MENU_ID {
                let _ = show_main_window(app);
            } else if event.id() == QUIT_MENU_ID {
                app.exit(0);
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    let _tray = tray.build(app)?;
    Ok(())
}

pub fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let settings = window.state::<crate::app_state::AppState>().settings();
        let policy = ClosePolicy::from_settings(&settings);

        if matches!(close_action(&policy), CloseAction::HideToTray) {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

fn show_main_window<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<()> {
    if let Some(window) = manager.get_webview_window(MAIN_WINDOW_LABEL) {
        window.show()?;
        window.set_focus()?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn close_window_policy_minimizes_to_tray() {
        let policy = crate::tray::ClosePolicy::default();
        assert!(policy.minimize_to_tray);
    }

    #[test]
    fn settings_backed_policy_hides_window_on_close() {
        let settings = crate::settings::SettingsState::default();
        let policy = crate::tray::ClosePolicy::from_settings(&settings);

        assert!(matches!(
            crate::tray::close_action(&policy),
            crate::tray::CloseAction::HideToTray
        ));
    }
}
