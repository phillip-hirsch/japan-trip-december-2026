import { useServerFn } from '@tanstack/react-start'
import { Match, Predicate } from 'effect'
import { MapPinIcon, MapPinPlusIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
import { OpenInGoogleMaps } from '@/components/open-in-google-maps'
import { PinMap } from '@/components/pin-map'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  Coordinates,
  LocationLinkRefusal,
  Pin,
  PinTarget,
  ResolveLocationLinkOutcome,
  ScheduleId,
  SetPinOutcome,
} from '@/trip/domain'
import { pinTarget, SaveAnswer, SaveState, useSave } from '@/trip/drafts'
import { locationLinkMaxLength } from '@/trip/limits'
import { googleMapsUrlOf } from '@/trip/pins'
import { resolveLocationLink, setPin } from '@/trip/trip.functions'

/**
 * A Pin as placed. Its link is the Google Maps link as pasted, or '' for
 * none. Its coordinates are null until the link resolves or Phillip drops
 * the Pin by hand.
 */
interface PinFields {
  readonly link: string
  readonly coordinates: Coordinates | null
}

const noPin: PinFields = { link: '', coordinates: null }

const fieldsOf = (pin: Pin | undefined): PinFields =>
  pin === undefined
    ? noPin
    : { link: pin.link ?? '', coordinates: pin.coordinates }

const sameFields = (a: PinFields, b: PinFields) =>
  a.link.trim() === b.link.trim() &&
  a.coordinates?.latitude === b.coordinates?.latitude &&
  a.coordinates?.longitude === b.coordinates?.longitude

const isCoordinates = (value: unknown): value is Coordinates =>
  Predicate.isObject(value) &&
  Predicate.isNumber(value.latitude) &&
  Predicate.isNumber(value.longitude)

const isPinFields = (value: unknown): value is PinFields =>
  Predicate.isObject(value) &&
  Predicate.isString(value.link) &&
  (Predicate.isNull(value.coordinates) || isCoordinates(value.coordinates))

/** The Pin a placed one saves as, or none while it has no coordinates. */
const pinOfFields = ({ link, coordinates }: PinFields): Pin | undefined =>
  coordinates === null
    ? undefined
    : { coordinates, ...(link.trim() !== '' && { link: link.trim() }) }

/** Why a link was refused, and what Phillip can do instead. */
const refusalProblems: Record<LocationLinkRefusal, string> = {
  NotGoogleMaps:
    'That isn’t a Google Maps link. Paste one that starts with https://maps.app.goo.gl/ or https://www.google.com/maps, or drop the pin by hand.',
  TooLong: `That link is longer than ${locationLinkMaxLength.toLocaleString('en')} characters. Use the place’s Share link instead, or drop the pin by hand.`,
  LeftGoogleMaps:
    'That link redirects away from Google Maps, so the app won’t follow it. Drop the pin by hand instead.',
  TooManyRedirects:
    'That link redirects too many times to follow. Use the place’s Share link instead, or drop the pin by hand.',
  TimedOut:
    'Google Maps took too long to answer. Try again, or drop the pin by hand.',
  Unreachable:
    'The app couldn’t follow that link. Check it’s right, or drop the pin by hand.',
}

const outsideJapan =
  'That place is outside Japan. Paste a link to somewhere in Japan, or drop the pin by hand.'

const noCoordinates =
  'This link names the place but doesn’t say where it is. Drag the pin into place, or tap the map where it goes. The app keeps the link for Open in Google Maps.'

const setAnswerOf =
  (gone: string) =>
  (outcome: SetPinOutcome): SaveAnswer =>
    Match.value(outcome).pipe(
      Match.tagsExhaustive({
        Set: () => SaveAnswer.Saved(),
        ScheduleChanged: () => SaveAnswer.ScheduleChanged(),
        ActivityNotFound: () => SaveAnswer.Gone({ problem: gone }),
        StayNotFound: () => SaveAnswer.Gone({ problem: gone }),
        LocationLinkRefused: ({ reason }) =>
          SaveAnswer.Refused({ problem: refusalProblems[reason] }),
        CoordinatesOutsideJapan: () =>
          SaveAnswer.Refused({
            problem: 'The pin is outside Japan. Drag it back into Japan.',
          }),
      }),
    )

