use sqlx::Row;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopSettings {
    pub default_provider_id: Option<String>,
    pub active_workflow_id: Option<String>,
    pub appearance_theme: String,
    pub close_to_tray: bool,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            default_provider_id: None,
            active_workflow_id: None,
            appearance_theme: "system".to_string(),
            close_to_tray: true,
        }
    }
}

pub struct SettingsRepository {
    pool: sqlx::SqlitePool,
}

impl SettingsRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn load(&self) -> anyhow::Result<DesktopSettings> {
        let row = sqlx::query(
            "select default_provider_id, active_workflow_id, appearance_theme, close_to_tray from settings where id = 1",
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(match row {
            Some(row) => DesktopSettings {
                default_provider_id: row.get("default_provider_id"),
                active_workflow_id: row.get("active_workflow_id"),
                appearance_theme: row.get("appearance_theme"),
                close_to_tray: row.get::<i64, _>("close_to_tray") != 0,
            },
            None => DesktopSettings::default(),
        })
    }

    pub async fn save(&self, settings: &DesktopSettings) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            insert into settings (id, default_provider_id, active_workflow_id, appearance_theme, close_to_tray)
            values (1, ?1, ?2, ?3, ?4)
            on conflict(id) do update set
              default_provider_id = excluded.default_provider_id,
              active_workflow_id = excluded.active_workflow_id,
              appearance_theme = excluded.appearance_theme,
              close_to_tray = excluded.close_to_tray
            "#,
        )
        .bind(settings.default_provider_id.clone())
        .bind(settings.active_workflow_id.clone())
        .bind(settings.appearance_theme.clone())
        .bind(settings.close_to_tray as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
