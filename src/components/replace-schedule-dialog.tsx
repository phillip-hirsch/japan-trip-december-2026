import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Data, Match } from 'effect'
import { useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { ChooseOutcome, RestoreOutcome } from '@/trip/domain'
import { invalidateAfter } from '@/trip/queries'
import type { TripWrite } from '@/trip/queries'

type Refusal = { readonly problem: string; readonly final: boolean }

/** What a write replacing the current Schedule answered. */
export type ReplaceAnswer = Data.TaggedEnum<{
  Replaced: {}
  Refused: Refusal
}>

export const ReplaceAnswer = Data.taggedEnum<ReplaceAnswer>()

/** The refusal of a write made from an out-of-date screen. */
export const scheduleChanged: ReplaceAnswer = ReplaceAnswer.Refused({
  problem:
    'Your Schedule changed on another device, so nothing changed. Check what happens now, then confirm again.',
  final: false,
})

/** Maps writes that replace the Schedule to the confirmation dialog's answer. */
export const replacementAnswerOf = (
  outcome: ChooseOutcome | RestoreOutcome,
): ReplaceAnswer =>
  Match.value(outcome).pipe(
    Match.tagsExhaustive({
      Chosen: () => ReplaceAnswer.Replaced(),
      Restored: () => ReplaceAnswer.Replaced(),
      ItineraryNotFound: (outcome) =>
        ReplaceAnswer.Refused({
          problem: `Option ${outcome.optionNumber} is no longer available, so nothing changed.`,
          final: true,
        }),
      ScheduleNotFound: () =>
        ReplaceAnswer.Refused({
          problem: 'This Schedule no longer exists, so nothing changed.',
          final: true,
        }),
      ScheduleChanged: () => scheduleChanged,
    }),
  )

type DialogState = Data.TaggedEnum<{
  Confirming: {}
  Working: {}
  Refused: Refusal
  Failed: {}
}>

const DialogState = Data.taggedEnum<DialogState>()

const confirming: DialogState = DialogState.Confirming()

/**
 * A write that replaces the current Schedule (choosing or restoring), after
 * a confirmation saying what happens. On success it opens the Schedule.
 *
 * One operation id serves every attempt at the same target, so a retry after
 * a lost answer returns the first result instead of writing again. A refusal
 * writes nothing, so the same id can confirm again once the refreshed
 * confirmation has been read. A new target (the page now shows another
 * Itinerary or Schedule) gets a new id, so it never returns another
 * target's result.
 */
export function ReplaceScheduleDialog({
  write,
  target,
  run,
  trigger,
  triggerLabel,
  title,
  description,
  action,
  working,
  failed,
}: {
  write: TripWrite
  /**
   * What the write acts on, such as the Itinerary chosen; not the Schedule it
   * replaces, which a retry may see change.
   */
  target: string
  run: (operationId: string) => Promise<ReplaceAnswer>
  /** The trigger's button, without children. */
  trigger: ReactElement
  triggerLabel: ReactNode
  title: string
  description: ReactNode
  /** The confirm button's label, and its label while the write runs. */
  action: string
  working: string
  /** Why it didn't go through when the write failed. */
  failed: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const operation = useRef<{ target: string; id: string }>(undefined)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<DialogState>(confirming)

  const confirm = async () => {
    if (operation.current?.target !== target) {
      operation.current = { target, id: crypto.randomUUID() }
    }

    const operationId = operation.current.id
    setState(DialogState.Working())

    try {
      const answer = await run(operationId)

      // Either it changed the Schedule, or a refusal says this screen is out
      // of date; both make what's shown stale.
      if (ReplaceAnswer.$is('Replaced')(answer)) setOpen(false)
      await invalidateAfter(queryClient, write)

      if (ReplaceAnswer.$is('Replaced')(answer)) {
        await navigate({ to: '/schedule' })
      } else {
        setState(answer)
      }
    } catch {
      setState(DialogState.Failed())
    }
  }

  const problem = DialogState.$match(state, {
    Confirming: () => undefined,
    Working: () => undefined,
    Refused: ({ problem }) => problem,
    Failed: () => failed,
  })

  const final = DialogState.$is('Refused')(state) && state.final

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (open) setState(confirming)
        setOpen(open)
      }}
    >
      <AlertDialogTrigger render={trigger}>{triggerLabel}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription
            render={<div />}
            className="flex flex-col gap-2"
          >
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {problem && (
          <p role="alert" className="text-sm">
            {problem}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{final ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {!final && (
            <AlertDialogAction
              onClick={confirm}
              disabled={DialogState.$is('Working')(state)}
            >
              {DialogState.$is('Working')(state) ? working : action}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
