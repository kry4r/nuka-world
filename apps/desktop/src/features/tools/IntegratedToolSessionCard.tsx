type IntegratedToolSessionCardProps = {
  toolName: string;
  targetScope: string;
};

export function IntegratedToolSessionCard({ toolName, targetScope }: IntegratedToolSessionCardProps) {
  return (
    <article>
      <h3>{toolName}</h3>
      <p>Default output scope: {targetScope}</p>
    </article>
  );
}
