import { assert, describe, it } from '@effect/vitest'
import { Duration, Effect, Fiber, Option, Predicate } from 'effect'
import { TestClock } from 'effect/testing'

import { december, Hotel } from '@/trip/domain'
import type { IsoDate, Pin, PinTarget, ScheduleId } from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import {
  LinkRequestFailed,
  LocationLinkResolver,
} from '@/trip/LocationLinkResolver'
import { operation, storage, tripWith } from '@/trip/testing'
import { Trip } from '@/trip/Trip'

const trip = tripWith([option1, option2])

const resolve = (link: string) =>
  Trip.use((trip) => trip.resolveLocationLink({ link }))

/** The tag resolving a link failed with, and the reason for a refusal. */
const refusalOf = (link: string) =>
  Effect.map(Effect.flip(resolve(link)), (error) =>
    Predicate.isTagged('LocationLinkRefused')(error)
      ? `${error._tag}: ${error.reason}`
      : error._tag,
  )

describe('Trip.resolveLocationLink', () => {
  it.effect(
    "reads a maps.app.goo.gl short link's place pin over the map's centre",
    () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(
          yield* resolve('https://maps.app.goo.gl/75CwmUKb62uxphUq9'),
          { latitude: 35.6938493, longitude: 139.7634709 },
        )
      }).pipe(Effect.provide(trip)),
  )

  it.effect('follows a goo.gl/maps short link', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        yield* resolve('https://goo.gl/maps/9e6EdUNDE18LuEwR7'),
        { latitude: 34.9671402, longitude: 135.7726717 },
      )
    }).pipe(Effect.provide(trip)),
  )

  it.effect(
    'reads a full link without following it: the pin, then the centre, then a q query',
    () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(
          yield* Effect.forEach(
            [
              'https://www.google.com/maps/place/Ichiran+Ramen/@35.669443,139.7027069,17z/data=!4m5!3m4!1s0x60188ca468112079:0xa93b4c85f75d9135!8m2!3d35.6678812!4d139.7052182?shorturl=1',
              'https://www.google.com/maps/@35.0394,135.7292,17z',
              'https://maps.google.com/?q=35.0116,135.7681',
              'https://www.google.com/maps?q=34.9949,135.785',
              'https://google.com/maps/search/?api=1&query=35.0116,135.7681',
            ],
            resolve,
          ),
          [
            { latitude: 35.6678812, longitude: 139.7052182 },
            { latitude: 35.0394, longitude: 135.7292 },
            { latitude: 35.0116, longitude: 135.7681 },
            { latitude: 34.9949, longitude: 135.785 },
            { latitude: 35.0116, longitude: 135.7681 },
          ],
        )
      }).pipe(Effect.provide(trip)),
  )

  it.effect('ignores spaces around a pasted link', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        yield* resolve('  https://goo.gl/maps/9e6EdUNDE18LuEwR7\n'),
        { latitude: 34.9671402, longitude: 135.7726717 },
      )
    }).pipe(Effect.provide(trip)),
  )

  it.effect('refuses any other scheme or host as not Google Maps', () =>
    Effect.gen(function* () {
      const links = [
        'http://maps.google.com/?q=35.0116,135.7681',
        'https://www.google.co.jp/maps/@35.0116,135.7681,15z',
        'https://www.google.com/search?q=35.0116,135.7681',
        'https://maps.google.com.example.com/?q=35.0116,135.7681',
        'https://example.com/maps/@35.0116,135.7681,15z',
        'https://goo.gl/abc123',
        'https://maps.app.goo.gl:8443/75CwmUKb62uxphUq9',
        'https://phillip@maps.app.goo.gl/75CwmUKb62uxphUq9',
        'javascript:alert(1)',
        'Kinkaku-ji, Kyoto',
      ]

      assert.deepStrictEqual(
        yield* Effect.forEach(links, refusalOf),
        links.map(() => 'LocationLinkRefused: NotGoogleMaps'),
      )
    }).pipe(Effect.provide(trip)),
  )

  it.effect('refuses a link past 2,000 characters', () =>
    Effect.gen(function* () {
      const base = 'https://www.google.com/maps/@35.0394,135.7292,17z?x='
      const longest = base.padEnd(2000, 'a')
      assert.deepStrictEqual(
        [yield* resolve(longest), yield* refusalOf(`${longest}a`)],
        [
          { latitude: 35.0394, longitude: 135.7292 },
          'LocationLinkRefused: TooLong',
        ],
      )
    }).pipe(Effect.provide(trip)),
  )

  it.effect(
    'refuses a short link redirecting off the https Google Maps hosts, or to no link at all',
    () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(
          yield* Effect.forEach(
            [
              'https://goo.gl/maps/1DTErmADkkz',
              'https://maps.app.goo.gl/toHttp',
              'https://maps.app.goo.gl/toMalformed',
            ],
            refusalOf,
          ),
          [
            'LocationLinkRefused: LeftGoogleMaps',
            'LocationLinkRefused: LeftGoogleMaps',
            'LocationLinkRefused: LeftGoogleMaps',
          ],
        )
      }).pipe(Effect.provide(trip)),
  )

  it.effect('follows a redirect to a link past 2,000 characters', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        yield* resolve('https://maps.app.goo.gl/toLongLink'),
        { latitude: 35.0394, longitude: 135.7292 },
      )
    }).pipe(Effect.provide(trip)),
  )

  it.effect('follows five redirects and refuses a sixth', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(
        [
          yield* resolve('https://maps.app.goo.gl/five0'),
          yield* refusalOf('https://maps.app.goo.gl/six0'),
        ],
        [
          { latitude: 35.0394, longitude: 135.7292 },
          'LocationLinkRefused: TooManyRedirects',
        ],
      )
    }).pipe(Effect.provide(trip)),
  )

  it.effect("refuses as unreachable a short link that doesn't exist", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* refusalOf('https://maps.app.goo.gl/doesnotexist123'),
        'LocationLinkRefused: Unreachable',
      )
    }).pipe(Effect.provide(trip)),
  )

  it.effect('refuses as unreachable a short link that gets no answer', () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* refusalOf('https://maps.app.goo.gl/75CwmUKb62uxphUq9'),
        'LocationLinkRefused: Unreachable',
      )
    }).pipe(
      Effect.provide(
        tripWith(
          [option1],
          LocationLinkResolver.of({
            request: () =>
              Effect.fail(
                new LinkRequestFailed({ cause: new Error('offline') }),
              ),
          }),
        ),
      ),
    ),
  )

  it.effect('gives up on a short link after ten seconds', () =>
    Effect.gen(function* () {
      const fiber = yield* refusalOf(
        'https://maps.app.goo.gl/75CwmUKb62uxphUq9',
      ).pipe(Effect.forkChild)

      yield* TestClock.adjust(Duration.seconds(10))
      assert.strictEqual(
        yield* Fiber.join(fiber),
        'LocationLinkRefused: TimedOut',
      )
    }).pipe(
      Effect.provide(
        tripWith(
          [option1],
          LocationLinkResolver.of({ request: () => Effect.never }),
        ),
      ),
    ),
  )

  it.effect(
    'fails with NoCoordinatesInLink for a link naming a place only',
    () =>
      Effect.gen(function* () {
        const links = [
          'https://maps.app.goo.gl/GK6GhwG7X1CFqwMy8',
          'https://maps.app.goo.gl/CBXW7Sn1y3NG5df98?g_st=ic',
          'https://www.google.com/maps/place/Kinkaku-ji',
        ]

        assert.deepStrictEqual(
          yield* Effect.forEach(links, refusalOf),
          links.map(() => 'NoCoordinatesInLink'),
        )
      }).pipe(Effect.provide(trip)),
  )

  it.effect('fails with CoordinatesOutsideJapan for a place elsewhere', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolve('https://maps.app.goo.gl/4LnCdiNYWrN11M9z5'),
      )

      assert.deepStrictEqual(
        {
          tag: error._tag,
          coordinates: Predicate.isTagged('CoordinatesOutsideJapan')(error)
            ? error.coordinates
            : undefined,
        },
        {
          tag: 'CoordinatesOutsideJapan',
          coordinates: { latitude: 51.5332609, longitude: -0.1260032 },
        },
      )
    }).pipe(Effect.provide(trip)),
  )
})

