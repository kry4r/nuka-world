import type { TeamRecord } from "@/lib/team";

type TeamListProps = {
  teams: TeamRecord[];
  selectedTeamId: string | null;
  onSelect: (teamId: string) => void;
};

export function TeamList({ teams, selectedTeamId, onSelect }: TeamListProps) {
  return (
    <aside className="team-list" data-testid="team-list">
      <div className="team-list__header">
        <h1>Teams</h1>
      </div>

      <div className="team-list__stack">
        {teams.length === 0 ? (
          <div
            className="team-list__empty team-list__empty--centered"
            data-testid="team-list-empty"
          >
            No teams yet.
          </div>
        ) : (
          teams.map((team) => {
            const isActive = team.id === selectedTeamId;

            return (
              <button
                aria-pressed={isActive}
                className={`team-list__item${isActive ? " is-active" : ""}`}
                key={team.id}
                onClick={() => onSelect(team.id)}
                type="button"
              >
                <span className="team-list__item-title">{team.name}</span>
                <span className="team-list__item-summary">{team.summary}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
