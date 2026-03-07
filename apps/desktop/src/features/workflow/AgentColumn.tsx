type AgentColumnProps = {
  title: string;
};

export function AgentColumn({ title }: AgentColumnProps) {
  return (
    <article>
      <h3>{title}</h3>
      <p>Workflow agent slot placeholder.</p>
    </article>
  );
}
