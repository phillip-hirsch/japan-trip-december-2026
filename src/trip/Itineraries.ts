import { createHash } from 'node:crypto'

import { Context, Layer, Predicate, type Schema } from 'effect'

import type { Itinerary, ItineraryContent } from '@/trip/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { option3 } from '@/trip/itineraries/option-3'
import { option4 } from '@/trip/itineraries/option-4'

/** JSON with every object's keys sorted, so key order never matters. */
const canonicalValue = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) return value.map(canonicalValue)

  if (Predicate.isObjectKeyword(value)) {
    return Object.fromEntries(
      Object.entries<Schema.Json>(value)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    )
  }

  return value
}

/**
 * The content's fingerprint: a hash of its canonical encoded data. Content
 * holds only plain data, so it is already in its encoded form.
 */
const contentVersion = (content: ItineraryContent) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalValue(content)))
    .digest('hex')

/** The Itinerary catalogue: every candidate Itinerary, by Option number. */
export class Itineraries extends Context.Service<
  Itineraries,
  { readonly all: ReadonlyArray<Itinerary> }
>()('japan-trip/trip/Itineraries') {
  static readonly fromContent = (contents: ReadonlyArray<ItineraryContent>) =>
    Layer.succeed(
      Itineraries,
      Itineraries.of({
        all: contents.map((content) => ({
          ...content,
          contentVersion: contentVersion(content),
        })),
      }),
    )

  static readonly layer = Itineraries.fromContent([
    option1,
    option2,
    option3,
    option4,
  ])
}
