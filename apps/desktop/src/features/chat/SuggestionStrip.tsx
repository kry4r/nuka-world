type SuggestionStripProps = {
  disabled?: boolean;
  onSelect: (value: string) => void;
  suggestions: string[];
};

export function SuggestionStrip({
  disabled = false,
  onSelect,
  suggestions,
}: SuggestionStripProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div aria-label="Suggested next steps" className="suggestion-strip">
      {suggestions.map((suggestion) => (
        <button
          className="suggestion-strip__action"
          disabled={disabled}
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          type="button"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
