# Japan Trip December 2026

Phillip's fourth trip to Japan: choosing how to spend it, then living it day by day.

## Language

**Trip**:
The whole journey: arriving in Japan on Sunday, December 6, 2026 and flying home on Sunday, December 20, 2026 — 14 nights.

**Itinerary**:
One candidate way to spend the Trip, as a sequence of Stays.
_Avoid_: Option, plan, route

**Option number**:
The number that labels an Itinerary, shown as "Option 1". A Revision keeps the number; a new Itinerary gets the next one.

**Revision**:
A new version of an Itinerary that replaces it under the same Option number.
_Avoid_: version, update

**Schedule**:
The editable copy of the Itinerary Phillip chose. Later Revisions of that Itinerary never change it. Choosing again archives it, read-only and restorable, and starts a fresh Schedule. Only the Trip note and Phillip's own Checklist items carry over.
_Avoid_: chosen itinerary, plan

**Day**:
One calendar date of the Trip in Tokyo time, December 6 through December 20.

**Activity**:
One thing planned on a Day of the Schedule, with a title and optionally a Tokyo time and a note, such as a flight at its Tokyo-side time or the birthday dinner reservation. A Day keeps its Activities in Phillip's own order, never re-sorted by time; a new timed one goes before the first with a later time. Like a Day note, it belongs to that Schedule, and it never moves to another Day.
_Avoid_: event, item

**Day note**:
Phillip's own plain-text note on a Day of the Schedule, shown on its Day page. It belongs to that Schedule: choosing again starts without Day notes, and restoring brings them back.
_Avoid_: day memo, comment

**Stay note**:
Phillip's own plain-text note on a Stay of the Schedule, such as tips about the hotel's area, shown with the Stay on the Schedule page. Like a Day note, it belongs to that Schedule.
_Avoid_: hotel note, stay memo

**Hotel details**:
Phillip's record of a Stay's hotel: its name, address and confirmation number, each optional, saved together as one value. Like a Stay note, they belong to that Schedule, and the Stay keeps them, and its id, when they are edited.
_Avoid_: booking, reservation, hotel info

**Trip note**:
Phillip's one plain-text note about the whole Trip, shown on the Schedule page. It belongs to the Trip, not a Schedule, so it stays as it is when he chooses again or restores.
_Avoid_: general note, global note

**Day page**:
A Day of the Schedule on its own page at /schedule/$date: the Day's source description and Day trips, its Activities, its Day note, Tonight's hotel and the Next Move.

**Today**:
During the Trip, Home showing the Day page of the current Day in Tokyo, in place.

**Tonight's hotel**:
The Stay covering the night a Day ends with, with its Hotel details; absent on December 20. Shown as its Base marked "hotel not recorded" until its Hotel details are recorded.

**Next Move**:
From a Day, the first Move dated that Day or later; absent once no Moves are left.

**Stay**:
Consecutive nights at one hotel.
_Avoid_: leg, segment

**Base**:
The town a Stay is in. One Base can host several Stays in the same Itinerary, such as Tokyo at the start and at the end.
_Avoid_: overnight base, city

**Move**:
Switching hotels between two Stays, travelling with luggage.
_Avoid_: hotel move, hotel change, transfer

**Day trip**:
Going to another town and returning to the same Base on the same day. Sights within a Base's own area, like the Hakone Open-Air Museum during a Hakone Stay, are not Day trips.
_Avoid_: excursion, side trip

**New place**:
A Base or Day trip destination Phillip has not visited on a previous trip.
_Avoid_: unvisited, fresh

**Anchor**:
A fixed date every Itinerary must respect: Arrival (December 6), the Shigeharu visit (Friday, December 11, morning), the Birthday (Tuesday, December 15, never a Move day), and Departure (December 20). A Schedule may break an Anchor, but never silently.
_Avoid_: fixed event, constraint

**Free day**:
A day deliberately left unplanned.
_Avoid_: open day, unscheduled day

**Shigeharu**:
The Kyoto knife shop Phillip wants to visit. Its opening days are observed by visitors rather than published, so the visit is tentative.
_Avoid_: the knife shop

**Verify claim**:
A time-sensitive statement in an Itinerary that should be confirmed before relying on it, such as Shigeharu's opening days.
_Avoid_: caveat, warning

**Checklist**:
The things to book or confirm for the Schedule: mostly derived from its Stays, Moves, Anchors and Verify claims, plus Phillip's own.
_Avoid_: todo list, tasks

**Checklist item**:
One thing on the Checklist. "Item" alone always means a Checklist item, never an Activity.
_Avoid_: task, todo

**Own Checklist item**:
A Checklist item Phillip writes himself, with an optional Reminder date. It belongs to the Trip, not a Schedule, so it carries over when he chooses again.
_Avoid_: custom item, personal task

**Reminder date**:
The date a Checklist item becomes worth doing, such as one month before a train Move, when seat reservations roughly open. It is only shown: nothing is ever sent.
_Avoid_: due date, deadline, notification

**Tick**:
Phillip's mark that a Checklist item is done. A tick on an item derived from the Schedule belongs to that Schedule: choosing again starts without ticks, and restoring brings them back.
_Avoid_: checkmark, completion

**Draft**:
What Phillip has typed but not yet saved, kept on his device until its save succeeds, and restored marked "not saved" if it never did. Only his Save or Retry sends it.
_Avoid_: autosave, unsaved changes
