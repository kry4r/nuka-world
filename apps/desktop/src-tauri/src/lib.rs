pub fn run() {
    let _builder = tauri::Builder::default();
}

#[cfg(test)]
mod tests {
    #[test]
    fn desktop_workspace_bootstrap_placeholder() {
        assert!(std::path::Path::new("../package.json").exists());
    }
}
