import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
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
import { invalidateAfter } from '@/trip/queries'
import type { TripWrite } from '@/trip/queries'

/** What a write replacing the current Schedule answered. */
export type ReplaceAnswer =
  | { readonly _tag: 'Replaced' }
  | {
      readonly _tag: 'Refused'
      readonly problem: string
      /** Whether confirming again can't help. */
      readonly final: boolean
    }

/** The refusal of a write made from an out-of-date screen. */
export const scheduleChanged: ReplaceAnswer = {
  _tag: 'Refused',
  problem:
    'Your Schedule changed on another device, so nothing changed. Check what happens now, then confirm again.',
  final: false,
}

type DialogState =
  | { readonly _tag: 'Confirming' }
  | { readonly _tag: 'Working' }
  | Extract<ReplaceAnswer, { readonly _tag: 'Refused' }>
  | { readonly _tag: 'Failed' }

const confirming: DialogState = { _tag: 'Confirming' }

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
    setState({ _tag: 'Working' })
    try {
      const answer = await run(operationId)
      // Either it changed the Schedule, or a refusal says this screen is out
      // of date; both make what's shown stale.
      if (answer._tag === 'Replaced') setOpen(false)
      await invalidateAfter(queryClient, write)
      if (answer._tag === 'Replaced') {
        await navigate({ to: '/schedule' })
      } else {
        setState(answer)
      }
    } catch {
      setState({ _tag: 'Failed' })
    }
  }

  const problem =
    state._tag === 'Refused'
      ? state.problem
      : state._tag === 'Failed'
        ? failed
        : undefined
  const final = state._tag === 'Refused' && state.final

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
              disabled={state._tag === 'Working'}
            >
              {state._tag === 'Working' ? working : action}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
