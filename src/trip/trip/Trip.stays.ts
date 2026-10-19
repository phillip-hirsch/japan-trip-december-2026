import { Effect, Option } from 'effect'

import {
  HotelDetailTooLong,
  ScheduleChanged,
  StaysEdited,
} from '@/trip/domain/domain'
import type {
  ChangeStayBase,
  HotelDetails,
  MergeStays,
  MoveStayBoundary,
  ScheduleId,
  SplitStay,
  StayEditTarget,
  WriteHotelDetails,
} from '@/trip/domain/domain'
import { trimmedHotelDetails } from '@/trip/domain/hotel-details'
import { hotelDetailMaxLength } from '@/trip/domain/limits'
import { applyStayEdit, StayEdit } from '@/trip/domain/schedule-copy'
import { scheduleStore } from '@/trip/schedule-store/schedule-store'
import type { ScheduleStore } from '@/trip/schedule-store/schedule-store'
import { requireCurrent, requireStay } from '@/trip/trip/Trip.guards'
import { CatalogueLookups } from '@/trip/trip/Trip.shared'

const requireHotelDetails = (details: HotelDetails) => {
  const trimmed = trimmedHotelDetails(details)

  return Object.values(trimmed).some(
    (field) => field.length > hotelDetailMaxLength,
  )
    ? Effect.fail(new HotelDetailTooLong({ maxLength: hotelDetailMaxLength }))
    : Effect.succeed(trimmed)
}

/** The Hotel details write and the Stay edits. */
export const stayMethods = Effect.gen(function* () {
  const { scheduleDetail } = yield* CatalogueLookups

  const writeHotelDetails = Effect.fn('Trip.writeHotelDetails')(
    function* ({ scheduleId, stayId, details }: WriteHotelDetails) {
      const trimmed = yield* requireHotelDetails(details)
      const store = yield* scheduleStore
      yield* store.transaction(
        Effect.gen(function* () {
          yield* requireStay(store, scheduleId, stayId)
          yield* store.writeHotelDetails(scheduleId, stayId, trimmed)
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const requireSchedule = Effect.fnUntraced(function* (
    store: ScheduleStore,
    scheduleId: ScheduleId,
  ) {
    const found = yield* store.scheduleById(scheduleId)

    if (Option.isNone(found)) return yield* new ScheduleChanged()

    return found.value
  })

  const editStays = Effect.fn('Trip.editStays')(
    function* ({ scheduleId, operationId }: StayEditTarget, edit: StayEdit) {
      const store = yield* scheduleStore

      return yield* store.transaction(
        Effect.gen(function* () {
          if (operationId !== undefined) {
            const recorded =
              yield* store.recordedResult(StaysEdited)(operationId)

            if (Option.isSome(recorded)) return recorded.value.result
          }

          yield* requireCurrent(store, scheduleId)
          const { copy } = yield* requireSchedule(store, scheduleId)
          yield* store.saveStayEdit(
            scheduleId,
            yield* applyStayEdit(copy, edit),
          )

          const result = {
            schedule: scheduleDetail(yield* requireSchedule(store, scheduleId)),
          }

          if (operationId !== undefined) {
            yield* store.recordResult(StaysEdited)({
              id: operationId,
              result,
            })
          }

          return result
        }),
      )
    },
    Effect.catchTag(['SqlError', 'SchemaError'], Effect.die),
  )

  const splitStay = ({ scheduleId, operationId, ...split }: SplitStay) =>
    editStays({ scheduleId, operationId }, StayEdit.Split(split)).pipe(
      Effect.withSpan('Trip.splitStay'),
    )

  const mergeStays = ({ scheduleId, operationId, stayIds }: MergeStays) =>
    editStays({ scheduleId, operationId }, StayEdit.Merge({ stayIds })).pipe(
      Effect.withSpan('Trip.mergeStays'),
    )

  const moveStayBoundary = ({ scheduleId, ...move }: MoveStayBoundary) =>
    editStays({ scheduleId }, StayEdit.MoveBoundary(move)).pipe(
      Effect.withSpan('Trip.moveStayBoundary'),
    )

  const changeStayBase = ({ scheduleId, ...change }: ChangeStayBase) =>
    editStays({ scheduleId }, StayEdit.ChangeBase(change)).pipe(
      Effect.withSpan('Trip.changeStayBase'),
    )

  return {
    writeHotelDetails,
    splitStay,
    mergeStays,
    moveStayBoundary,
    changeStayBase,
  }
})
