# One Schedule, created from Option 1

Phillip settled on Option 1, so the app keeps exactly one Schedule and no longer lists, compares, chooses, archives, restores or revises Itineraries. Option 1 stays in the repository as frozen content, and the Schedule store copies it into the Schedule once, when it starts with none, so a fresh store (local dev, tests, a reset) always has a Schedule and no screen needs a "no Schedule yet" state. This replaces ADR 0003. Options 2 to 4 remain in `docs/itinerary.md` as history only.

## Considered Options

- **Keep choosing, with only Option 1 left**: the least work, but it keeps archive, restore, Revision tracking and the "Schedule changed" refusal on every save, all for a choice that can no longer happen.
- **Keep archive and restore so Phillip can start over from Option 1**: rejected because starting over is the only use, and it keeps the code for a replaceable Schedule everywhere.
- **Edit Option 1's content in place and drop the copy**: rejected because the Schedule's storage, its Stay edits and its offline snapshot all work on the copy, and the content can't be edited in the app.

## Consequences

- The catalogue holds only the places, stations and lines the Schedule uses, so changing a Stay's Base offers only those. A new Base needs a coding agent to add it to the catalogue.
- A migration drops the columns only choosing used (status, source Option number and content version, chosen and archived times, Birthday outline). The Birthday outline becomes the December 15 Day note of a newly created Schedule.
