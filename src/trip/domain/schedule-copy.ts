import { Data, Effect, Predicate, Result, Struct } from 'effect'

import {
  birthdayDate,
  shigeharuEveDate,
  tripDates,
  tripEndDate,
  tripStartDate,
} from '@/trip/domain/calendar'
import {
  AnchorWarning,
  HardRule,
  HardRuleBroken,
  Hotel,
  StayDateRuleBreak,
  StayNotFound,
  TripRuleBreak,
  VerifyClaimAttachment,
} from '@/trip/domain/domain'
import type {
  Activity,
  ChangeStayBase,
  Day,
  DayTrip,
  IsoDate,
  MergeStays,
  Move,
  MoveStayBoundary,
  ScheduleAnchor,
  SplitStay,
  Stay,
  StayEditOffers,
  VerifyClaim,
} from '@/trip/domain/domain'
import { isPlaceId } from '@/trip/catalogue/places'

type Copied<A> = A & { readonly id: string }

export type ScheduleStay = Copied<Stay> & {
  readonly note?: string
  readonly hotel: Hotel
}

export type ScheduleDay = Day & {
  readonly note?: string
  readonly activities: ReadonlyArray<Activity>
}

export type ScheduleMove = Copied<Move>

/** A Schedule's own copy of the Itinerary chosen, as Phillip has edited it. */
export interface ScheduleCopy {
  readonly stays: ReadonlyArray<ScheduleStay>
  readonly days: ReadonlyArray<ScheduleDay>
  readonly moves: ReadonlyArray<ScheduleMove>
  readonly dayTrips: ReadonlyArray<Copied<DayTrip>>
  readonly verifyClaims: ReadonlyArray<VerifyClaim>
  readonly anchors: ReadonlyArray<ScheduleAnchor>
}

/** The Stay covering the night a date begins. */
export const stayForNight = <S extends Pick<Stay, 'checkIn' | 'checkOut'>>(
  stays: ReadonlyArray<S>,
  date: IsoDate,
) => stays.find((stay) => stay.checkIn <= date && date < stay.checkOut)

/** The Stay after a Stay: the one checking in the day it checks out. */
export const nextStayOf = <S extends Pick<Stay, 'checkIn'>>(
  stays: ReadonlyArray<S>,
  stay: Pick<Stay, 'checkOut'>,
) => stays.find(({ checkIn }) => checkIn === stay.checkOut)

/** Each Stay boundary between back-to-back Stays, with the Stays it joins. */
export const stayBoundariesOf = <S extends Stay>(stays: ReadonlyArray<S>) =>
  stays.slice(1).flatMap((to, index) => {
    const from = stays[index]

    return from?.checkOut === to.checkIn ? [{ date: to.checkIn, from, to }] : []
  })

export const attachmentKey = (attachedTo: VerifyClaimAttachment) =>
  VerifyClaimAttachment.match(attachedTo, {
    Day: (attachedTo) => `Day ${attachedTo.date}`,
    Stay: (attachedTo) => `Stay ${attachedTo.checkIn}`,
    Itinerary: () => 'Itinerary',
  })

const unchecked = { disableChecks: true }

/**
 * How Stays sorted by check-in break the Hard rules on Stay dates.
 * `checkInOf` gives the check-in that names a Stay without nights. Their
 * dates are already checked, so the breaks skip checking them again: the
 * Stay edit offers run this over a hundred times a read.
 */
export const stayDateRuleBreaksOf = <
  S extends Pick<Stay, 'checkIn' | 'checkOut'>,
