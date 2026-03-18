use nuka_domain::knowledge::{KnowledgeCollection, KnowledgeConnector, KnowledgeConnectorKind};
use sqlx::Row;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeIndexJobRecord {
    pub id: String,
    pub collection_id: String,
    pub status: String,
    pub detail: Option<String>,
}

pub struct KnowledgeRepository {
    pool: sqlx::SqlitePool,
}

impl KnowledgeRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert_collection(&self, collection: KnowledgeCollection) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            insert into knowledge_collections (
              id, name, description, engine, supported_extensions, created_at, updated_at
            )
            values (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))
            on conflict(id) do update set
              name = excluded.name,
              description = excluded.description,
              engine = excluded.engine,
              supported_extensions = excluded.supported_extensions,
              updated_at = datetime('now')
            "#,
        )
        .bind(collection.id.clone())
        .bind(collection.name)
        .bind(collection.description)
        .bind(collection.engine)
        .bind(encode_list(&collection.supported_extensions))
        .execute(&mut *tx)
        .await?;

        sqlx::query("delete from knowledge_connectors where collection_id = ?1")
            .bind(collection.id.clone())
            .execute(&mut *tx)
            .await?;

        for connector in collection.connectors {
            let (kind, path) = match connector.kind {
                KnowledgeConnectorKind::LocalFolder { path } => ("local_folder", path),
            };

            sqlx::query(
                r#"
                insert into knowledge_connectors (id, collection_id, kind, path, enabled, created_at)
                values (?1, ?2, ?3, ?4, ?5, datetime('now'))
                "#,
            )
            .bind(connector.id)
            .bind(collection.id.clone())
            .bind(kind)
            .bind(path)
            .bind(connector.enabled as i64)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn list_collections(&self) -> anyhow::Result<Vec<KnowledgeCollection>> {
        let rows = sqlx::query(
            "select id, name, description, engine, supported_extensions from knowledge_collections order by created_at asc",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut collections = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get("id");
            let connectors = sqlx::query(
                "select id, kind, path, enabled from knowledge_connectors where collection_id = ?1 order by created_at asc",
            )
            .bind(&id)
            .fetch_all(&self.pool)
            .await?
            .into_iter()
            .map(|connector| {
                let kind = match connector.get::<String, _>("kind").as_str() {
                    "local_folder" => KnowledgeConnectorKind::LocalFolder {
                        path: connector.get("path"),
                    },
                    other => unreachable!("unknown connector kind: {other}"),
                };

                KnowledgeConnector {
                    id: connector.get("id"),
                    kind,
                    enabled: connector.get::<i64, _>("enabled") != 0,
                }
            })
            .collect();

            collections.push(KnowledgeCollection {
                id,
                name: row.get("name"),
                description: row.get("description"),
                engine: row.get("engine"),
                connectors,
                supported_extensions: decode_list(&row.get::<String, _>("supported_extensions")),
            });
        }

        Ok(collections)
    }

    pub async fn record_index_job(&self, job: KnowledgeIndexJobRecord) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            insert into knowledge_index_jobs (id, collection_id, status, detail, created_at)
            values (?1, ?2, ?3, ?4, datetime('now'))
            on conflict(id) do update set
              status = excluded.status,
              detail = excluded.detail
            "#,
        )
        .bind(job.id)
        .bind(job.collection_id)
        .bind(job.status)
        .bind(job.detail)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list_index_jobs(
        &self,
        collection_id: &str,
    ) -> anyhow::Result<Vec<KnowledgeIndexJobRecord>> {
        let rows = sqlx::query(
            "select id, collection_id, status, detail from knowledge_index_jobs where collection_id = ?1 order by created_at asc",
        )
        .bind(collection_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| KnowledgeIndexJobRecord {
                id: row.get("id"),
                collection_id: row.get("collection_id"),
                status: row.get("status"),
                detail: row.get("detail"),
            })
            .collect())
    }
}

fn encode_list(items: &[String]) -> String {
    items.join("\n")
}

fn decode_list(items: &str) -> Vec<String> {
    if items.is_empty() {
        Vec::new()
    } else {
        items.split('\n').map(str::to_string).collect()
    }
}
