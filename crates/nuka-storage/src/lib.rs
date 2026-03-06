pub mod db;
pub mod memory;
pub mod migrations;
pub mod sessions;
pub mod tools;
pub mod workflows;

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn creates_and_reads_workflow_template() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::workflows::WorkflowRepository::new(db.clone());
        repo.insert_template("engineering-room").await.unwrap();

        let items = repo.list_templates().await.unwrap();
        assert_eq!(items.len(), 1);
    }
}