>(
  stays: ReadonlyArray<S>,
  checkInOf: (stay: S) => IsoDate = (stay) => stay.checkIn,
): Array<StayDateRuleBreak> => {
  const first = stays[0]
  const last = stays.at(-1)

  if (first === undefined || last === undefined)
    return [StayDateRuleBreak.cases.NoStays.make({}, unchecked)]

  const breaks: Array<StayDateRuleBreak> = []

  if (first.checkIn !== tripStartDate || last.checkOut !== tripEndDate) {
    breaks.push(
      StayDateRuleBreak.cases.NotTheTripDates.make(
        { checkIn: first.checkIn, checkOut: last.checkOut },
        unchecked,
      ),
    )
  }

  for (const stay of stays) {
    if (stay.checkOut <= stay.checkIn) {
      breaks.push(
        StayDateRuleBreak.cases.StayWithoutNights.make(
          { checkIn: checkInOf(stay) },
          unchecked,
        ),
      )
    }
  }

  stays.slice(1).forEach((next, index) => {
    const previous = stays[index]

    if (previous === undefined) return

    if (previous.checkOut < next.checkIn) {
      breaks.push(
        StayDateRuleBreak.cases.Gap.make(
          { from: previous.checkOut, to: next.checkIn },
          unchecked,
        ),
      )
    } else if (next.checkIn < previous.checkOut) {
      breaks.push(
        StayDateRuleBreak.cases.Overlap.make(
          { from: next.checkIn, to: previous.checkOut },
          unchecked,
        ),
      )
    }
  })

  return breaks
}

/**
 * How Moves and Verify claims fail to fit their Stays and Days: a Move off a
 * Stay boundary, two Moves on one date, a Stay boundary without a Move, or a
 * Verify claim attached to nothing there.
 */
export const fitBreaksOf = ({
  stays,
  days,
  moves,
  verifyClaims,
}: {
  readonly stays: ReadonlyArray<Stay>
  readonly days: ReadonlyArray<Pick<Day, 'date'>>
  readonly moves: ReadonlyArray<Move>
  readonly verifyClaims: ReadonlyArray<VerifyClaim>
}): Array<TripRuleBreak> => {
  const breaks: Array<TripRuleBreak> = []
  const boundaryDates = new Set(stayBoundariesOf(stays).map(({ date }) => date))
  const moveDates = new Set(moves.map((move) => move.date))

  for (const date of moveDates) {
    if (!boundaryDates.has(date)) {
      breaks.push(TripRuleBreak.cases.MoveWithoutStayBoundary.make({ date }))
    }

    if (moves.filter((move) => move.date === date).length > 1) {
      breaks.push(TripRuleBreak.cases.MovesOnOneDate.make({ date }))
    }
  }

  for (const date of boundaryDates) {
    if (!moveDates.has(date)) {
      breaks.push(TripRuleBreak.cases.StayBoundaryWithoutMove.make({ date }))
    }
  }

  const attachments = new Set(
    [
      VerifyClaimAttachment.cases.Itinerary.make({}),
      ...days.map(({ date }) => VerifyClaimAttachment.cases.Day.make({ date })),
      ...stays.map(({ checkIn }) =>
        VerifyClaimAttachment.cases.Stay.make({ checkIn }),
      ),
    ].map(attachmentKey),
  )

  for (const { id, attachedTo } of verifyClaims) {
    if (!attachments.has(attachmentKey(attachedTo))) {
      breaks.push(TripRuleBreak.cases.UnattachedVerifyClaim.make({ id }))
    }
  }

  return breaks
}

/** The Anchor warnings for Stays and Moves, in Trip order. */
export const anchorWarningsOf = ({
  stays,
  moves,
}: {
  readonly stays: ReadonlyArray<Stay>
  readonly moves: ReadonlyArray<Move>
}): Array<AnchorWarning> => {
  const warnings: Array<AnchorWarning> = []
  const shigeharuEve = stayForNight(stays, shigeharuEveDate)

  if (shigeharuEve?.base !== 'kyoto') {
    warnings.push(
      AnchorWarning.cases.NotWakingUpInKyoto.make({
        ...(shigeharuEve && { base: shigeharuEve.base }),
      }),
    )
  }

  if (moves.some((move) => move.date === birthdayDate)) {
    warnings.push(AnchorWarning.cases.MoveOnBirthday.make({}))
  }

  const last = stays.at(-1)

  if (last !== undefined && last.base !== 'tokyo') {
    warnings.push(
      AnchorWarning.cases.EndsOutsideTokyo.make({ base: last.base }),
    )
  }

  return warnings
}

