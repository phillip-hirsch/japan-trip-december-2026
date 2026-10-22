import { useServerFn } from '@tanstack/react-start'
import { Match, Predicate } from 'effect'
import { MapPinIcon, MapPinPlusIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { editingPaused } from '@/access/connection-status'
import { EditorFrame, frameOf, saveVerb } from '@/components/editor-frame'
import { SavedStatus } from '@/components/not-saved-alert'
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
} from '@/trip/domain/domain'
import { answerOwn, pinTarget, SaveAnswer, useSave } from '@/trip/client/drafts'
import type { OwnOutcome } from '@/trip/client/drafts'
import { locationLinkMaxLength } from '@/trip/domain/limits'
import { linkRefusalOf } from '@/trip/location-links/pins'
import { resolveLocationLink, setPin } from '@/trip/trip/trip.functions'

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

const droppedByHand = (near: Coordinates): PinFields => ({
  link: '',
  coordinates: near,
})

const pinOfFields = ({ link, coordinates }: PinFields): Pin | undefined =>
  coordinates === null
    ? undefined
    : { coordinates, ...(link.trim() !== '' && { link: link.trim() }) }

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

const pinRefusal = (outcome: OwnOutcome<SetPinOutcome>): SaveAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      LocationLinkRefused: ({ reason }) =>
        SaveAnswer.Refused({ problem: refusalProblems[reason] }),
      CoordinatesOutsideJapan: () =>
        SaveAnswer.Refused({
          problem: 'The pin is outside Japan. Drag it back into Japan.',
        }),
    }),
  )

type Finding =
  | { readonly state: 'idle' }
  | { readonly state: 'finding' }
  | { readonly state: 'found' | 'byHand' | 'problem'; readonly note: string }

const idle: Finding = { state: 'idle' }

/** The Pin on an Activity or a Stay's hotel of the Schedule shown, set as `pin`. */
export const usePin = ({
  scheduleId,
  target,
  pin,
}: {
  scheduleId: ScheduleId
  target: PinTarget
  pin: Pin | undefined
}) => {
  const write = useServerFn(setPin)

  return useSave<PinFields>({
    target: pinTarget(target),
    draft: isPinFields,
    equals: sameFields,
    scheduleId,
    saved: fieldsOf(pin),
    write: 'pin',
    run: async (placed) => {
      const confirmed = pinOfFields(placed)

      return answerOwn(
        await write({
          data: { scheduleId, target, ...(confirmed && { pin: confirmed }) },
        }),
        pinRefusal,
      )
    },
  })
}

