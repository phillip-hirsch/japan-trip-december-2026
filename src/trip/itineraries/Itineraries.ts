import { Context, Layer } from 'effect'

import type { Itinerary } from '@/trip/domain/domain'
import { option1 } from '@/trip/itineraries/option-1'
import { option2 } from '@/trip/itineraries/option-2'
import { option3 } from '@/trip/itineraries/option-3'
import { option4 } from '@/trip/itineraries/option-4'

export class Itineraries extends Context.Service<
  Itineraries,
  { readonly all: ReadonlyArray<Itinerary> }
>()('japan-trip/trip/Itineraries') {
  static readonly fromContent = (all: ReadonlyArray<Itinerary>) =>
    Layer.succeed(Itineraries, Itineraries.of({ all }))

  static readonly layer = Itineraries.fromContent([
    option1,
    option2,
    option3,
    option4,
  ])
}
