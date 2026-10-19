import { assert, describe, it } from '@effect/vitest'
import { Duration, Effect, Fiber, Predicate } from 'effect'
import { TestClock } from 'effect/testing'

import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import {
  LinkRequestFailed,
  LocationLinkResolver,
} from '@/trip/location-links/LocationLinkResolver'
import { tripWith } from '@/trip/trip/testing'
import { Trip } from '@/trip/trip/Trip'

const trip = tripWith([option1, option2])

const resolve = (link: string) =>
  Trip.use((trip) => trip.resolveLocationLink({ link }))

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
