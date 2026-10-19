import { Effect } from 'effect'

import { HotelDetailTooLong, StaysEdited } from '@/trip/domain/domain'
import type {
  ChangeStayBase,
  HotelDetails,
  MergeStays,
  MoveStayBoundary,
  ScheduleId,
  SplitStay,
  WriteHotelDetails,
} from '@/trip/domain/domain'
import { trimmedHotelDetails } from '@/trip/domain/hotel-details'
import { hotelDetailMaxLength } from '@/trip/domain/limits'
import { applyStayEdit, StayEdit } from '@/trip/domain/schedule-copy'
import type { ScheduleStore } from '@/trip/schedule-store/schedule-store'
import {
  namedSchedule,
  requireStay,
  scheduleWrite,
} from '@/trip/trip/Trip.guards'
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

  const writeHotelDetails = Effect.fn('Trip.writeHotelDetails')(function* ({
    scheduleId,
    stayId,
    details,
  }: WriteHotelDetails) {
    const trimmed = yield* requireHotelDetails(details)
    yield* scheduleWrite({ naming: scheduleId }, (store) =>
      Effect.andThen(
        requireStay(store, scheduleId, stayId),
        store.writeHotelDetails(scheduleId, stayId, trimmed),
      ),
    )
  })

  /** Applies a Stay edit to the Schedule named, returning it edited. */
  const editStays = Effect.fnUntraced(function* (
    store: ScheduleStore,
    scheduleId: ScheduleId,
    edit: StayEdit,
  ) {
    const { copy } = yield* namedSchedule(store, scheduleId)
    yield* store.saveStayEdit(scheduleId, yield* applyStayEdit(copy, edit))

    return { schedule: scheduleDetail(yield* namedSchedule(store, scheduleId)) }
  })

  const splitStay = Effect.fn('Trip.splitStay')(function* ({
    scheduleId,
    operationId,
    ...split
  }: SplitStay) {
    return yield* scheduleWrite(
      { naming: scheduleId, recorded: { operationId, result: StaysEdited } },
      (store) => editStays(store, scheduleId, StayEdit.Split(split)),
    )
  })

  const mergeStays = Effect.fn('Trip.mergeStays')(function* ({
    scheduleId,
    operationId,
    stayIds,
  }: MergeStays) {
    return yield* scheduleWrite(
      { naming: scheduleId, recorded: { operationId, result: StaysEdited } },
      (store) => editStays(store, scheduleId, StayEdit.Merge({ stayIds })),
    )
  })

  const moveStayBoundary = Effect.fn('Trip.moveStayBoundary')(function* ({
    scheduleId,
    ...move
  }: MoveStayBoundary) {
    return yield* scheduleWrite({ naming: scheduleId }, (store) =>
      editStays(store, scheduleId, StayEdit.MoveBoundary(move)),
    )
  })

  const changeStayBase = Effect.fn('Trip.changeStayBase')(function* ({
    scheduleId,
    ...change
  }: ChangeStayBase) {
    return yield* scheduleWrite({ naming: scheduleId }, (store) =>
      editStays(store, scheduleId, StayEdit.ChangeBase(change)),
    )
  })

  return {
    writeHotelDetails,
    splitStay,
    mergeStays,
    moveStayBoundary,
    changeStayBase,
  }
})
