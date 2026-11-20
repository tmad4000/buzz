import * as React from "react";

import { useHomeDrafts } from "@/features/home/useHomeDrafts";
import {
  countDueReminders,
  useRemindersQuery,
} from "@/features/reminders/hooks";
import {
  groupReminders,
  isDue,
} from "@/features/reminders/lib/reminderFilters";

type UseHomePersonalInboxOptions = {
  allowMixedSelection: boolean;
  currentPubkey?: string;
  isDrafts: boolean;
  isNarrowHomeViewport: boolean;
  isReminders: boolean;
  onlyDue?: boolean;
  viewportWidthPx: number;
};

export function useHomePersonalInbox({
  allowMixedSelection,
  currentPubkey,
  isDrafts,
  isNarrowHomeViewport,
  isReminders,
  onlyDue = false,
  viewportWidthPx,
}: UseHomePersonalInboxOptions) {
  const remindersQuery = useRemindersQuery(currentPubkey);
  const dueReminderCount = countDueReminders(remindersQuery.data ?? []);
  const pendingReminders = React.useMemo(
    () =>
      groupReminders(remindersQuery.data ?? []).flatMap(
        (group) => group.reminders,
      ),
    [remindersQuery.data],
  );
  const [selectedReminderId, selectReminder] = React.useState<string | null>(
    null,
  );
  const selectedReminder =
    pendingReminders.find(
      (reminder) =>
        reminder.id === selectedReminderId &&
        (!onlyDue || isDue(reminder, Math.floor(Date.now() / 1_000))),
    ) ?? null;

  React.useEffect(() => {
    const selectionEnabled = isReminders || allowMixedSelection;
    if (!selectionEnabled) {
      selectReminder(null);
      return;
    }
    if (selectedReminderId !== null && selectedReminder === null) {
      selectReminder(null);
      return;
    }
    if (!isReminders) return;
    if (viewportWidthPx === 0 || selectedReminder !== null) return;
    selectReminder(
      isNarrowHomeViewport ? null : (pendingReminders[0]?.id ?? null),
    );
  }, [
    allowMixedSelection,
    isNarrowHomeViewport,
    isReminders,
    pendingReminders,
    selectedReminderId,
    selectedReminder,
    viewportWidthPx,
  ]);

  // Drafts are only listed (and selectable) under the dedicated Drafts
  // filter — they never appear in the mixed All view.
  const drafts = useHomeDrafts({
    autoSelect: isDrafts,
    isNarrowHomeViewport,
    selectionEnabled: isDrafts,
    viewportWidthPx,
  });

  return {
    drafts,
    dueReminderCount,
    pendingReminders,
    reminders: {
      selectedId: selectedReminderId,
      selectedItem: selectedReminder,
      select: selectReminder,
    },
  };
}