/** Chooses an Itinerary, replacing the Schedule named, if any. */
const choose = (
  optionNumber: number,
  n: number,
  replacing: ScheduleId | null,
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.choose({ operationId: operation(n), optionNumber, replacing }),
    ),
    ({ scheduleId }) => scheduleId,
  )

const setPin = (scheduleId: ScheduleId, target: PinTarget, pin?: Pin) =>
  Trip.use((trip) =>
    trip.setPin({ scheduleId, target, ...(pin !== undefined && { pin }) }),
  )

/** Adds an Activity on a Day, returning its id. */
const addActivity = (
  n: number,
  scheduleId: ScheduleId,
  date: IsoDate,
  title: string,
) =>
  Effect.map(
    Trip.use((trip) =>
      trip.addActivity({ operationId: operation(n), scheduleId, date, title }),
    ),
    ({ activityId }) => activityId,
  )

const activityTarget = (activityId: string): PinTarget => ({ activityId })

const hotelTarget = (stayId: string): PinTarget => ({ stayId })

/** The Activities on a Day of the current Schedule. */
const activitiesOn = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).day.activities,
  )

/** A Schedule's Stays, current or archived, in Trip order. */
const staysOf = (scheduleId: ScheduleId) =>
  Effect.map(
    Trip.use((trip) => trip.schedule(scheduleId)),
    ({ stays }) => stays,
  )

