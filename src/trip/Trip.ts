import { Context, DateTime, Duration, Effect, Layer, Schema } from 'effect'

/** The Trip's time zone: every Day is a calendar date in Tokyo. */
export const tripTimeZone = 'Asia/Tokyo'

/** Arrival: the first Day of the Trip. */
export const tripStartDate = '2026-12-06'

/**
 * Whole Tokyo calendar dates until the Trip starts at 00:00 on December 6 in
 * Tokyo, or Ended once that moment has passed. The time of day never changes
 * the count.
 */
export const Countdown = Schema.TaggedUnion({
  Counting: { days: Schema.Int },
  Ended: {},
})
export type Countdown = typeof Countdown.Type

export const HomeState = Schema.Struct({ countdown: Countdown })
export type HomeState = typeof HomeState.Type

const tripStart = DateTime.makeUnsafe(tripStartDate)

const countdownAt = (now: DateTime.DateTime): Countdown => {
  const today = DateTime.removeTime(
    DateTime.setZoneNamedUnsafe(now, tripTimeZone),
  )
  const days = Math.round(Duration.toDays(DateTime.distance(today, tripStart)))
  return days > 0 ? { _tag: 'Counting', days } : { _tag: 'Ended' }
}

/** The application seam: all Trip behaviour, independent of HTTP and React. */
export class Trip extends Context.Service<
  Trip,
  {
    /** Home's state at the current moment of the Clock. */
    readonly home: Effect.Effect<HomeState>
  }
>()('japan-trip/trip/Trip') {
  static readonly layer = Layer.succeed(
    Trip,
    Trip.of({
      home: Effect.map(DateTime.now, (now) => ({
        countdown: countdownAt(now),
      })),
    }),
  )
}
