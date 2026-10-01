# Adding or revising an Itinerary

Phillip hands over gpt-6-astra markdown. It is either a **Revision** of an existing Itinerary or a **new Itinerary**. Either way, convert it the same way every time: strictly, inventing nothing, and checked against the Trip's rules (ADR 0003). The terms below are from `CONTEXT.md`.

## Steps

1. **Update the source document.** `docs/itinerary.md` is the one source document. Put the new markdown there as it was given. A Revision replaces that Itinerary's section, or the whole document when gpt-6-astra returns every Itinerary again. A new Itinerary is appended. A change to `docs/itinerary.md` and the matching content module go in the same commit. A Revision that updates only one of them is incomplete.
2. **Pick the Option number.**
   - A Revision keeps its Option number.
   - A new Itinerary takes the next number: the highest existing Option number plus one.
   - Never renumber. If an Itinerary is dropped, its number stays unused.
   - Exactly one Itinerary is `recommended`: the one gpt-6-astra recommends in the latest markdown.
3. **Convert** the section into `src/trip/itineraries/option-N.ts`, exporting `optionN: ItineraryContent`. Follow the [conversion rules](#conversion-rules). Wherever the conversion takes a judgement call, add a one-line comment quoting the source. Add a new module to `Itineraries.layer` in `src/trip/Itineraries.ts`.
4. **Add places** that the catalogue lacks (see [Places, stations and lines](#places-stations-and-lines)).
5. **Write the expectations** for the Option in `src/trip/itineraries/itineraries.test.ts`. Write them from the markdown, not by copying the module. They are the independent check that the conversion says what the source says. A Revision updates its existing entry.
6. **Run the checks** (see [Checks](#checks)). The work is done when every gate passes and `/options/N` shows every Stay and all 15 Days at phone and desktop widths.

## Conversion rules

Copy the source's wording, including its typographic punctuation (`’`, `–`, `—`, `¼`). Trim only a lead-in that the structure already shows: "Saturday can be Uji or a leisurely Kyoto day" becomes `'Uji or a leisurely Kyoto day.'` on Saturday. Remove every citation marker, such as `:chatgpt-content-reference{index="0"}`, `【…†…】` or `[1]`. The test fails on any that are left.

### Itinerary

- `name` and `bestFor` come from the summary table at the top, for example "Kyoto + Kanazawa".
- `shigeharuVisit` is `{ date: december(11), slot: 'morning' }`. The source builds Shigeharu into every Itinerary.

### Stays

- Each Stay comes from one row of the Itinerary's dates table, for example "Dec 9–13: 4 nights | Kyoto". Its check-out is the next Stay's check-in.
- `accommodation` is `'ryokan'` only when the source says ryokan. Otherwise it is `'hotel'`.
- `highlights` are the sights the source lists for the Stay without placing them on a Day, as in "Kenrokuen, the castle grounds, Higashi Chaya, craft shops, and Omicho Market". Keep each item's wording and case.

### Days

List all 15 Days, from December 6 to December 20. A Stay's Days run from its check-in to the day before its check-out. Its check-out day belongs to the next Stay, and Departure closes the Trip.

A Day gets a `description` only when the source places text on that Day:

- a row of a day-by-day table, such as "Dec 16 | Nikko"
- text naming the date, the weekday or an Anchor, such as "Arrive Thursday", "December 16 can be your sightseeing day" or "your birthday dinner"
- a Stay row that walks through the Stay day by day from its check-in, with exactly one item for each of its Days in order, such as "Arrival, recovery, and optional Kamakura" for a three-night Stay, or "Fly back, then leave room for Enoshima and a free final day"
- text naming several Days at once, such as "a relaxed weekend". That text describes each of those Days.

A Stay row that lists things to do during the Stay as a whole, such as "Food, neighborhood walks, birthday dinner, and optional Dazaifu" or "Optional Enoshima, shopping, and rest before departure", describes only the Days its items are tied to by the rules above. Stay-level text that names no Day, such as "two lightly planned sightseeing days", describes no Day.

When several texts place on one Day, use the table or Stay row. December 15 takes its text from the "Birthday:" paragraph only when nothing else describes it, as in Option 2.

**Free days** are derived, never written. A Day with no description, no Move and no Day trip, other than Arrival or Departure, shows as a Free day. Leave a Day undescribed when the source calls it free or unscheduled ("a free final day", "Unscheduled Tokyo day"). Never fill a Free day with a suggestion.

### Day trips

- A Day trip goes to another town and returns to the same Base the same day. Sights within a Base's own area, like the Hakone Open-Air Museum, are not Day trips.
- `optional` is true when the source offers the Day trip rather than plans it: it says "optional", offers an either-or such as "Uji or a leisurely Kyoto day", or only leaves room for it, as in "leave room for Enoshima".
- A Day trip goes on the Day the text places it. If the text names several Days, such as "the weekend, with optional Uji", add it to each of those Days. If a Stay row names no Day for it, add it to each whole Day of that Stay. A Move day is not a whole Day.

### Moves

- Add one Move on every date where one Stay checks out and the next checks in, and on no other date.
- `mode` is `'flight'` for a flight, `'local'` for a Move within one Base, and `'train'` otherwise.
- `sections` are the shinkansen and limited-express trains the source names or clearly implies, in travel order. For example, "a change at Tsuruga" gives Thunderbird to Tsuruga, then the Hokuriku Shinkansen. A train that runs through from one line to another without a change rides a combined line, such as `tokaido-sanyo-shinkansen`. Leave out any leg the source doesn't name: "Hakone … through Odawara" gives only Kyoto → Odawara. Changes of train are derived from the sections.
- `duration` is in minutes, with `minMinutes` equal to `maxMinutes` when the source gives one value. You may reuse a duration stated elsewhere in `docs/itinerary.md` for the same journey, and "Tokyo–Kyoto" covers both directions. Otherwise leave `duration` out, and the page shows "duration not given". Never estimate one.

### Verify claims

- A Verify claim is a time-sensitive statement to confirm before relying on it: opening days, winter hours, event dates, seasons and weather.
- Its `text` is the source's sentence, or the time-sensitive clause of it, such as "Toshogu closes at 16:00 in winter." A citation marker often sits beside one, but citations don't decide what counts. Travel times are not Verify claims.
- Attach it to the narrowest thing it applies to: a Day by its date, a Stay by its check-in, or the whole Itinerary.
- Its `id` is stable kebab-case, such as `nikko-toshogu-winter-hours`. A Revision keeps the id when the claim is unchanged.
- The Shigeharu claim applies to every Itinerary. Use `shigeharuOpeningDays` from `src/trip/itineraries/shigeharu.ts`.

### gpt-6-astra's reasoning

Copy each part verbatim from its labelled paragraph, and leave out any part the source doesn't give:

| Field             | Source                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| `birthdayOutline` | the whole "Birthday:" paragraph                                              |
| `pros`, `cons`    | the "Pros" and "Cons" bullets                                                |
| `chooseThisIf`    | the text after "Choose this if:" or "Choose this over Option 1 if:"          |
| `whyRecommended`  | the text after "Why I recommend it most:", on the recommended Itinerary only |
| `travelNotes`     | the whole "Travel:" paragraph                                                |

## Places, stations and lines

Every Base and Day trip destination must be in the place catalogue in `src/trip/places.ts`. To add a place:

- Give it a lowercase id, its romaji name and its kanji name.
- Give it the coordinates of the town's main station, in decimal degrees to four places, taken from a reliable source.
- Add its kanji to `src/fonts/display-strings.ts`. The `kanji` field's type requires it.
- Run `vp run subset-display-font` (needs `uv`), and commit the regenerated woff2.

A new place is a New place automatically. `visitedPlaceIds` changes only when Phillip says he has been somewhere.

The station or line ids that rail sections use live in `src/trip/rail.ts`. Add any that are missing. Give a new station its coordinates in decimal degrees to four places, taken from a reliable source: the Itinerary's map draws train Moves through them.

## Checks

Run each of these until it passes:

- `vp check`
- `vp run typecheck`
- `vp test`

The tests check the conversion in two ways. "satisfies every Trip rule" covers the whole catalogue: 14 nights, back-to-back Stays, Kyoto on the night of December 10, no Move on December 15, ending in Tokyo, a Move on every Stay boundary, and every Verify claim attached. The Itinerary's entry in `itineraries.test.ts` checks the rest against the source. Then open `/options` and `/options/N` at phone and desktop widths.
