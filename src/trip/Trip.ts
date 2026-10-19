// effect/sql is marked unstable; ADR 0001 adopts it, pinned to effect's version.
// @effect-diagnostics unstableApiUsage:off
import { Context, Effect, Layer } from 'effect'
import type { Option } from 'effect'
import type { SqlClient } from 'effect/sql'

import type {
  ActivityAdded,
  ActivityNotFound,
  ActivityTitleInvalid,
  AddActivity,
  AddOwnChecklistItem,
  ArchivedScheduleSummary,
  ChangeStayBase,
  Checklist,
  ChecklistItemNotFound,
  ChecklistTextInvalid,
  ChooseItinerary,
  ComparisonMap,
  Coordinates,
  CoordinatesOutsideJapan,
  DayNotFound,
  DayPage,
  DetailTile,
  DetailTilesUnavailable,
  EditActivity,
  HardRuleBroken,
  HomeState,
  HotelDetailTooLong,
  IsoDate,
  ItineraryComparison,
  ItineraryDetail,
  ItineraryNotFound,
  LocationLinkRefused,
  MapRailSection,
  MergeStays,
  MoveActivity,
  MoveStayBoundary,
  NoCoordinatesInLink,
  NoteTooLong,
  OwnChecklistItemAdded,
  RemoveActivity,
  RemoveOwnChecklistItem,
  ResolveLocationLink,
  RestoreSchedule,
  ScheduleChanged,
  ScheduleChosen,
  ScheduleDetail,
  ScheduleId,
  ScheduleMap,
  ScheduleNotFound,
  ScheduleRestored,
  ScheduleSummary,
  SetPin,
  SplitStay,
  StayNotFound,
  StaysEdited,
  TickChecklistItem,
  TickOwnChecklistItem,
  TileCoordinates,
  TripRuleBreak,
  WriteDayNote,
  WriteHotelDetails,
  WriteStayNote,
  WriteTripNote,
} from '@/trip/domain'
import type { DetailTileArchive } from '@/trip/DetailTileArchive'
import { detailTileLookup } from '@/trip/detail-tiles'
import { Itineraries } from '@/trip/Itineraries'
import { LocationLinkResolver } from '@/trip/LocationLinkResolver'
import { activityMethods } from '@/trip/Trip.activities'
import { checklistMethods } from '@/trip/Trip.checklist'
import { itineraryMethods } from '@/trip/Trip.itinerary'
import { noteMethods } from '@/trip/Trip.notes'
import { scheduleMethods } from '@/trip/Trip.schedule'
import { buildCatalogueLookups, CatalogueLookups } from '@/trip/Trip.shared'
import { stayMethods } from '@/trip/Trip.stays'

export * from '@/trip/Trip.shared'

export * from '@/trip/Trip.guards'

export * from '@/trip/Trip.itinerary'

export * from '@/trip/Trip.schedule'

export * from '@/trip/Trip.stays'

export * from '@/trip/Trip.notes'

export * from '@/trip/Trip.checklist'

export * from '@/trip/Trip.activities'

/**
 * The application seam: all Trip behaviour, independent of HTTP and React.
 *
 * Its storage operations take the SQL client from their caller rather than
 * from its layer: only the Durable Object has one (and the tests, over Node's
 * SQLite), so the Worker can't run them by mistake.
 */