/** The id of a Schedule's second Stay: Option 1's Kyoto, December 9–13. */
const kyotoStayId = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[1]?.id ?? '')

/** The Kyoto Stay's hotel as a Schedule, current or archived, shows it. */
const kyotoHotelOf = (scheduleId: ScheduleId) =>
  Effect.map(staysOf(scheduleId), (stays) => stays[1]?.hotel)

/** Tonight's hotel on a Day of the current Schedule. */
const tonightsHotel = (date: IsoDate) =>
  Effect.map(
    Trip.use((trip) => trip.day(date)),
    (page) => Option.getOrThrow(page).tonight?.hotel,
  )

const fushimiInari: Pin = {
  coordinates: { latitude: 34.9671402, longitude: 135.7726717 },
  link: 'https://goo.gl/maps/9e6EdUNDE18LuEwR7',
}

/** A Pin dropped by hand without a link, near Kyoto Station. */
const droppedByHand: Pin = {
  coordinates: { latitude: 34.9858, longitude: 135.7588 },
}

const ryokan = {
  name: 'Kyoto Ryokan Sakura',
  address: '231 Higashi-Kujo, Minami-ku, Kyoto',
}

describe('Trip.setPin', () => {
  it.effect(
    'sets the Pin on an Activity, with its link, and only on that one',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
        yield* addActivity(3, scheduleId, december(10), 'Dinner')
        yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)
        assert.deepStrictEqual(
          (yield* activitiesOn(december(10))).map(({ title, pin }) => ({
            title,
            pin,
          })),
          [
            { title: 'Shrine', pin: fushimiInari },
            { title: 'Dinner', pin: undefined },
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "keeps the link of a Pin dropped by hand for a link without coordinates, and replaces the Activity's Pin as a whole",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
        yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)

        const kept = {
          ...droppedByHand,
          link: 'https://maps.app.goo.gl/GK6GhwG7X1CFqwMy8',
        }

        yield* setPin(scheduleId, activityTarget(shrine), kept)
        const afterKept = (yield* activitiesOn(december(10)))[0]?.pin
        yield* setPin(scheduleId, activityTarget(shrine), droppedByHand)
        assert.deepStrictEqual(
          [afterKept, (yield* activitiesOn(december(10)))[0]?.pin],
          [kept, droppedByHand],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect("removes an Activity's Pin when given none", () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
      yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)
      yield* setPin(scheduleId, activityTarget(shrine))
      assert.deepStrictEqual(
        (yield* activitiesOn(december(10))).map(({ pin }) => pin),
        [undefined],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect("keeps an Activity's Pin through an edit of its other fields", () =>
    Effect.gen(function* () {
      const scheduleId = yield* choose(1, 1, null)
      const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')
      yield* setPin(scheduleId, activityTarget(shrine), fushimiInari)
      yield* Trip.use((trip) =>
        trip.editActivity({
          scheduleId,
          activityId: shrine,
          title: 'Fushimi Inari at dawn',
          note: 'Go early',
        }),
      )
      assert.deepStrictEqual(
        (yield* activitiesOn(december(10))).map(({ title, pin }) => ({
          title,
          pin,
        })),
        [{ title: 'Fushimi Inari at dawn', pin: fushimiInari }],
      )
    }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "records the hotel's Pin on its Stay, shown as tonight's hotel, beside its Hotel details",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)
        const pinnedOnly = yield* kyotoHotelOf(scheduleId)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId, details: ryokan }),
        )

        const recorded = Hotel.cases.Recorded.make({
          ...ryokan,
          pin: fushimiInari,
        })

        assert.deepStrictEqual(
          [
            pinnedOnly,
            yield* kyotoHotelOf(scheduleId),
            yield* tonightsHotel(december(10)),
          ],
          [
            Hotel.cases.Recorded.make({ pin: fushimiInari }),
            recorded,
            recorded,
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "removes the hotel's Pin, leaving its Hotel details; blank details leave its Pin; with neither it's not recorded",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId, details: ryokan }),
        )
        yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)
        yield* setPin(scheduleId, hotelTarget(stayId))
        const unpinned = yield* kyotoHotelOf(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId), droppedByHand)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId, details: {} }),
        )
        const pinnedOnly = yield* kyotoHotelOf(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId))
        assert.deepStrictEqual(
          [unpinned, pinnedOnly, yield* kyotoHotelOf(scheduleId)],
          [
            Hotel.cases.Recorded.make(ryokan),
            Hotel.cases.Recorded.make({ pin: droppedByHand }),
            Hotel.cases.NotRecorded.make({}),
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "carries the hotel's Pin with its Stay, and its id, through a Stay edit",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)
        yield* Trip.use((trip) =>
          trip.writeHotelDetails({ scheduleId, stayId, details: ryokan }),
        )

        const at = (date: IsoDate) =>
          date === december(13) ? december(14) : date

        // Kyoto stays a night longer, in Osaka.
        const { schedule } = yield* Trip.use((trip) =>
          trip.editStays({ scheduleId }, (copy) =>
            Effect.succeed({
              stays: copy.stays.map((stay) => ({
                ...stay,
                ...(stay.id === stayId && { base: 'osaka' as const }),
                checkIn: at(stay.checkIn),
                checkOut: at(stay.checkOut),
              })),
              moves: copy.moves.map((move) => ({
                ...move,
                date: at(move.date),
              })),
            }),
          ),
        )

        assert.deepStrictEqual(
          schedule.stays
            .filter(({ id }) => id === stayId)
            .map(({ base, checkOut, hotel }) => ({
              base: base.id,
              checkOut,
              hotel,
            })),
          [
            {
              base: 'osaka',
              checkOut: december(14),
              hotel: Hotel.cases.Recorded.make({
                ...ryokan,
                pin: fushimiInari,
              }),
            },
          ],
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    "keeps the hotel's Pin on the earlier Stay after a split, and through a merge back",
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        yield* setPin(scheduleId, hotelTarget(stayId), fushimiInari)

        const split = yield* Trip.use((trip) =>
          trip.splitStay({
            scheduleId,
            operationId: operation(2),
            stayId,
            date: december(11),
          }),
        )

        const [earlier, later] = split.schedule.stays.filter(
          ({ base }) => base.id === 'kyoto',
        )

        const laterId = later?.id ?? ''
        yield* setPin(scheduleId, hotelTarget(laterId), droppedByHand)

        const merged = yield* Trip.use((trip) =>
          trip.mergeStays({
            scheduleId,
            operationId: operation(3),
            stayIds: [stayId, laterId],
          }),
        )

        const pinned = Hotel.cases.Recorded.make({ pin: fushimiInari })

        assert.deepStrictEqual(
          {
            split: [earlier, later].map((stay) => [stay?.id, stay?.hotel]),
            merged: merged.schedule.stays
              .filter(({ base }) => base.id === 'kyoto')
              .map(({ id, checkOut, hotel }) => [id, checkOut, hotel]),
          },
          {
            split: [
              [stayId, pinned],
              [laterId, Hotel.cases.NotRecorded.make({})],
            ],
            merged: [[stayId, december(13), pinned]],
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses a link that is not Google Maps, or a Pin outside Japan, writing nothing',
    () =>
      Effect.gen(function* () {
        const scheduleId = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(scheduleId)
        const shrine = yield* addActivity(2, scheduleId, december(10), 'Shrine')

        const errors = yield* Effect.forEach(
          [
            setPin(scheduleId, activityTarget(shrine), {
              ...droppedByHand,
              link: 'https://example.com/maps/@34.9858,135.7588,15z',
            }),
            setPin(scheduleId, hotelTarget(stayId), {
              coordinates: { latitude: 51.5332609, longitude: -0.1260032 },
            }),
          ],
          (write) => Effect.map(Effect.flip(write), (error) => error._tag),
        )

        assert.deepStrictEqual(
          {
            errors,
            activityPin: (yield* activitiesOn(december(10)))[0]?.pin,
            hotel: yield* kyotoHotelOf(scheduleId),
          },
          {
            errors: ['LocationLinkRefused', 'CoordinatesOutsideJapan'],
            activityPin: undefined,
            hotel: Hotel.cases.NotRecorded.make({}),
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'refuses a stale or archived Schedule with ScheduleChanged, leaving it as it was',
    () =>
      Effect.gen(function* () {
        const archived = yield* choose(1, 1, null)
        const stayId = yield* kyotoStayId(archived)
        const shrine = yield* addActivity(2, archived, december(10), 'Shrine')
        yield* choose(2, 3, archived)

        const errors = yield* Effect.forEach(
          [
            setPin(archived, activityTarget(shrine), fushimiInari),
            setPin(archived, hotelTarget(stayId), fushimiInari),
          ],
          (write) => Effect.map(Effect.flip(write), (error) => error._tag),
        )

        const schedule = yield* Trip.use((trip) => trip.schedule(archived))

        assert.deepStrictEqual(
          {
            errors,
            activityPins: schedule.days.flatMap(({ activities }) =>
              activities.map(({ pin }) => pin),
            ),
            hotel: schedule.stays[1]?.hotel,
          },
          {
            errors: ['ScheduleChanged', 'ScheduleChanged'],
            activityPins: [undefined],
            hotel: Hotel.cases.NotRecorded.make({}),
          },
        )
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect(
    'fails with ActivityNotFound or StayNotFound for one the Schedule lacks',
    () =>
      Effect.gen(function* () {
        const first = yield* choose(1, 1, null)
        const goneStayId = yield* kyotoStayId(first)
        const current = yield* choose(1, 2, first)
        const shrine = yield* addActivity(3, current, december(10), 'Shrine')
        yield* Trip.use((trip) =>
          trip.removeActivity({ scheduleId: current, activityId: shrine }),
        )

        const errors = yield* Effect.forEach(
          [
            setPin(current, activityTarget(shrine), fushimiInari),
            setPin(current, hotelTarget(goneStayId), fushimiInari),
          ],
          (write) => Effect.map(Effect.flip(write), (error) => error._tag),
        )

        assert.deepStrictEqual(errors, ['ActivityNotFound', 'StayNotFound'])
      }).pipe(Effect.provide([trip, storage])),
  )

  it.effect('archives Pins and restores them with their Schedule', () =>
    Effect.gen(function* () {
      const first = yield* choose(1, 1, null)
      const shrine = yield* addActivity(2, first, december(10), 'Shrine')
      yield* setPin(first, activityTarget(shrine), fushimiInari)
      yield* setPin(
        first,
        hotelTarget(yield* kyotoStayId(first)),
        droppedByHand,
      )
      const second = yield* choose(2, 3, first)

      const fresh = {
        activities: yield* activitiesOn(december(10)),
        hotel: yield* tonightsHotel(december(10)),
      }

      yield* Trip.use((trip) =>
        trip.restore({
          operationId: operation(4),
          scheduleId: first,
          replacing: second,
        }),
      )
      assert.deepStrictEqual(
        {
          fresh,
          restored: {
            pins: (yield* activitiesOn(december(10))).map(({ pin }) => pin),
            hotel: yield* tonightsHotel(december(10)),
          },
        },
        {
          fresh: { activities: [], hotel: Hotel.cases.NotRecorded.make({}) },
          restored: {
            pins: [fushimiInari],
            hotel: Hotel.cases.Recorded.make({ pin: droppedByHand }),
          },
        },
      )
    }).pipe(Effect.provide([trip, storage])),
  )
})