/** A Stay edit, as the Trip service's Stay edit operations name it. */
export type StayEdit = Data.TaggedEnum<{
  Split: Pick<SplitStay, 'stayId' | 'date'>
  Merge: Pick<MergeStays, 'stayIds'>
  MoveBoundary: Pick<MoveStayBoundary, 'stayId' | 'checkOut'>
  ChangeBase: Pick<ChangeStayBase, 'stayId' | 'place'>
}>

export const StayEdit = Data.taggedEnum<StayEdit>()

/** What a Stay edit can change in a Schedule's copy. */
export type StayChanges = Pick<ScheduleCopy, 'stays' | 'moves' | 'verifyClaims'>

/**
 * A Stay edit as applied. It holds the Stays, Moves and Verify claims the
 * Schedule keeps, each under the id it already had, and the ids it drops. A
 * Tick is stored under the id of the Stay, Move or Verify claim whose
 * Checklist item it marks, so the dropped Ticks are the dropped ids.
 */
export interface AppliedStayEdit extends StayChanges {
  readonly dropped: {
    readonly stays: ReadonlyArray<string>
    readonly moves: ReadonlyArray<string>
    readonly verifyClaims: ReadonlyArray<string>
    readonly ticks: ReadonlyArray<string>
  }
}

type EditedStays = Pick<ScheduleCopy, 'stays' | 'moves'>

/**
 * Why a Stay edit is refused, as plain data. The offers try many Stay edits
 * on every Schedule read, and building an error for each refusal would cost
 * more than the rest of the check.
 */
type Refusal = Data.TaggedEnum<{
  StayNotFound: { readonly stayId: string }
  HardRuleBroken: { readonly rule: HardRule }
}>

const Refusal = Data.taggedEnum<Refusal>()

type Edited = Result.Result<EditedStays, Refusal>

const refuse = (rule: HardRule) => Result.fail(Refusal.HardRuleBroken({ rule }))

const notRecorded = Hotel.cases.NotRecorded.make({})

const findStay = (copy: ScheduleCopy, stayId: string) => {
  const stay = copy.stays.find(({ id }) => id === stayId)

  return stay === undefined
    ? Result.fail(Refusal.StayNotFound({ stayId }))
    : Result.succeed(stay)
}

const split = (
  copy: ScheduleCopy,
  { stayId, date }: Data.TaggedEnum.Value<StayEdit, 'Split'>,
): Edited =>
  Result.map(findStay(copy, stayId), (stay) => {
    const later: ScheduleStay = {
      id: crypto.randomUUID(),
      base: stay.base,
      checkIn: date,
      checkOut: stay.checkOut,
      accommodation: stay.accommodation,
      highlights: [],
      hotel: notRecorded,
    }

    return {
      stays: copy.stays.flatMap((each) =>
        each.id === stayId ? [{ ...each, checkOut: date }, later] : [each],
      ),
      moves: [
        ...copy.moves,
        { id: crypto.randomUUID(), date, mode: 'local', sections: [] },
      ],
    }
  })

const merge = (
  copy: ScheduleCopy,
  { stayIds }: Data.TaggedEnum.Value<StayEdit, 'Merge'>,
): Edited =>
  Result.gen(function* () {
    const a = yield* findStay(copy, stayIds[0])
    const b = yield* findStay(copy, stayIds[1])
    const [earlier, later] = a.checkIn <= b.checkIn ? [a, b] : [b, a]

    if (earlier.checkOut !== later.checkIn) {
      return yield* refuse(HardRule.cases.StaysNotAdjacent.make({}))
    }

    if (earlier.base !== later.base) {
      return yield* refuse(HardRule.cases.StaysInDifferentBases.make({}))
    }

    const merged: ScheduleStay = {
      ...earlier,
      checkOut: later.checkOut,
      highlights: [...new Set([...earlier.highlights, ...later.highlights])],
    }

    return {
      stays: copy.stays.flatMap((stay) =>
        stay.id === later.id ? [] : [stay.id === earlier.id ? merged : stay],
      ),
      moves: copy.moves.filter((move) => move.date !== later.checkIn),
    }
  })

