type AgentColumnProps = {
  title: string;
  description: string;
  status: string;
  detail?: string;
};

export function AgentColumn({ description, detail, status, title }: AgentColumnProps) {
  return (
    <article
      style={{
        display: "grid",
        gap: "0.45rem",
        padding: "1rem 1.1rem",
        borderRadius: "1.2rem",
        border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
        background: "var(--surface-raised, rgba(10, 16, 24, 0.68))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>{title}</h3>
        <span
          style={{
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted, rgba(255, 255, 255, 0.64))",
          }}
        >
          {status}
        </span>
      </div>
      <p style={{ margin: 0, color: "var(--text-muted, rgba(255, 255, 255, 0.72))" }}>{description}</p>
      {detail ? (
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-subtle, rgba(255, 255, 255, 0.56))" }}>
          {detail}
        </p>
      ) : null}
    </article>
  );
}
