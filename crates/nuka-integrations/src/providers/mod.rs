pub mod anthropic;
pub mod openai;

#[derive(Default)]
pub struct ProviderRegistry(Vec<String>);

impl ProviderRegistry {
    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn names(&self) -> Vec<String> {
        self.0.clone()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn provider_registry_starts_empty() {
        let registry = crate::providers::ProviderRegistry::default();
        assert_eq!(registry.len(), 0);
    }
}
