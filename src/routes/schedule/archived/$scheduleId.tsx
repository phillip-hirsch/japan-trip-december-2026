import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Navigate,
  notFound,
  redirect,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { ButtonLink } from '@/components/button-link'
import { NotFound } from '@/components/not-found'
import {
  ReplaceScheduleDialog,
  scheduleChanged,
} from '@/components/replace-schedule-dialog'
import type { ReplaceAnswer } from '@/components/replace-schedule-dialog'
import {
  RevisionNotice,
  ScheduleSections,
} from '@/components/schedule-sections'
import { Button } from '@/components/ui/button'
import { VerifyClaims } from '@/components/verify-claims'
import { formatMoment } from '@/trip/calendar'
import type { RestoreOutcome, ScheduleDetail } from '@/trip/domain'
import { archivedScheduleQuery, useScheduleSummary } from '@/trip/queries'
import { parseScheduleId } from '@/trip/params'
import { restoreSchedule } from '@/trip/trip.functions'

// Personal state, so never prerendered: each visit asks the Trip store.
export const Route = createFileRoute('/schedule/archived/$scheduleId')({
  params: {
    parse: (params) => {
      const scheduleId = parseScheduleId(params.scheduleId)
      if (scheduleId === undefined) throw notFound()
      return { scheduleId }
    },
    stringify: ({ scheduleId }) => ({ scheduleId }),
  },
  loader: {
    handler: async ({ context, params: { scheduleId } }) => {
      const schedule = await context.queryClient.fetchQuery(
        archivedScheduleQuery(scheduleId),
      )
      if (schedule === null) throw notFound()
      // The current Schedule lives at /schedule.
      if (schedule.status === 'current') throw redirect({ to: '/schedule' })
    },
    staleReloadMode: 'blocking',
  },
  head: () => ({
    meta: [{ title: 'Archived Schedule · Japan · December 2026' }],
  }),
  component: ArchivedSchedulePage,
})

function ArchivedSchedulePage() {
  const { scheduleId } = Route.useParams()
  const schedule = useSuspenseQuery(archivedScheduleQuery(scheduleId)).data
  if (schedule === null) return <NotFound />
  // Restored, here or on another device: the current Schedule lives at
  // /schedule.
  if (schedule.status === 'current') return <Navigate to="/schedule" />
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 md:px-12 md:py-16">
      <header>
        <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
          Archived Schedule
        </p>
        <h1 className="mt-4 text-5xl font-semibold md:text-6xl">
          Option {schedule.sourceOptionNumber}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Copied from Option {schedule.sourceOptionNumber} on{' '}
          <time dateTime={schedule.chosenAt}>
            {formatMoment(schedule.chosenAt)}
          </time>
          {schedule.archivedAt !== null && (
            <>
              , archived on{' '}
              <time dateTime={schedule.archivedAt}>
                {formatMoment(schedule.archivedAt)}
              </time>
            </>
          )}
          . Read-only until you restore it.
        </p>
        <RevisionNotice schedule={schedule} className="mt-6" />
        <div className="mt-8 flex flex-wrap gap-2">
          <RestoreSchedule schedule={schedule} />
          <ButtonLink to="/schedule" size="lg" variant="outline">
            Open your Schedule
          </ButtonLink>
        </div>
        <VerifyClaims claims={schedule.verifyClaims} className="mt-6" />
      </header>
      <ScheduleSections schedule={schedule} />
    </article>
  )
}

const answerOf = (outcome: RestoreOutcome): ReplaceAnswer => {
  switch (outcome._tag) {
    case 'Restored':
      return { _tag: 'Replaced' }
    case 'ScheduleNotFound':
      return {
        _tag: 'Refused',
        problem: 'This Schedule no longer exists, so nothing changed.',
        final: true,
      }
    case 'ScheduleChanged':
      return scheduleChanged
  }
}

/**
 * Restore, after a confirmation: makes this Schedule current again,
 * archiving the current one, and opens it. It waits for the Schedule summary,
 * which names the Schedule it archives.
 */
function RestoreSchedule({ schedule }: { schedule: ScheduleDetail }) {
  const restore = useServerFn(restoreSchedule)
  const current = useScheduleSummary()
  if (current === undefined) {
    return (
      <Button size="lg" disabled>
        Restore this Schedule
      </Button>
    )
  }
  return (
    <ReplaceScheduleDialog
      write="restore"
      run={async (operationId) =>
        answerOf(
          await restore({
            data: {
              operationId,
              scheduleId: schedule.id,
              replacing: current?.id ?? null,
            },
          }),
        )
      }
      trigger={<Button size="lg" />}
      triggerLabel="Restore this Schedule"
      title="Restore this Schedule?"
      description={
        <>
          <p>
            This Schedule from Option {schedule.sourceOptionNumber} becomes your
            Schedule again, as it was when archived.
          </p>
          {current && (
            <p>
              Your current Schedule, from Option {current.sourceOptionNumber},
              is archived. You can restore it the same way.
            </p>
          )}
          <p>Your Trip note and your own Checklist items stay as they are.</p>
        </>
      }
      action="Restore"
      working="Restoring…"
      failed="Restoring didn’t go through. Try again; it won’t restore twice."
    />
  )
}