const moveBoundary = (
  copy: ScheduleCopy,
  { stayId, checkOut }: Data.TaggedEnum.Value<StayEdit, 'MoveBoundary'>,
): Edited =>
  Result.map(findStay(copy, stayId), (stay) => {
    const from = stay.checkOut
    const next = nextStayOf(copy.stays, stay)

    return {
      stays: copy.stays.map((each) =>
        each.id === stayId
          ? { ...each, checkOut }
          : each === next
            ? { ...each, checkIn: checkOut }
            : each,
      ),
      moves: copy.moves.map((move) =>
        move.date === from ? { ...move, date: checkOut } : move,
      ),
    }
  })

const changeBase = (
  copy: ScheduleCopy,
  { stayId, place }: Data.TaggedEnum.Value<StayEdit, 'ChangeBase'>,
): Edited =>
  Result.gen(function* () {
    const stay = yield* findStay(copy, stayId)

    if (!isPlaceId(place)) {
      return yield* refuse(HardRule.cases.PlaceNotInCatalogue.make({ place }))
    }

    if (stay.base === place) return copy

    const adjoining = new Set([stay.checkIn, stay.checkOut])

    return {
      stays: copy.stays.map((each) =>
        each.id === stayId ? { ...each, base: place, highlights: [] } : each,
      ),
      moves: copy.moves.map((move) =>
        adjoining.has(move.date)
          ? { ...Struct.omit(move, ['duration']), sections: [] }
          : move,
      ),
    }
  })

const byCheckIn = (a: Stay, b: Stay) => a.checkIn.localeCompare(b.checkIn)

/**
 * The first Hard rule on Stay dates that the edited Stays break. A Stay
 * without nights comes first. It is named by its check-in before the edit,
 * or by its new check-in if the edit created it.
 */
const stayDateRuleBroken = (
  copy: ScheduleCopy,
  stays: ReadonlyArray<ScheduleStay>,
) => {
  const checkInNow = new Map(copy.stays.map((stay) => [stay.id, stay.checkIn]))

  const breaks = stayDateRuleBreaksOf(
    stays,
    (stay) => checkInNow.get(stay.id) ?? stay.checkIn,
  )

  return breaks.find(Predicate.isTagged('StayWithoutNights')) ?? breaks.at(0)
}

/**
 * Moves each Verify claim with its Stay. A claim on a Stay the edit keeps
 * moves to that Stay's new check-in. A claim on a Stay the edit drops moves
 * to the Stay that now covers the dropped Stay's first night.
 */
const claimsFollowingStays = (
  copy: ScheduleCopy,
  stays: ReadonlyArray<ScheduleStay>,
) => {
  const stayIdOn = new Map(copy.stays.map((stay) => [stay.checkIn, stay.id]))
  const edited = new Map(stays.map((stay) => [stay.id, stay]))

  const sameStayEdited = (checkIn: IsoDate) => {
    const id = stayIdOn.get(checkIn)

    return id === undefined ? undefined : edited.get(id)
  }

  return copy.verifyClaims.map((claim) => {
    if (!VerifyClaimAttachment.guards.Stay(claim.attachedTo)) return claim
    const { checkIn } = claim.attachedTo

    const stay = sameStayEdited(checkIn) ?? stayForNight(stays, checkIn)

    return stay === undefined
      ? claim
      : {
          ...claim,
          attachedTo: VerifyClaimAttachment.cases.Stay.make({
            checkIn: stay.checkIn,
          }),
        }
  })
}

