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
import { currentIn, requireStay, scheduleWrite } from '@/trip/trip/Trip.guards'
import { scheduleDetailOf } from '@/trip/trip/Trip.shared'

const requireHotelDetails = (details: HotelDetails) => {
  const trimmed = trimmedHotelDetails(details)

  return Object.values(trimmed).some(
    (field) => field.length > hotelDetailMaxLength,
  )
    ? Effect.fail(new HotelDetailTooLong({ maxLength: hotelDetailMaxLength }))
    : Effect.succeed(trimmed)
}

/** The Hotel details write and the Stay edits. */
export const stayMethods = Effect.sync(() => {
  const writeHotelDetails = Effect.fn('Trip.writeHotelDetails')(function* ({
    stayId,
    details,
  }: WriteHotelDetails) {
    const trimmed = yield* requireHotelDetails(details)
    yield* scheduleWrite({}, (store, scheduleId) =>
      Effect.andThen(
        requireStay(store, scheduleId, stayId),
        store.writeHotelDetails(scheduleId, stayId, trimmed),
      ),
    )
  })

  /** Applies a Stay edit to the Schedule, returning it edited. */
  const editStays = Effect.fnUntraced(function* (
    store: ScheduleStore,
    scheduleId: ScheduleId,
    edit: StayEdit,
  ) {
    const { copy } = yield* currentIn(store)
    yield* store.saveStayEdit(scheduleId, yield* applyStayEdit(copy, edit))

    return { schedule: scheduleDetailOf(yield* currentIn(store)) }
  })

  const splitStay = Effect.fn('Trip.splitStay')(function* ({
    operationId,
    ...split
  }: SplitStay) {
    return yield* scheduleWrite(
      { recorded: { operationId, result: StaysEdited } },
      (store, scheduleId) =>
        editStays(store, scheduleId, StayEdit.Split(split)),
    )
  })

  const mergeStays = Effect.fn('Trip.mergeStays')(function* ({
    operationId,
    stayIds,
  }: MergeStays) {
    return yield* scheduleWrite(
      { recorded: { operationId, result: StaysEdited } },
      (store, scheduleId) =>
        editStays(store, scheduleId, StayEdit.Merge({ stayIds })),
    )
  })

  const moveStayBoundary = Effect.fn('Trip.moveStayBoundary')(function* ({
    ...move
  }: MoveStayBoundary) {
    return yield* scheduleWrite({}, (store, scheduleId) =>
      editStays(store, scheduleId, StayEdit.MoveBoundary(move)),
    )
  })

  const changeStayBase = Effect.fn('Trip.changeStayBase')(function* ({
    ...change
  }: ChangeStayBase) {
    return yield* scheduleWrite({}, (store, scheduleId) =>
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
