import { Effect } from 'effect'

import { HardRule, HardRuleBroken, StayNotFound } from '@/trip/domain'
import type { IsoDate } from '@/trip/domain'
import type { ScheduleCopy, StayEdit } from '@/trip/Trip'

/**
 * The Stay edit moving the date a Stay checks out. The next Stay's check-in
 * and the Move on the old date move with it. The last Stay has no next Stay,
 * so its check-out moves alone, and editStays refuses any date but
 * December 20 with NotTheTripDates.
 *
 * A date that leaves either Stay without a night is refused here with
 * StayWithoutNights, naming that Stay's check-in as it is now. Any other
 * date keeps the Stays in order, so the Hard rule editStays reports is the
 * one the move breaks.
 */
export const stayBoundaryMove =
  (stayId: string, checkOut: IsoDate) =>
  (
    copy: ScheduleCopy,
  ): Effect.Effect<StayEdit, StayNotFound | HardRuleBroken> =>
    Effect.gen(function* () {
      const stay = copy.stays.find(({ id }) => id === stayId)

      if (stay === undefined) return yield* new StayNotFound({ stayId })

      const from = stay.checkOut
      const next = copy.stays.find(({ checkIn }) => checkIn === from)

      const withoutNights =
        checkOut <= stay.checkIn
          ? stay
          : next !== undefined && checkOut >= next.checkOut
            ? next
            : undefined

      if (withoutNights !== undefined) {
        return yield* new HardRuleBroken({
          rule: HardRule.cases.StayWithoutNights.make({
            checkIn: withoutNights.checkIn,
          }),
        })
      }

      return {
        stays: copy.stays.map((each) =>
          each.id === stayId
            ? { ...each, checkOut }
            : each === next
              ? { ...each, checkIn: checkOut }
              : each,
        ),
        moves: copy.moves.map((move) =>
          move.date === from ? { ...move, date: checkOut } : move,
        ),
      }
    })
