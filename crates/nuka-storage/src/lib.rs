pub mod db;
pub mod memory;
pub mod migrations;
pub mod sessions;
pub mod tools;
pub mod workflows;

#[cfg(test)]
mod tests {
    use nuka_domain::workflow::WorkflowVisibility;

    #[tokio::test]
    async fn creates_and_reads_workflow_template() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::workflows::WorkflowRepository::new(db.clone());
        repo.insert_template("engineering-room").await.unwrap();

        let items = repo.list_templates().await.unwrap();
        assert_eq!(items.len(), 1);
    }

    #[tokio::test]
    async fn reruns_migrations_and_reads_private_workflow_template() {
        let db = crate::db::open_in_memory().await.unwrap();
        crate::migrations::run(&db).await.unwrap();
        crate::migrations::run(&db).await.unwrap();

        let repo = crate::workflows::WorkflowRepository::new(db.clone());
        repo.insert_template("engineering-room").await.unwrap();

        let items = repo.list_templates().await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "engineering-room");
        assert_eq!(items[0].visibility, WorkflowVisibility::Private);
    }
}
