// The split and merge Stay edits, which the Trip service runs through
// editStays. Each takes the Schedule's copy and returns its Stays and Moves as
// edited, or the refusal that leaves the Schedule as it is.
import { Effect } from 'effect'

import { HardRule, HardRuleBroken, Hotel, StayNotFound } from '@/trip/domain'
import type { MergeStays, SplitStay } from '@/trip/domain'
import type { ScheduleCopy, ScheduleStay } from '@/trip/schedule-store'
import type { StayEdit } from '@/trip/Trip'

const refuse = (rule: HardRule) => Effect.fail(new HardRuleBroken({ rule }))

const findStay = (copy: ScheduleCopy, stayId: string) => {
  const stay = copy.stays.find(({ id }) => id === stayId)

  return stay === undefined
    ? Effect.fail(new StayNotFound({ stayId }))
    : Effect.succeed(stay)
}

/**
 * Splits a Stay at a date after its check-in and before its check-out. The
 * Stay keeps its id, Hotel details, Stay note and highlights, and checks out
 * on the date. A new Stay in the same Base, with nothing recorded, checks in
 * on it, and a new local Move joins the two. A date outside the Stay leaves
 * one part without nights.
 */
export const splitEdit =
  ({ stayId, date }: Pick<SplitStay, 'stayId' | 'date'>) =>
  (copy: ScheduleCopy) =>
    Effect.flatMap(
      findStay(copy, stayId),
      (stay): Effect.Effect<StayEdit, HardRuleBroken> => {
        // editStays would refuse such a split too, but it might name a Gap or
        // Overlap first. Checking here names the empty part.
        if (date <= stay.checkIn || stay.checkOut <= date) {
          return refuse(
            HardRule.cases.StayWithoutNights.make({
              checkIn: date <= stay.checkIn ? stay.checkIn : date,
            }),
          )
        }

        const later: ScheduleStay = {
          id: crypto.randomUUID(),
          base: stay.base,
          checkIn: date,
          checkOut: stay.checkOut,
          accommodation: stay.accommodation,
          highlights: [],
          hotel: Hotel.cases.NotRecorded.make({}),
        }

        return Effect.succeed({
          stays: copy.stays.flatMap((each) =>
            each.id === stayId ? [{ ...each, checkOut: date }, later] : [each],
          ),
          moves: [
            ...copy.moves,
            { id: crypto.randomUUID(), date, mode: 'local', sections: [] },
          ],
        })
      },
    )

/**
 * Merges two adjacent Stays in one Base. The earlier one keeps its id, Hotel
 * details and Stay note, and checks out when the later one did. It gains the
 * later one's highlights, so merging undoes a split. The later Stay and the
 * Move between them are removed.
 */
export const mergeEdit =
  ({ stayIds }: Pick<MergeStays, 'stayIds'>) =>
  (copy: ScheduleCopy) =>
    Effect.gen(function* () {
      const a = yield* findStay(copy, stayIds[0])
      const b = yield* findStay(copy, stayIds[1])
      const [earlier, later] = a.checkIn <= b.checkIn ? [a, b] : [b, a]

      if (earlier.checkOut !== later.checkIn) {
        return yield* refuse(HardRule.cases.StaysNotAdjacent.make({}))
      }

      if (earlier.base !== later.base) {
        return yield* refuse(HardRule.cases.StaysInDifferentBases.make({}))
      }

      const merged: ScheduleStay = {
        ...earlier,
        checkOut: later.checkOut,
        highlights: [...new Set([...earlier.highlights, ...later.highlights])],
      }

      return {
        stays: copy.stays.flatMap((stay) =>
          stay.id === later.id ? [] : [stay.id === earlier.id ? merged : stay],
        ),
        moves: copy.moves.filter((move) => move.date !== later.checkIn),
      } satisfies StayEdit
    })
