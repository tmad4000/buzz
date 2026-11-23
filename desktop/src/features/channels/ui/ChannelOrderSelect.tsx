/** Shared Order menu for channel and thread presentation choices. */
export function ChannelOrderSelect<Value extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: Value) => void;
  options: readonly { value: Value; label: string; available?: boolean }[];
  value: Value;
}) {
  return (
    <label className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">Order</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => {
          const next = options.find(
            (option) => option.value === event.target.value,
          );
          if (next) onChange(next.value);
        }}
        className="min-w-0 max-w-48 bg-transparent font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.available === false}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