export function PinField({
  near,
  noun,
  labelledBy,
  summaryClassName,
  ...props
}: Parameters<typeof usePin>[0] & {
  near: Coordinates
  noun: string
  labelledBy: string
  summaryClassName?: string
}) {
  const resolve = useServerFn(resolveLocationLink)
  const linkId = useId()
  const noteId = useId()
  const [finding, setFinding] = useState<Finding>(idle)
  const [mapFrame, setMapFrame] = useState<Coordinates | undefined>(undefined)
  const lookups = useRef(0)

  const cancelLookups = () => {
    lookups.current += 1
  }

  const beginLookup = () => {
    cancelLookups()
    const lookup = lookups.current

    return () => lookups.current === lookup
  }

  const field = usePin(props)
  const { value } = field
  const placing = frameOf(field).view === 'form'

  useEffect(() => {
    if (!placing) setMapFrame(undefined)
    else if (mapFrame === undefined && value.coordinates !== null) {
      setMapFrame(value.coordinates)
    }
  }, [placing, mapFrame, value.coordinates])

  const stopFinding = () => {
    cancelLookups()
    setFinding(idle)
  }

  // A new Pin target cancels any lookup in progress.
  useEffect(() => stopFinding, [pinTarget(props.target)])

  const looking = finding.state === 'finding'
  const placed = value.coordinates

  const place = (coordinates: Coordinates) =>
    field.change({ ...value, coordinates })

  const dropByHand = () => {
    setMapFrame(near)
    field.change(droppedByHand(near))
    setFinding({
      state: 'byHand',
      note: 'Drag the pin into place, or tap the map where it goes.',
    })
  }

  const find = async (link: string) => {
    const isCurrent = beginLookup()

    if (link.trim() === '' || editingPaused()) return

    const refusal = linkRefusalOf(link.trim())

    if (refusal !== undefined) {
      setFinding({ state: 'problem', note: refusalProblems[refusal] })

      return
    }

    setFinding({ state: 'finding' })
    let outcome: ResolveLocationLinkOutcome

    const unreachable = () =>
      setFinding({
        state: 'problem',
        note: 'The app couldn’t reach the server. Try again when you’re back online.',
      })

    try {
      outcome = await resolve({ data: { link } })
    } catch {
      if (isCurrent()) unreachable()

      return
    }

    if (!isCurrent()) return

    // Offline by the time it answered, the Pin can't take what it found.
    if (editingPaused()) return unreachable()
    Match.value(outcome).pipe(
      Match.tagsExhaustive({
        Resolved: ({ coordinates }) => {
          setMapFrame(coordinates)
          field.change({ link, coordinates })
          setFinding({
            state: 'found',
            note: 'Found. Drag the pin into exactly the right place, then confirm it.',
          })
        },
        NoCoordinatesInLink: () => {
          setMapFrame(near)
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
    <EditorFrame
      field={{
        ...field,
        discard: () => {
          stopFinding()
          field.discard()
        },
      }}
      labelledBy={labelledBy}
      verb={{ ...saveVerb, submit: `Confirm ${noun}` }}
      formless
      ready={placed !== null && !looking}
      summaryView={(frame) => {
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
              disabled={frame.locked}
              onClick={() => {
                stopFinding()
                field.edit()
              }}
              className="-mx-2.5 text-muted-foreground"
            >
              <MapPinPlusIcon data-icon="inline-start" aria-hidden />
              {shown ? `Change ${noun}` : `Add ${noun}`}
            </Button>
            <SavedStatus saved={frame.justSaved}>{saveVerb.done}</SavedStatus>
          </div>
        )
      }}
      actions={(frame) =>
        props.pin !== undefined && (
          <Button
            type="button"
            variant="ghost"
            disabled={frame.locked || looking}
            onClick={() => void field.send(noPin)}
            className="ml-auto text-muted-foreground"
          >
            Remove {noun}
          </Button>
        )
      }
    >
      {(frame) => {
        const locked = frame.locked || looking

        return (
          <>
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
                      ...(frame.describedBy !== undefined
                        ? [frame.describedBy]
                        : []),
                    ].join(' ') || undefined
                  }
                  autoFocus={frame.autoFocus && placed === null}
                  readOnly={locked}
                  value={value.link}
                  maxLength={locationLinkMaxLength}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    stopFinding()
                    field.change({
                      link: event.target.value,
                      coordinates: null,
                    })
                  }}
                  // Pasting finds the place at once. A paste still fires on the
                  // read-only field, so it waits like typing does.
                  onPaste={(event) => {
                    const pasted = event.clipboardData.getData('text')

                    if (locked || pasted.trim() === '') return
                    event.preventDefault()
                    field.change({ link: pasted, coordinates: null })
                    void find(pasted)
                  }}
                  className="h-10 min-w-0 flex-1"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={locked || value.link.trim() === ''}
                  className="h-10"
                >
                  {looking ? 'Finding…' : 'Find'}
                </Button>
              </div>
            </form>
            {looking && (
              <p
                id={noteId}
                role="status"
                className="text-sm text-muted-foreground"
              >
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
                  disabled={locked}
                  onClick={dropByHand}
                  className="-mx-2.5 text-muted-foreground"
                >
                  <MapPinIcon data-icon="inline-start" aria-hidden />
                  Drop the pin by hand
                </Button>
              </div>
            ) : (
              <PinMap
                pin={placed}
                frame={mapFrame ?? placed}
                onMove={place}
                locked={frame.locked}
              />
            )}
          </>
        )
      }}
    </EditorFrame>
  )
}
