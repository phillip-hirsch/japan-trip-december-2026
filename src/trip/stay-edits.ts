import { Effect, Struct } from 'effect'

import { HardRule, HardRuleBroken, Hotel, StayNotFound } from '@/trip/domain'
import type {
  ChangeStayBase,
  IsoDate,
  MergeStays,
  SplitStay,
} from '@/trip/domain'
import { isPlaceId } from '@/trip/places'
import type { ScheduleCopy, ScheduleStay } from '@/trip/schedule-store'
import type { StayEdit } from '@/trip/Trip'

const refuse = (rule: HardRule) => Effect.fail(new HardRuleBroken({ rule }))

const findStay = (copy: ScheduleCopy, stayId: string) => {
  const stay = copy.stays.find(({ id }) => id === stayId)

  return stay === undefined
    ? Effect.fail(new StayNotFound({ stayId }))
    : Effect.succeed(stay)
}

export const splitEdit =
  ({ stayId, date }: Pick<SplitStay, 'stayId' | 'date'>) =>
  (copy: ScheduleCopy) =>
    Effect.map(findStay(copy, stayId), (stay): StayEdit => {
      const later: ScheduleStay = {
        id: crypto.randomUUID(),
        base: stay.base,
        checkIn: date,
        checkOut: stay.checkOut,
        accommodation: stay.accommodation,
        highlights: [],
        hotel: Hotel.cases.NotRecorded.make({}),
      }

      return {
        stays: copy.stays.flatMap((each) =>
          each.id === stayId ? [{ ...each, checkOut: date }, later] : [each],
        ),
        moves: [
          ...copy.moves,
          { id: crypto.randomUUID(), date, mode: 'local', sections: [] },
        ],
      }
    })

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

export const changeBaseEdit =
  ({ stayId, place }: Pick<ChangeStayBase, 'stayId' | 'place'>) =>
  (copy: ScheduleCopy) =>
    Effect.gen(function* () {
      const stay = yield* findStay(copy, stayId)

      if (!isPlaceId(place)) {
        return yield* refuse(HardRule.cases.PlaceNotInCatalogue.make({ place }))
      }

      if (stay.base === place) return copy

      const adjoining = new Set([stay.checkIn, stay.checkOut])

      return {
        stays: copy.stays.map((each) =>
          each.id === stayId ? { ...each, base: place, highlights: [] } : each,
        ),
        moves: copy.moves.map((move) =>
          adjoining.has(move.date)
            ? { ...Struct.omit(move, ['duration']), sections: [] }
            : move,
        ),
      } satisfies StayEdit
    })

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

      const leftWithoutNights =
        checkOut <= stay.checkIn
          ? stay
          : next !== undefined && checkOut >= next.checkOut
            ? next
            : undefined

      if (leftWithoutNights !== undefined) {
        return yield* refuse(
          HardRule.cases.StayWithoutNights.make({
            checkIn: leftWithoutNights.checkIn,
          }),
        )
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
