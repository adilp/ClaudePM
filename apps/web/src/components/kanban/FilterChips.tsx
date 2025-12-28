/**
 * Filter Chips
 * Multi-select chip filter for filtering tickets by project prefix
 */

interface FilterChipsProps {
  prefixes: string[];
  selectedPrefixes: string[];
  onSelectionChange: (prefixes: string[]) => void;
}

export function FilterChips({
  prefixes,
  selectedPrefixes,
  onSelectionChange,
}: FilterChipsProps) {
  const allSelected = selectedPrefixes.length === 0;

  const handleChipClick = (prefix: string) => {
    if (selectedPrefixes.includes(prefix)) {
      // Remove prefix from selection
      const newSelection = selectedPrefixes.filter((p) => p !== prefix);
      onSelectionChange(newSelection);
    } else {
      // Add prefix to selection
      onSelectionChange([...selectedPrefixes, prefix]);
    }
  };

  const handleAllClick = () => {
    // Clear selection to show all
    onSelectionChange([]);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">Filter:</span>

      {/* All chip */}
      <button
        onClick={handleAllClick}
        className={`
          inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
          transition-colors
          ${
            allSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }
        `}
      >
        All
      </button>

      {/* Prefix chips */}
      {prefixes.map((prefix) => {
        const isSelected = selectedPrefixes.includes(prefix);
        return (
          <button
            key={prefix}
            onClick={() => handleChipClick(prefix)}
            className={`
              inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
              transition-colors
              ${
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }
            `}
          >
            {prefix}
          </button>
        );
      })}
    </div>
  );
}
