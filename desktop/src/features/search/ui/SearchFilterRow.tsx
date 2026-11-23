import { ArrowDownUp, CalendarDays, Hash, UserRound, X } from "lucide-react";
import * as React from "react";

import { useUserSearchQuery } from "@/features/profile/hooks";
import {
  formatOperatorValue,
  parseSearchOperators,
  setSearchOperator,
  shiftDay,
  toOperatorDay,
} from "@/features/search/lib/parseSearchOperators";
import {
  parseSearchSort,
  SEARCH_SORT_LABELS,
  SEARCH_SORTS,
  type SearchSort,
} from "@/features/search/lib/searchSort";
import { getChannelScopeLabel } from "@/features/search/ui/SearchScopeControls";
import type { PickedOperatorValue } from "@/features/search/useSearchResults";
import type { Channel, UserSearchResult } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { truncateNpub } from "@/shared/lib/pubkey";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

const PICKER_LIMIT = 20;

const CHIP_CLASS =
  "flex h-7 max-w-48 items-center gap-1.5 rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-3.5 [&_svg]:shrink-0";
const CHIP_ACTIVE_CLASS =
  "border-primary/20 bg-primary/10 text-foreground hover:bg-primary/15";
const OPTION_CLASS =
  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-hidden";

function FilterChip({
  children,
  icon,
  label,
  onClear,
  onOpenChange,
  open,
  testId,
  value,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  testId: string;
  value: string | null;
}) {
  return (
    <span className="flex min-w-0 items-center">
      <Popover onOpenChange={onOpenChange} open={open}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              CHIP_CLASS,
              value !== null &&
                cn(CHIP_ACTIVE_CLASS, "rounded-r-none border-r-0"),
            )}
            data-testid={testId}
            type="button"
          >
            {icon}
            <span className="truncate">
              {value === null ? label : `${label}: ${value}`}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label={`${label} filter`}
          className="w-64 p-2"
        >
          {children}
        </PopoverContent>
      </Popover>
      {value !== null ? (
        <button
          aria-label={`Clear ${label} filter`}
          className={cn(
            CHIP_CLASS,
            CHIP_ACTIVE_CLASS,
            "rounded-l-none border-l-0 px-1.5",
          )}
          data-testid={`${testId}-clear`}
          onClick={onClear}
          type="button"
        >
          <X />
        </button>
      ) : null}
    </span>
  );
}

function userName(user: UserSearchResult): string {
  return (
    user.displayName?.trim() ||
    user.nip05Handle?.trim() ||
    truncateNpub(user.pubkey)
  );
}