/** Where finding a pasted link stands, while placing a Pin. */
type Finding =
  | { readonly state: 'idle' }
  | { readonly state: 'finding' }
  | { readonly state: 'found' | 'byHand' | 'problem'; readonly note: string }

const idle: Finding = { state: 'idle' }

/**
 * The Pin on an Activity or a Stay's hotel, set under the save pattern
 * (`@/trip/drafts`). Phillip pastes a Google Maps link and its coordinates
 * show as a Pin on a map, or he drops one by hand. He drags it into place,
 * and the field saves nothing until he confirms it. Key it by its target.
 */
export function PinField({
  scheduleId,
  target,
  pin,
  near,
  noun,
  labelledBy,
  gone,
  summaryClassName,
}: {
  scheduleId: ScheduleId
  target: PinTarget
  pin: Pin | undefined
  /** Where a Pin dropped by hand starts, such as the Stay's Base. */
  near: Coordinates
  /** What the Pin is called on its controls, such as "location". */
  noun: string
  /** The id of what the Pin is for, such as its Activity's title. */
  labelledBy: string
  /** Why the Pin can't be saved once what it's on is gone. */
  gone: string
  /** Where the Pin and its button sit while not being placed. */
  summaryClassName?: string
}) {
  const resolve = useServerFn(resolveLocationLink)
  const write = useServerFn(setPin)
  const linkId = useId()
  const noteId = useId()
  const problemId = useId()
  const [finding, setFinding] = useState<Finding>(idle)
  // Where the map is framed while placing. It starts on the Pin placing
  // starts from, then moves wherever a link resolves or Phillip drops a Pin
  // by hand.
  const [frame, setFrame] = useState<Coordinates | undefined>(undefined)
  // Counts lookups, so one cancelled or overtaken never places its Pin.
  const lookup = useRef(0)
  useEffect(
    () => () => {
      lookup.current += 1
    },
    [],
  )

  const field = useSave<PinFields>({
    draft: { target: pinTarget(target), isValue: isPinFields },
    equals: sameFields,
    scheduleId,
    saved: fieldsOf(pin),
    write: 'pin',
    run: async (placed) => {
      const confirmed = pinOfFields(placed)

      return setAnswerOf(gone)(
        await write({
          data: { scheduleId, target, ...(confirmed && { pin: confirmed }) },
        }),
      )
    },
  })

  const { state, value } = field

  const placing =
    !SaveState.$is('Clean')(state) && !SaveState.$is('Saved')(state)

  // Placing frames the Pin it starts from, a restored draft's included.
  useEffect(() => {
    if (!placing) setFrame(undefined)
    else if (frame === undefined && value.coordinates !== null) {
      setFrame(value.coordinates)
    }
  }, [placing, frame, value.coordinates])

  /** Stops waiting for any lookup in flight. */
  const stopFinding = () => {
    lookup.current += 1
    setFinding(idle)
  }

  if (!placing) {
    const justSaved = SaveState.$is('Saved')(state) || state.justSaved
    // This shows the Pin just saved until a read confirms it, then what the
    // server holds.
    const shown = pinOfFields(value)

    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-4 gap-y-2',
          summaryClassName,
        )}
      >
        {shown && <OpenInGoogleMaps pin={shown} />}
        <Button
          variant="ghost"
          size="sm"
          aria-describedby={labelledBy}
          // A new placing starts from the Pin the confirming read brings.
          disabled={SaveState.$is('Saved')(state)}
          onClick={() => {
            stopFinding()
            field.edit()
          }}
          className="-mx-2.5 text-muted-foreground"
        >
          <MapPinPlusIcon data-icon="inline-start" aria-hidden />
          {shown ? `Change ${noun}` : `Add ${noun}`}
        </Button>
        <SavedStatus saved={justSaved}>Saved</SavedStatus>
      </div>
    )
  }

  const notSaved = SaveState.$is('NotSaved')(state)
  const saving = SaveState.$is('Saving')(state)
  const busy = saving || finding.state === 'finding'
  const placed = value.coordinates

  const place = (coordinates: Coordinates) =>
    field.change({ ...value, coordinates })

  const dropByHand = () => {
    setFrame(near)
    place(near)
    setFinding({
      state: 'byHand',
      note: 'Drag the pin into place, or tap the map where it goes.',
    })
  }

  /** Finds a pasted link's coordinates and places the Pin there. */
  const find = async (link: string) => {
    if (link.trim() === '') return

    if (googleMapsUrlOf(link.trim()) === undefined) {
      setFinding({ state: 'problem', note: refusalProblems.NotGoogleMaps })

      return
    }

    lookup.current += 1
    const current = lookup.current
    setFinding({ state: 'finding' })
    let outcome: ResolveLocationLinkOutcome

    try {
      outcome = await resolve({ data: { link } })
    } catch {
      if (lookup.current !== current) return
      setFinding({
        state: 'problem',
        note: 'The app couldn’t reach the server. Try again when you’re back online.',
      })

      return
    }

    if (lookup.current !== current) return
    Match.value(outcome).pipe(
      Match.tagsExhaustive({
        Resolved: ({ coordinates }) => {
          setFrame(coordinates)
          field.change({ link, coordinates })
          setFinding({
            state: 'found',
            note: 'Found. Drag the pin into exactly the right place, then confirm it.',
          })
        },
        NoCoordinatesInLink: () => {
          setFrame(near)
          field.change({ link, coordinates: near })
          setFinding({ state: 'byHand', note: noCoordinates })
        },
        LocationLinkRefused: ({ reason }) =>
          setFinding({ state: 'problem', note: refusalProblems[reason] }),
        CoordinatesOutsideJapan: () =>
          setFinding({ state: 'problem', note: outsideJapan }),
      }),
    )
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex flex-col gap-3"
    >
      {notSaved && (
        <NotSavedAlert problem={state.problem} problemId={problemId} />
      )}
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          void find(value.link)
        }}
      >
        <label htmlFor={linkId} className="text-sm text-muted-foreground">
          Google Maps link
        </label>
        <div className="flex gap-2">
          <Input
            id={linkId}
            type="url"
            inputMode="url"
            placeholder="https://maps.app.goo.gl/…"
            aria-describedby={
              [
                ...(finding.state !== 'idle' ? [noteId] : []),
                ...(notSaved ? [problemId] : []),
              ].join(' ') || undefined
            }
            // Opening the editor focuses it; a restored draft opens unfocused.
            autoFocus={SaveState.$is('Editing')(state) && placed === null}
            readOnly={busy}
            value={value.link}
            maxLength={locationLinkMaxLength}
            autoComplete="off"
            spellCheck={false}
            // A changed link no longer says where the Pin is.
            onChange={(event) => {
              stopFinding()
              field.change({ link: event.target.value, coordinates: null })
            }}
            // Pasting finds the place at once.
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text')

              if (pasted.trim() === '') return
              event.preventDefault()
              field.change({ link: pasted, coordinates: null })
              void find(pasted)
            }}
            className="h-10 min-w-0 flex-1"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || value.link.trim() === ''}
            className="h-10"
          >
            {finding.state === 'finding' ? 'Finding…' : 'Find'}
          </Button>
        </div>
      </form>
      {finding.state === 'finding' && (
        <p id={noteId} role="status" className="text-sm text-muted-foreground">
          Finding the place…
        </p>
      )}
      {(finding.state === 'found' ||
        finding.state === 'byHand' ||
        finding.state === 'problem') && (
        <p
          id={noteId}
          role={finding.state === 'problem' ? 'alert' : 'status'}
          className={cn(
            'text-sm',
            finding.state !== 'problem' && 'text-muted-foreground',
          )}
        >
          {finding.note}
        </p>
      )}
      {placed === null ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={dropByHand}
            className="-mx-2.5 text-muted-foreground"
          >
            <MapPinIcon data-icon="inline-start" aria-hidden />
            Drop the pin by hand
          </Button>
        </div>
      ) : (
        <PinMap pin={placed} frame={frame ?? placed} onMove={place} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={busy || placed === null}
          onClick={() => void field.save()}
        >
          {saving ? 'Saving…' : notSaved ? 'Retry' : `Confirm ${noun}`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            stopFinding()
            field.discard()
          }}
        >
          {notSaved ? 'Discard' : 'Cancel'}
        </Button>
        {pin !== undefined && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void field.send(noPin)}
            className="ml-auto text-muted-foreground"
          >
            Remove {noun}
          </Button>
        )}
      </div>
    </div>
  )
}
