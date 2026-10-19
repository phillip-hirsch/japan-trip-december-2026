import { Match } from 'effect'

import type { ChecklistItem } from '@/trip/domain/domain'

export const reminderDateOf = (item: ChecklistItem) =>
  Match.value(item).pipe(
    Match.tags({
      ReserveSeats: ({ reminderDate }) => reminderDate,
      Own: ({ reminderDate }) => reminderDate,
    }),
    Match.orElse(() => undefined),
  )
