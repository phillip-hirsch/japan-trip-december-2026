import { useQueryClient } from '@tanstack/react-query'
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
import { Skeleton } from '@/components/ui/skeleton'
import type { ChooseOutcome } from '@/trip/domain'
import { invalidateAfter, useScheduleSummary } from '@/trip/queries'
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
 * What an Itinerary's page offers about Phillip's Schedule, from the Schedule
 * summary: a neutral placeholder until it answers, then Choose while no
 * Schedule exists, or where the Schedule came from.
 */
export function ChooseItinerary({ optionNumber }: { optionNumber: number }) {
  const summary = useScheduleSummary()
  // An open dialog stays until closed, even once a Schedule appears, so a
  // refusal is read before the page changes under it.
  const [open, setOpen] = useState(false)
  if (summary === null || open) {
    return (
      <ChooseItineraryButton
        optionNumber={optionNumber}
        open={open}
        onOpenChange={setOpen}
      />
    )
  }
  if (summary === undefined) {
    return <Skeleton aria-hidden className="h-10 w-40" />
  }
  if (summary.sourceOptionNumber === optionNumber) {
    return (
      <div>
        <ButtonLink to="/schedule" size="lg">
          Open your Schedule
        </ButtonLink>
        <p className="mt-3 text-sm text-muted-foreground">
          Your Schedule came from this Itinerary.
        </p>
      </div>
    )
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled>
          Choose Option {optionNumber}
        </Button>
        <ButtonLink to="/schedule" size="lg" variant="outline">
          Open your Schedule
        </ButtonLink>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Your Schedule came from Option {summary.sourceOptionNumber}. Choosing
        again isn’t possible yet.
      </p>
    </div>
  )
}

/**
 * Choose, after a confirmation: copies the Itinerary into Phillip's Schedule
 * and opens it. One operation id serves every attempt from this page, so a
 * retry after a lost answer returns the first result instead of choosing
 * again.
 */
function ChooseItineraryButton({
  optionNumber,
  open,
  onOpenChange,
}: {
  optionNumber: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const choose = useServerFn(chooseItinerary)
  const queryClient = useQueryClient()
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
      // A refusal because a Schedule exists means it was chosen elsewhere,
      // so this page's view of it is as stale as after choosing here.
      if (outcome._tag !== 'ItineraryNotFound') {
        await invalidateAfter(queryClient, 'choose')
      }
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
      open={open}
      onOpenChange={(open) => {
        if (open) setState(confirming)
        onOpenChange(open)
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