const droppedIds = (
  before: ReadonlyArray<{ readonly id: string }>,
  after: ReadonlyArray<{ readonly id: string }>,
) => {
  const kept = new Set(after.map(({ id }) => id))

  return before.flatMap(({ id }) => (kept.has(id) ? [] : [id]))
}

/**
 * The Stays and Moves a Stay edit leaves, Stays sorted by check-in, or why
 * it's refused. It checks the Hard rules in this order:
 *
 * 1. The Stay named exists, or it fails with StayNotFound.
 * 2. The edit can apply. A merge needs adjacent Stays in one Base, and a new
 *    Base must be a place in the catalogue.
 * 3. The Hard rules on Stay dates, with a Stay without nights first.
 */
const checkedStayEdit = (copy: ScheduleCopy, edit: StayEdit): Edited =>
  Result.flatMap(
    StayEdit.$match(edit, {
      Split: (edit) => split(copy, edit),
      Merge: (edit) => merge(copy, edit),
      MoveBoundary: (edit) => moveBoundary(copy, edit),
      ChangeBase: (edit) => changeBase(copy, edit),
    }),
    ({ stays, moves }) => {
      const sorted = [...stays].sort(byCheckIn)
      const broken = stayDateRuleBroken(copy, sorted)

      return broken === undefined
        ? Result.succeed({ stays: sorted, moves })
        : refuse(broken)
    },
  )

/**
 * Applies a Stay edit to a Schedule's copy, or fails with the Hard rule that
 * refuses it, as checkedStayEdit orders them. A Move left off a Stay boundary
 * is a bug in the edit, so it dies.
 */
export const applyStayEdit = Effect.fnUntraced(function* (
  copy: ScheduleCopy,
  edit: StayEdit,
): Effect.fn.Return<AppliedStayEdit, StayNotFound | HardRuleBroken> {
  const { stays, moves } = yield* Effect.fromResult(
    Result.mapError(
      checkedStayEdit(copy, edit),
      Refusal.$match({
        StayNotFound: ({ stayId }) => new StayNotFound({ stayId }),
        HardRuleBroken: ({ rule }) => new HardRuleBroken({ rule }),
      }),
    ),
  )

  const verifyClaims = claimsFollowingStays(copy, stays)
  const misfits = fitBreaksOf({ stays, moves, verifyClaims, days: copy.days })

  if (misfits.length > 0) {
    return yield* Effect.die(
      new Error(
        `A ${edit._tag} Stay edit left the Schedule not fitting together: ${JSON.stringify(misfits)}`,
      ),
    )
  }

  const dropped = {
    stays: droppedIds(copy.stays, stays),
    moves: droppedIds(copy.moves, moves),
    verifyClaims: droppedIds(copy.verifyClaims, verifyClaims),
  }

  return {
    stays,
    moves,
    verifyClaims,
    dropped: {
      ...dropped,
      ticks: [...dropped.stays, ...dropped.moves, ...dropped.verifyClaims],
    },
  }
})

/**
 * The Stay edits a Stay of a Schedule's copy offers: each split, merge and
 * Stay boundary move the Hard rules accept, checked as the edit itself is.
 */
export const stayEditOffersOf = (
  copy: ScheduleCopy,
  stay: Pick<ScheduleStay, 'id' | 'checkOut'>,
): StayEditOffers => {
  const accepts = (edit: StayEdit) =>
    Result.isSuccess(checkedStayEdit(copy, edit))

  const stayId = stay.id
  const next = nextStayOf(copy.stays, stay)

  return {
    splitDates: tripDates.filter((date) =>
      accepts(StayEdit.Split({ stayId, date })),
    ),
    ...(next !== undefined &&
      accepts(StayEdit.Merge({ stayIds: [stayId, next.id] })) && {
        mergeWith: next.id,
      }),
    ...(next !== undefined && {
      boundary: {
        next: next.id,
        checkOuts: tripDates.filter((checkOut) =>
          accepts(StayEdit.MoveBoundary({ stayId, checkOut })),
        ),
      },
    }),
  }
}
