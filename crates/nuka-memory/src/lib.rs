pub mod layers;
pub mod promote;

pub fn crate_name() -> &'static str {
    "nuka-memory"
}

#[cfg(test)]
mod tests {
    #[test]
    fn saved_workflow_can_promote_session_memory_to_shared_memory() {
        let result = crate::promote::can_promote_to_workflow_shared(true);
        assert!(result);
    }
}
