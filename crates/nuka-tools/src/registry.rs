pub struct ToolBindingSet(Vec<String>);

impl ToolBindingSet {
    pub fn from_names<const N: usize>(names: [&str; N]) -> Self {
        Self(names.into_iter().map(|name| name.to_string()).collect())
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn into_vec(self) -> Vec<String> {
        self.0
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn agent_can_bind_multiple_tools() {
        let bindings = crate::registry::ToolBindingSet::from_names(["codex", "git", "search_knowledge"]);
        assert_eq!(bindings.len(), 3);
    }
}
