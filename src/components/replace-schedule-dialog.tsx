import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Data, Match } from 'effect'
import { useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

import { editingPaused, useEditingPaused } from '@/access/connection-status'
import { EditingPausedNote } from '@/components/not-saved-alert'
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
import type {
  ChooseOutcome,
  RestoreOutcome,
  ScheduleId,
  ScheduleSummary,
} from '@/trip/domain/domain'
import { operationFor } from '@/trip/client/operations'
import type { Operation } from '@/trip/client/operations'
import { invalidateAfter } from '@/trip/client/queries'
import type { TripWrite } from '@/trip/client/queries'
import { chooseItinerary, restoreSchedule } from '@/trip/trip/trip.functions'

type Refusal = { readonly problem: string; readonly final: boolean }

export type ReplaceAnswer = Data.TaggedEnum<{
  Replaced: {}
  Refused: Refusal
}>

export const ReplaceAnswer = Data.taggedEnum<ReplaceAnswer>()

export const scheduleChanged: ReplaceAnswer = ReplaceAnswer.Refused({
  problem:
    'Your Schedule changed on another device, so nothing changed. Check what happens now, then confirm again.',
  final: false,
})

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

/** What a write that replaces the current Schedule needs. */
interface Replacement {
  readonly write: TripWrite
  /**
   * What the write acts on, such as the Itinerary chosen; not the Schedule it
   * replaces, which a retry may see change.
   */
  readonly target: string
  readonly run: (operationId: string) => Promise<ReplaceAnswer>
}

/**
 * A write that replaces the current Schedule by choosing an Itinerary or
 * restoring a Schedule. Phillip confirms it in a dialog. On success the dialog
 * closes and the Schedule opens.
 *
 * Each attempt goes under an operation for its target, by the rule a save
 * uses for its Schedule. A retry after a lost answer returns the first
 * result instead of writing again. A refusal writes nothing, so the same id
 * can confirm again once Phillip has read the refreshed confirmation. When
 * the page shows another Itinerary or Schedule, its target gets a new id, so
 * it never returns another target's result. While the app is offline,
 * confirming sends nothing until the connection returns.
 */
const useScheduleReplacement = ({ write, target, run }: Replacement) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const paused = useEditingPaused()
  const operation = useRef<Operation>(undefined)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<DialogState>(confirming)

  const confirm = async () => {
    if (editingPaused()) return

    operation.current = operationFor(operation.current, target)
    const operationId = operation.current.id
    setState(DialogState.Working())

    try {
      const answer = await run(operationId)

      if (ReplaceAnswer.$is('Replaced')(answer)) setOpen(false)
      // A refusal means this screen is out of date, so invalidate either way.
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

  const openChange = (next: boolean) => {
    if (next) setState(confirming)
    setOpen(next)
  }

  return {
    open,
    openChange,
    paused,
    working: DialogState.$is('Working')(state),
    /** Why the Trip refused the last attempt, if it did. */
    refusal: DialogState.$is('Refused')(state) ? state.problem : undefined,
    /** The last attempt got no answer. */
    failed: DialogState.$is('Failed')(state),
    /** A refusal no retry can change, so only Close is left. */
    final: DialogState.$is('Refused')(state) && state.final,
    confirm,
  }
}

export type ScheduleReplacement = ReturnType<typeof useScheduleReplacement>

/** Choosing Option `optionNumber`, replacing the Schedule `current`, if any. */
export const useChooseItinerary = ({
  optionNumber,
  current,
}: {
  optionNumber: number
  current: ScheduleSummary | null
}) => {
  const choose = useServerFn(chooseItinerary)

  return useScheduleReplacement({
    write: 'choose',
    target: `Option ${optionNumber}`,
    run: async (operationId) =>
      replacementAnswerOf(
        await choose({
          data: { operationId, optionNumber, replacing: current?.id ?? null },
        }),
      ),
  })
}

/** Restoring the archived Schedule `scheduleId`, replacing `current`, if any. */
export const useRestoreSchedule = ({
  scheduleId,
  current,
}: {
  scheduleId: ScheduleId
  current: ScheduleSummary | null
}) => {
  const restore = useServerFn(restoreSchedule)

  return useScheduleReplacement({
    write: 'restore',
    target: scheduleId,
    run: async (operationId) =>
      replacementAnswerOf(
        await restore({
          data: { operationId, scheduleId, replacing: current?.id ?? null },
        }),
      ),
  })
}

/** The confirmation of a Schedule replacement, saying what happens. */
export function ReplaceScheduleDialog({
  replacement: dialog,
  trigger,
  triggerLabel,
  title,
  description,
  action,
  working,
  failed,
}: {
  replacement: ScheduleReplacement
  trigger: ReactElement
  triggerLabel: ReactNode
  title: string
  description: ReactNode
  action: string
  working: string
  failed: string
}) {
  const problem = dialog.failed ? failed : dialog.refusal

  return (
    <AlertDialog open={dialog.open} onOpenChange={dialog.openChange}>
      <AlertDialogTrigger render={trigger} disabled={dialog.paused}>
        {triggerLabel}
      </AlertDialogTrigger>
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
        {dialog.paused && <EditingPausedNote />}
        <AlertDialogFooter>
          <AlertDialogCancel>
            {dialog.final ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {!dialog.final && (
            <AlertDialogAction
              onClick={dialog.confirm}
              disabled={dialog.working || dialog.paused}
            >
              {dialog.working ? working : action}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
