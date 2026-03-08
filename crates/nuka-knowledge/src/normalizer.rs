#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedDocument {
    pub source_path: String,
    pub extension: String,
    pub content: String,
}

pub struct DocumentNormalizer;

impl DocumentNormalizer {
    pub fn supports_extension(extension: &str) -> bool {
        matches!(
            extension.trim().to_ascii_lowercase().as_str(),
            "pdf" | "md" | "markdown" | "txt" | "json" | "yaml" | "yml" | "rs" | "ts" | "tsx" | "py"
        )
    }

    pub fn normalize(path: &str, bytes: &[u8]) -> anyhow::Result<NormalizedDocument> {
        let extension = path
            .rsplit('.')
            .next()
            .map(str::to_ascii_lowercase)
            .unwrap_or_default();

        if !Self::supports_extension(&extension) {
            anyhow::bail!("unsupported extension: {extension}");
        }

        let content = if extension == "pdf" {
            format!("[pdf document: {path}]")
        } else {
            String::from_utf8(bytes.to_vec())?
        };

        Ok(NormalizedDocument {
            source_path: path.to_string(),
            extension,
            content,
        })
    }
}
