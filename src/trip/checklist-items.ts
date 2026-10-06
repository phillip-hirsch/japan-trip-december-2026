// Facts about Checklist items that the Trip service and the browser share.
// See AGENTS.md: Effect in the browser.
import { Match } from 'effect'

import type { ChecklistItem } from '@/trip/domain'

/** An item's reminder date, if it has one. Nothing is ever sent for it. */
export const reminderDateOf = (item: ChecklistItem) =>
  Match.value(item).pipe(
    Match.tags({
      ReserveSeats: ({ reminderDate }) => reminderDate,
      Own: ({ reminderDate }) => reminderDate,
    }),
    Match.orElse(() => undefined),
  )