function FromPicker({
  onSelect,
}: {
  onSelect: (user: UserSearchResult) => void;
}) {
  const [search, setSearch] = React.useState("");
  const usersQuery = useUserSearchQuery(search, {
    allowEmpty: true,
    limit: PICKER_LIMIT,
  });
  return (
    <>
      <Input
        aria-label="Find a person or agent"
        autoFocus
        data-testid="search-filter-from-input"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Person or agent"
        value={search}
      />
      <div className="mt-1.5 max-h-60 overflow-y-auto">
        {usersQuery.isError ? (
          <p className="px-2 py-1.5 text-xs text-destructive">
            Could not load people.
          </p>
        ) : usersQuery.data?.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No one found.
          </p>
        ) : null}
        {usersQuery.data?.map((user) => (
          <button
            className={OPTION_CLASS}
            data-testid={`search-filter-from-${user.pubkey}`}
            key={user.pubkey}
            onClick={() => onSelect(user)}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">{userName(user)}</span>
            {user.isAgent ? (
              <span className="shrink-0 text-2xs text-muted-foreground">
                Agent
              </span>
            ) : null}
            {/* Display names repeat; the key tells the picks apart. */}
            <span className="shrink-0 text-2xs text-muted-foreground/75">
              {truncateNpub(user.pubkey)}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function ChannelPicker({
  channels,
  labelFor,
  onSelect,
}: {
  channels: Channel[];
  labelFor: (channel: Channel) => string;
  onSelect: (channel: Channel) => void;
}) {
  const [search, setSearch] = React.useState("");
  const needle = search.trim().replace(/^#/, "").toLowerCase();
  const matches = channels
    .filter(
      (channel) =>
        channel.isMember && labelFor(channel).toLowerCase().includes(needle),
    )
    .sort((a, b) => labelFor(a).localeCompare(labelFor(b)));
  return (
    <>
      <Input
        aria-label="Find a channel"
        autoFocus
        data-testid="search-filter-in-input"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Channel"
        value={search}
      />
      <div className="mt-1.5 max-h-60 overflow-y-auto">
        {matches.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No channel found.
          </p>
        ) : null}
        {matches.map((channel) => (
          <button
            className={OPTION_CLASS}
            data-testid={`search-filter-in-${channel.id}`}
            key={channel.id}
            onClick={() => onSelect(channel)}
            type="button"
          >
            <span className="truncate">{labelFor(channel)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** First and last included local days of the parsed range. */
function includedDays(query: string) {
  const { since, until } = parseSearchOperators(query);
  return {
    first: since === null ? "" : toOperatorDay(new Date(since * 1_000)),
    // `before:` is exclusive, so `until` falls on the last included day.
    last: until === null ? "" : toOperatorDay(new Date(until * 1_000)),
  };
}

function withDays(query: string, first: string, last: string): string {
  const dayAfter = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return toOperatorDay(shiftDay(new Date(year, month - 1, date), 1));
  };
  return setSearchOperator(
    setSearchOperator(query, "after", first || null),
    "before",
    last ? dayAfter(last) : null,
  );
}

function DateRange({
  onQueryChange,
  query,
}: {
  onQueryChange: (query: string) => void;
  query: string;
}) {
  const id = React.useId();
  // Native date inputs emit half-typed years; commit only plausible days.
  const [draft, setDraft] = React.useState(() => includedDays(query));
  const commit = (next: { first: string; last: string }) => {
    setDraft(next);
    const isReversed = next.first && next.last && next.first > next.last;
    if (isReversed) return;
    if ([next.first, next.last].every((day) => !day || day >= "1970-01-02")) {
      onQueryChange(withDays(query, next.first, next.last));
    }
  };
  const preset = (days: number) => {
    const today = new Date();
    commit({ first: toOperatorDay(shiftDay(today, 1 - days)), last: "" });
  };
  const reversed = draft.first && draft.last && draft.first > draft.last;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["Today", 1],
            ["Past 7 days", 7],
            ["Past 30 days", 30],
          ] as const
        ).map(([label, days]) => (
          <button
            className={CHIP_CLASS}
            key={label}
            onClick={() => preset(days)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {(
        [
          ["first", "From"],
          ["last", "Through"],
        ] as const
      ).map(([key, label]) => (
        <div className="flex items-center gap-2" key={key}>
          <label
            className="w-16 text-xs text-muted-foreground"
            htmlFor={`${id}-${key}`}
          >
            {label}
          </label>
          <Input
            data-testid={`search-filter-date-${key}`}
            id={`${id}-${key}`}
            onChange={(event) =>
              commit({ ...draft, [key]: event.target.value })
            }
            type="date"
            value={draft[key]}
          />
        </div>
      ))}
      {reversed ? (
        <p className="text-xs text-destructive" role="alert">
          The start is after the end.
        </p>
      ) : null}
    </div>
  );
}

/** Visible controls for the operators typed in the search box, and the sort. */
export function SearchFilterRow({
  channelLabels,
  channels,
  currentPubkey,
  hideChannel,
  onPick,
  onQueryChange,
  onSortChange,
  query,
  sort,
}: {
  channelLabels?: Record<string, string>;
  channels: Channel[];
  currentPubkey?: string;
  hideChannel: boolean;
  onPick: (kind: "from" | "in", value: PickedOperatorValue | null) => void;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: SearchSort) => void;
  query: string;
  sort: SearchSort;
}) {
  const [open, setOpen] = React.useState<"from" | "in" | "date" | null>(null);
  const openProps = (key: "from" | "in" | "date") => ({
    open: open === key,
    onOpenChange: (next: boolean) => setOpen(next ? key : null),
  });
  const parsed = parseSearchOperators(query);
  const days = includedDays(query);
  const dateValue =
    days.first && days.last
      ? days.first === days.last
        ? days.first
        : `${days.first} – ${days.last}`
      : days.first
        ? `since ${days.first}`
        : days.last
          ? `through ${days.last}`
          : null;
  const pick = (kind: "from" | "in", name: string, id: string) => {
    setOpen(null);
    // A name the operator syntax cannot carry falls back to the id itself.
    onPick(kind, { written: formatOperatorValue(name) ? name : id, id });
  };

  return (
    <fieldset
      aria-label="Search filters"
      className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-border/70 px-4 py-2"
      data-testid="search-filter-row"
    >
      <FilterChip
        {...openProps("from")}
        icon={<UserRound />}
        label="From"
        onClear={() => onPick("from", null)}
        testId="search-filter-from"
        value={parsed.from?.replace(/^@/, "") ?? null}
      >
        <FromPicker
          onSelect={(user) => pick("from", `@${userName(user)}`, user.pubkey)}
        />
      </FilterChip>
      {hideChannel ? null : (
        <FilterChip
          {...openProps("in")}
          icon={<Hash />}
          label="In"
          onClear={() => onPick("in", null)}
          testId="search-filter-in"
          value={parsed.in}
        >
          <ChannelPicker
            channels={channels}
            labelFor={(channel) =>
              getChannelScopeLabel(channel, channelLabels, currentPubkey)
            }
            onSelect={(channel) =>
              pick(
                "in",
                getChannelScopeLabel(channel, channelLabels, currentPubkey),
                channel.id,
              )
            }
          />
        </FilterChip>
      )}
      <FilterChip
        {...openProps("date")}
        icon={<CalendarDays />}
        label="Date"
        onClear={() => onQueryChange(withDays(query, "", ""))}
        testId="search-filter-date"
        value={dateValue}
      >
        <DateRange onQueryChange={onQueryChange} query={query} />
      </FilterChip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(CHIP_CLASS, "ml-auto")}
            data-testid="search-sort"
            type="button"
          >
            <ArrowDownUp />
            Sort: {SEARCH_SORT_LABELS[sort]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            onValueChange={(value) => onSortChange(parseSearchSort(value))}
            value={sort}
          >
            {SEARCH_SORTS.map((option) => (
              <DropdownMenuRadioItem
                data-testid={`search-sort-${option}`}
                key={option}
                value={option}
              >
                {SEARCH_SORT_LABELS[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </fieldset>
  );
}
