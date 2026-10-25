# Adding a place, station or line

Changing a Stay's Base offers only the places in the catalogue, so a new Base Phillip asks for starts here. The terms below are from `GLOSSARY.md`.

## Places

To add a place:

- Add its lowercase id to `placeIds` in `src/trip/catalogue/catalogue-ids.ts`. The Stay editor lists the Base chips in that order.
- Add its entry to `places` in `src/trip/catalogue/places.ts`, with its romaji name and its kanji name.
- Give it the coordinates of the town's main station, in decimal degrees to four places, taken from a reliable source.
- Add its kanji to `src/fonts/display-strings.ts`. The `kanji` field's type requires it.
- Run `vp run subset-display-font` (needs `uv`), and commit the regenerated woff2.

A new place is a New place automatically. `visitedPlaceIds` changes only when Phillip says he has been somewhere.

## Stations and lines

Rail sections use station ids and line ids, which `src/trip/catalogue/catalogue-ids.ts` declares in `stationIds` and `railLineIds`. A new station id also needs its entry in `stations` in `src/trip/catalogue/rail.ts`, with coordinates in decimal degrees to four places from a reliable source: the Schedule map draws train Moves through them.

The map draws each rail section along its real line, from the rail geometry in `src/trip/catalogue/rail-geometry.json`. When the Itinerary gains a rail section the geometry lacks, in either direction, run `vp run build-rail-geometry` (needs network access and `unzip`) and commit the regenerated GeoJSON. A new line also needs its MLIT line names in `mlitLines` in `scripts/build-rail-geometry.ts`. The build fails if a station is more than 1 km from its line, or if the GeoJSON goes over its 15 KB gzipped budget. A section the build can't cover is drawn straight between its stations; add it, as "mode line from → to", to the expected list of the "follows the rail line on every rail section" test in `src/trip/trip/Trip.test.ts`.

## Done

The work is done when `vp check`, `vp run typecheck` and `vp test` pass, and the new place shows as a Base choice on the Schedule page.
