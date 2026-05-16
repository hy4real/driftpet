import type { CardRecord } from "../main/types/card";
import { getThreadWaitingReminder } from "./thread-cache-waiting";

export type WaitingReminderSignal = {
  key: string;
  note: string;
  duration: number;
};

export const WAITING_REMINDER_COOLDOWN_MS = 60 * 1000;

export const getWaitingReminderSignal = (
  card: CardRecord | null,
  now = Date.now()
): WaitingReminderSignal | null => {
  if (card === null) {
    return null;
  }

  const reminder = getThreadWaitingReminder(card, now);
  if (reminder.state === "active" && reminder.waitingOn !== null) {
    if (reminder.age === "cooling") {
      return {
        key: `waiting:${card.id}:cooling`,
        note: reminder.meanwhile !== null
          ? `这条线等了一阵了。别围着“${reminder.waitingOn}”空转，先去做：${reminder.meanwhile}`
          : `这条线等了一阵了。先别围着“${reminder.waitingOn}”空转。`,
        duration: 3800,
      };
    }

    if (reminder.age === "cold") {
      return {
        key: `waiting:${card.id}:cold`,
        note: reminder.meanwhile !== null
          ? `这条线别再干等了。先做别的：${reminder.meanwhile}。如果这会儿接不上，就先放下这条。`
          : `这条线别再干等了。要么接着做别的，要么考虑先放下这条。`,
        duration: 4200,
      };
    }

    return null;
  }

  if (reminder.state === "resolved" && reminder.age === "resolved_fresh") {
    return {
      key: `waiting:${card.id}:resolved:${reminder.resolvedAt ?? 0}`,
      note: "这条线等回来了，可以直接接着做。",
      duration: 3200,
    };
  }

  return null;
};
