# Itineraries are repo content; only the Schedule is stored

Candidate Itineraries (Option 1, Option 2, …) are typed content files in the repository, checked by the typecheck and by tests of the Trip's rules (14 nights, back-to-back Stays, Anchors respected, no Move on the Birthday, ending in Tokyo). A coding agent adds or revises them from gpt-6-astra's markdown by following a written guide, and they ship with a deploy. They cannot be edited in the app. Choosing an Itinerary copies it into the Schedule, which is the only thing kept in storage (see ADR 0001), so later Revisions never change what Phillip has already planned.

## Considered Options

- **Import inside the app**: paste markdown on the phone and have an LLM convert it to structured data. Rejected because it needs an LLM API key and a review screen, and it loses prerendering.
- **Every Itinerary editable in place, with "choose" as a flag**: rejected because Revisions would collide with Phillip's edits.
- **Schedule as a live overlay on its Itinerary**: rejected as the hardest option to make reliable.

## Consequences

- Option pages can be prerendered and never touch storage.
- A Schedule records which Option number and content version it was copied from, so the app can show "Option 1 was revised after you chose it" without changing anything.