export class Trip extends Context.Service<
  Trip,
  {
    /**
     * Home's state at the current moment of the Clock, in Tokyo: before the
     * Trip, during it (00:00 on December 6 to 23:59:59.999 on December 20,
     * inclusive) or after it.
     */
    readonly home: Effect.Effect<HomeState, never, SqlClient.SqlClient>
    /**
     * One Day of the current Schedule as its page shows it; none before a
     * Schedule is chosen. DayNotFound for a date outside the Trip.
     */
    day(
      date: IsoDate,
    ): Effect.Effect<Option.Option<DayPage>, DayNotFound, SqlClient.SqlClient>
    readonly itineraries: Effect.Effect<ReadonlyArray<ItineraryComparison>>
    readonly comparisonMap: Effect.Effect<ComparisonMap>
    /**
     * The Detail tile at the coordinates, as its archive stores it, still
     * compressed; none outside the archive's boxes, beyond its zoom levels,
     * or at coordinates no map has. DetailTilesUnavailable when the archive
     * can't be read.
     */
    detailTile(
      tile: TileCoordinates,
    ): Effect.Effect<
      Option.Option<DetailTile>,
      DetailTilesUnavailable,
      DetailTileArchive
    >
    itinerary(
      optionNumber: number,
    ): Effect.Effect<ItineraryDetail, ItineraryNotFound>
    /**
     * How an Itinerary breaks the Trip's rules. Only the tests call this, over
     * every Itinerary: content is trusted at runtime and never re-checked.
     */
    tripRuleBreaks(
      optionNumber: number,
    ): Effect.Effect<ReadonlyArray<TripRuleBreak>, ItineraryNotFound>
    /**
     * Every rail section the Itineraries ride, once whichever way it's
     * ridden, and whether the map follows its rail line. Only the rail
     * geometry build and the tests call this.
     */
    readonly railSections: Effect.Effect<ReadonlyArray<MapRailSection>>
    /**
     * Copies an Itinerary into a fresh current Schedule, archiving the one it
     * replaces, as one transaction that also records the operation id with
     * its result. Repeating the operation id returns that result and writes
     * nothing.
     */
    choose(
      input: ChooseItinerary,
    ): Effect.Effect<
      ScheduleChosen,
      ItineraryNotFound | ScheduleChanged,
      SqlClient.SqlClient
    >
    /**
     * Makes an archived Schedule current again, archiving the one it
     * replaces, as one transaction that also records the operation id with
     * its result. Repeating the operation id returns that result and writes
     * nothing.
     */
    restore(
      input: RestoreSchedule,
    ): Effect.Effect<
      ScheduleRestored,
      ScheduleNotFound | ScheduleChanged,
      SqlClient.SqlClient
    >
    /** One Schedule, current or archived. */
    schedule(
      scheduleId: ScheduleId,
    ): Effect.Effect<ScheduleDetail, ScheduleNotFound, SqlClient.SqlClient>
    /**
     * The current Schedule, if Phillip has chosen one, every archived
     * Schedule, the most recently archived first, and the Trip note, if he
     * has written one, read as one transaction so they never come from two
     * moments.
     */
    readonly schedules: Effect.Effect<
      {
        readonly current: Option.Option<ScheduleDetail>
        readonly archived: ReadonlyArray<ArchivedScheduleSummary>
        readonly tripNote?: string
      },
      never,
      SqlClient.SqlClient
    >
    readonly scheduleMap: Effect.Effect<
      Option.Option<ScheduleMap>,
      never,
      SqlClient.SqlClient
    >
    readonly scheduleSummary: Effect.Effect<
      Option.Option<ScheduleSummary>,
      never,
      SqlClient.SqlClient
    >
    /**
     * Writes the Day note on a Day of the Schedule named, as a whole value,
     * so the last write wins. An empty note removes it. ScheduleChanged when
     * the Schedule named isn't current, archived ones included; DayNotFound
     * when it has no Day on the date; NoteTooLong past 10,000 characters.
     * A refused write writes nothing.
     */
    writeDayNote(
      input: WriteDayNote,
    ): Effect.Effect<
      void,
      ScheduleChanged | DayNotFound | NoteTooLong,
      SqlClient.SqlClient
    >
    /**
     * Writes the Stay note on a Stay of the Schedule named, as a whole value,
     * so the last write wins. An empty note removes it. ScheduleChanged when
     * the Schedule named isn't current, archived ones included; StayNotFound
     * when it has no Stay with the id; NoteTooLong past 10,000 characters. A
     * refused write writes nothing.
     */
    writeStayNote(
      input: WriteStayNote,
    ): Effect.Effect<
      void,
      ScheduleChanged | StayNotFound | NoteTooLong,
      SqlClient.SqlClient
    >
    /**
     * Writes the Hotel details on a Stay of the Schedule named, as a whole
     * value, so the last write wins for each field. Each field is trimmed and
     * a blank one removed; all blank leaves the hotel not recorded. The Stay
     * keeps its id. ScheduleChanged when the Schedule named isn't current,
     * archived ones included; StayNotFound when it has no Stay with the id;
     * HotelDetailTooLong for a field past 500 characters. A refused write
     * writes nothing.
     */
    writeHotelDetails(
      input: WriteHotelDetails,
    ): Effect.Effect<
      void,
      ScheduleChanged | StayNotFound | HotelDetailTooLong,
      SqlClient.SqlClient
    >
    /**
     * Splits a Stay of the Schedule named at a date after its check-in and
     * before its check-out, as a Stay edit. The Stay keeps its id, Hotel
     * details, Stay note, highlights and ticks for the nights before the
     * date. A new Stay in the same Base takes the rest with nothing recorded,
     * joined to it by a new local Move, which derives no Checklist item.
     *
     * Fails with StayNotFound when the Schedule has no Stay with the id, and
     * with HardRuleBroken naming a Stay without nights for a date outside it.
     * Otherwise fails as every Stay edit does. The operation id makes a retry
     * return the first result.
     *
     * Every Stay edit runs as one transaction on the Schedule named. Each
     * Stay or Move the edit doesn't remove keeps its id, Hotel details, Stay
     * note and ticks. Each one it removes loses its Checklist item and tick.
     * Verify claims follow their Stays. It returns the Schedule as edited,
     * with its Anchor warnings, which never block the edit. It fails with
     * ScheduleChanged when the Schedule named isn't current, archived ones
     * included, and with HardRuleBroken for the first Hard rule it would
     * break. A refused edit writes nothing.
     */
    splitStay(
      input: SplitStay,
    ): Effect.Effect<
      StaysEdited,
      ScheduleChanged | StayNotFound | HardRuleBroken,
      SqlClient.SqlClient
    >
    /**
     * Merges two adjacent Stays in one Base of the Schedule named, as a Stay
     * edit. The earlier Stay keeps its id, Hotel details, Stay note and ticks,
     * takes the later one's nights and highlights, and the Verify claims
     * follow it. The later Stay, its Checklist item and tick, and the Move
     * between them are removed.
     *
     * Fails with StayNotFound when the Schedule has no Stay with either id,
     * and with HardRuleBroken when the Stays aren't adjacent or are in
     * different Bases. Otherwise it fails like every Stay edit, which
     * splitStay describes.
     * The operation id makes a retry return the first result.
     */
    mergeStays(
      input: MergeStays,
    ): Effect.Effect<
      StaysEdited,
      ScheduleChanged | StayNotFound | HardRuleBroken,
      SqlClient.SqlClient
    >
    /**
     * Moves the date a Stay of the Schedule named checks out, as a Stay edit.
     * The next Stay's check-in and the Move between them move to the same
     * date. Both Stays keep their ids, and with them everything else that
     * splitStay says a Stay edit keeps.
     *
     * Fails with ScheduleChanged when the Schedule named isn't current,
     * archived ones included, and with StayNotFound when it has no Stay with
     * the id. Fails with HardRuleBroken for StayWithoutNights when either
     * Stay would have no nights, and for NotTheTripDates when the last
     * Stay's check-out would move off December 20. A refused move writes
     * nothing.
     */
    moveStayBoundary(
      input: MoveStayBoundary,
    ): Effect.Effect<
      StaysEdited,
      ScheduleChanged | StayNotFound | HardRuleBroken,
      SqlClient.SqlClient
    >
    /**
     * Changes the Base of a Stay of the Schedule named to a place in the
     * catalogue, as a Stay edit, which splitStay describes. The Stay keeps
     * its id, Hotel details, Stay note and ticks, but loses its highlights,
     * which described the old Base. The Moves on either side keep their mode
     * and lose their rail sections and duration, so their travel time is
     * unknown. Changing a Base to the place it already is changes nothing.
     *
     * Fails with StayNotFound when the Schedule has no Stay with the id, and
     * with HardRuleBroken (PlaceNotInCatalogue) for a place outside the
     * catalogue. It also fails as every Stay edit does.
     */
    changeStayBase(
      input: ChangeStayBase,
    ): Effect.Effect<
      StaysEdited,
      ScheduleChanged | StayNotFound | HardRuleBroken,
      SqlClient.SqlClient
    >
    /**
     * Writes the Trip note as a whole value, so the last write wins. An empty
     * note removes it. It belongs to the Trip, so choosing again or restoring
     * leaves it as it is. NoteTooLong past 10,000 characters, writing
     * nothing.
     */
    writeTripNote(
      input: WriteTripNote,
    ): Effect.Effect<void, NoteTooLong, SqlClient.SqlClient>
    /**
     * The Checklist, derived from the current Schedule as it is now, with
     * Phillip's own items, read as one transaction. Before a Schedule is
     * chosen, only his own items.
     */
    readonly checklist: Effect.Effect<Checklist, never, SqlClient.SqlClient>
    /**
     * Sets the tick on an item derived from the Schedule named, to true or
     * false; setting it again changes nothing. ScheduleChanged when the
     * Schedule named isn't current, archived ones included;
     * ChecklistItemNotFound when nothing in it derives an item with the id.
     * A refused write writes nothing.
     */
    tickChecklistItem(
      input: TickChecklistItem,
    ): Effect.Effect<
      void,
      ScheduleChanged | ChecklistItemNotFound,
      SqlClient.SqlClient
    >
    /**
     * Adds one of Phillip's own Checklist items, its text trimmed, as one
     * transaction that also records the operation id with its result.
     * Repeating the operation id returns that result and writes nothing.
     * ChecklistTextInvalid for blank text or text past 500 characters.
     */
    addOwnChecklistItem(
      input: AddOwnChecklistItem,
    ): Effect.Effect<
      OwnChecklistItemAdded,
      ChecklistTextInvalid,
      SqlClient.SqlClient
    >
    tickOwnChecklistItem(
      input: TickOwnChecklistItem,
    ): Effect.Effect<void, ChecklistItemNotFound, SqlClient.SqlClient>
    /**
     * Removes one of Phillip's own Checklist items; removing one already gone
     * changes nothing, so a retry succeeds.
     */
    removeOwnChecklistItem(
      input: RemoveOwnChecklistItem,
    ): Effect.Effect<void, never, SqlClient.SqlClient>
    /**
     * Adds an Activity on a Day of the Schedule named, its title trimmed, as
     * one transaction that also records the operation id with its result.
     * Repeating the operation id returns that result and writes nothing. A
     * timed Activity goes before the first with a later time; any other
     * goes last. ScheduleChanged when the Schedule named isn't current,
     * archived ones included; DayNotFound when it has no Day on the date;
     * ActivityTitleInvalid for a blank title or one past 200 characters;
     * NoteTooLong past 10,000 characters.
     */
    addActivity(
      input: AddActivity,
    ): Effect.Effect<
      ActivityAdded,
      ScheduleChanged | DayNotFound | ActivityTitleInvalid | NoteTooLong,
      SqlClient.SqlClient
    >
    /**
     * Writes the fields an edit carries on an Activity of the Schedule
     * named, so the last write wins for each field; its time stays on its
     * Day's date and its place in the order stays. ScheduleChanged when the
     * Schedule named isn't current; ActivityNotFound when it has no Activity
     * with the id; ActivityTitleInvalid and NoteTooLong as when adding. A
     * refused write writes nothing.
     */
    editActivity(
      input: EditActivity,
    ): Effect.Effect<
      void,
      ScheduleChanged | ActivityNotFound | ActivityTitleInvalid | NoteTooLong,
      SqlClient.SqlClient
    >
    removeActivity(
      input: RemoveActivity,
    ): Effect.Effect<
      void,
      ScheduleChanged | ActivityNotFound,
      SqlClient.SqlClient
    >
    /**
     * Moves an Activity of the Schedule named to just before another on the
     * same Day, or after the rest. ScheduleChanged when the Schedule named
     * isn't current; ActivityNotFound when it has no Activity with either
     * id on that Day, so an Activity never moves to another Day.
     */
    moveActivity(
      input: MoveActivity,
    ): Effect.Effect<
      void,
      ScheduleChanged | ActivityNotFound,
      SqlClient.SqlClient
    >
    /**
     * The coordinates a Google Maps link Phillip pasted carries, for him to
     * confirm as a Pin. It saves nothing. It reads only https links on
     * google.com/maps, maps.google.com, maps.app.goo.gl and goo.gl/maps, and
     * follows a short link for at most five redirects, each on those hosts,
     * within ten seconds. The coordinates come from, in order of preference,
     * the place's pin, the centre of the map shown, or a q=lat,lng query.
     * LocationLinkRefused when the link or a redirect breaks those rules, or
     * it can't follow the link; NoCoordinatesInLink when the link carries
     * none; CoordinatesOutsideJapan for a place elsewhere.
     */
    resolveLocationLink(
      input: ResolveLocationLink,
    ): Effect.Effect<
      Coordinates,
      LocationLinkRefused | NoCoordinatesInLink | CoordinatesOutsideJapan
    >
    /**
     * Sets the Pin on an Activity or a Stay's hotel of the Schedule named, as
     * a whole value, so the last write wins; no Pin removes it. The hotel's
     * Pin is part of the Stay's hotel, as its Hotel details are, and neither
     * write touches the other. ScheduleChanged when the Schedule named isn't
     * current, archived ones included; ActivityNotFound or StayNotFound when
     * it has no such Activity or Stay; LocationLinkRefused for a link that
     * isn't a Google Maps link; CoordinatesOutsideJapan for a Pin elsewhere.
     * A refused write writes nothing.
     */
    setPin(
      input: SetPin,
    ): Effect.Effect<
      void,
      | ScheduleChanged
      | ActivityNotFound
      | StayNotFound
      | LocationLinkRefused
      | CoordinatesOutsideJapan,
      SqlClient.SqlClient
    >
  }
>()('japan-trip/trip/Trip') {
  static readonly layer = Layer.effect(
    Trip,
    Effect.gen(function* () {
      const detailTile = yield* detailTileLookup

      return Trip.of({
        ...(yield* itineraryMethods),
        detailTile,
        ...(yield* scheduleMethods),
        ...(yield* noteMethods),
        ...(yield* stayMethods),
        ...(yield* checklistMethods),
        ...(yield* activityMethods),
      })
    }).pipe(
      Effect.provideServiceEffect(CatalogueLookups, buildCatalogueLookups),
    ),
  )

  /** The Trip over the real Itinerary catalogue, following links online. */
  static readonly live = Trip.layer.pipe(
    Layer.provide([Itineraries.layer, LocationLinkResolver.layer]),
  )
}
