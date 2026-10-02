import { useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef, useState } from 'react'

import { ButtonLink } from '@/components/button-link'
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
import { Button } from '@/components/ui/button'
import type { ChooseOutcome } from '@/trip/domain'
import { chooseItinerary } from '@/trip/trip.functions'

type ChooseState =
  | { readonly _tag: 'Confirming' }
  | { readonly _tag: 'Choosing' }
  | Exclude<ChooseOutcome, { readonly _tag: 'Chosen' }>
  | { readonly _tag: 'Failed' }

const confirming: ChooseState = { _tag: 'Confirming' }

/** Why choosing didn't happen, if it didn't. */
const problemOf = (state: ChooseState) => {
  switch (state._tag) {
    case 'ScheduleAlreadyChosen':
      return `You already have a Schedule, from Option ${state.sourceOptionNumber}. Choosing again isn’t possible yet, so nothing changed.`
    case 'ItineraryNotFound':
      return `Option ${state.optionNumber} is no longer available, so nothing changed.`
    case 'Failed':
      return 'Choosing didn’t go through. Try again; it won’t choose twice.'
    default:
      return undefined
  }
}

/**
 * Choose, after a confirmation: copies the Itinerary into Phillip's Schedule
 * and opens it. One operation id serves every attempt from this page, so a
 * retry after a lost answer returns the first result instead of choosing
 * again.
 */
export function ChooseItineraryButton({
  optionNumber,
}: {
  optionNumber: number
}) {
  const choose = useServerFn(chooseItinerary)
  const navigate = useNavigate()
  const operationId = useRef<string>(undefined)
  const [state, setState] = useState<ChooseState>(confirming)

  const confirm = async () => {
    operationId.current ??= crypto.randomUUID()
    setState({ _tag: 'Choosing' })
    try {
      const outcome = await choose({
        data: { operationId: operationId.current, optionNumber },
      })
      if (outcome._tag === 'Chosen') {
        await navigate({ to: '/schedule' })
      } else {
        setState(outcome)
      }
    } catch {
      setState({ _tag: 'Failed' })
    }
  }

  const problem = problemOf(state)
  const refused =
    state._tag === 'ScheduleAlreadyChosen' || state._tag === 'ItineraryNotFound'

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (open) setState(confirming)
      }}
    >
      <AlertDialogTrigger render={<Button size="lg" />}>
        Choose Option {optionNumber}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Choose Option {optionNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            It becomes your Schedule: your own copy of its Stays and Days to
            plan in. Later Revisions of Option {optionNumber} won’t change it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {problem && (
          <p role="alert" className="text-sm">
            {problem}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{refused ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {state._tag === 'ScheduleAlreadyChosen' ? (
            <ButtonLink to="/schedule">Open your Schedule</ButtonLink>
          ) : refused ? null : (
            <AlertDialogAction
              onClick={confirm}
              disabled={state._tag === 'Choosing'}
            >
              {state._tag === 'Choosing'
                ? 'Choosing…'
                : `Choose Option ${optionNumber}`}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
