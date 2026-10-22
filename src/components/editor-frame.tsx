import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'

import {
  EditingPausedNote,
  NotSavedAlert,
  RetryOrDismiss,
  SavedStatus,
} from '@/components/not-saved-alert'
import { Button } from '@/components/ui/button'
import { SaveState } from '@/trip/client/drafts'

/** An editor's words for Save, for Save while saving, and for once saved. */
export interface SaveVerb {
  readonly submit: string
  readonly submitting: string
  readonly done: string
}

export const saveVerb: SaveVerb = {
  submit: 'Save',
  submitting: 'Saving…',
  done: 'Saved',
}

/** The verb of an editor that adds something new, such as an Activity. */
export const addVerb: SaveVerb = {
  submit: 'Add',
  submitting: 'Adding…',
  done: 'Added',
}

/**
 * When an editor's form shows.
 *
 * - untilSaved: from Edit until the value is saved, when the summary shows it.
 * - untilShown: from Edit until the read that shows what was saved, for an
 *   editor that adds something shown elsewhere, such as a new Activity.
 * - always: the form never closes, as for adding an own Checklist item.
 */
export type FormShown = 'untilSaved' | 'untilShown' | 'always'

/** What the frame reads of a field from the save hook. */
interface FramedField<V> {
  readonly state: SaveState<V>
  /** An open edit the Schedule shown no longer offers, as useSave says. */
  readonly withdrawn?: boolean
  /** Offline, as useSave says: nothing can be sent. */
  readonly paused: boolean
}

interface FramedEditor<V> extends FramedField<V> {
  readonly discard: () => void
  readonly save: () => Promise<void>
}

/**
 * Which view of an editor shows: its saved summary, its open form, or an
 * open edit the Schedule withdrew.
 */
type EditorView = 'summary' | 'form' | 'withdrawn'

/**
 * How the editor frame shows a field from the save hook. Editors that only
 * need its decisions, such as a one-shot send's busy, read them here.
 *
 * - The summary shows a Clean value, and a Saved one unless the form stays
 *   until the read shows it. It is marked just saved after a save.
 * - The form shows a value being edited, on its way, or not saved, with why.
 * - A value is busy while it is on its way, and while Saved if its form
 *   still shows it, so an add can't be sent twice. Once the summary shows
 *   it, it can be edited again, even if the read that confirms it fails.
 * - Offline, editing is paused: an open form keeps its value, but only
 *   Cancel and Discard still work. A value busy or paused is locked: no
 *   control may open, change or send it.
 * - A Clean value has nothing to discard.
 * - Opening the form focuses it; a restored Draft opens unfocused.
 */
export const frameOf = <V,>(
  field: FramedField<V>,
  {
    verb = saveVerb,
    form = 'untilSaved',
  }: { readonly verb?: SaveVerb; readonly form?: FormShown } = {},
) => {
  const { state } = field
  const notSaved = SaveState.$is('NotSaved')(state)
  const saving = SaveState.$is('Saving')(state)
  const saved = SaveState.$is('Saved')(state)
  const clean = SaveState.$is('Clean')(state)
  const problem = notSaved ? state.problem : undefined

  const summaryShown =
    form === 'always' ? false : clean || (saved && form === 'untilSaved')

  const busy = saving || (saved && !summaryShown)

  const view: EditorView = field.withdrawn
    ? 'withdrawn'
    : summaryShown
      ? 'summary'
      : 'form'

  return {
    view,
    justSaved: saved || (clean && state.justSaved),
    busy,
    paused: field.paused,
    locked: busy || field.paused,
    submitLabel: saving ? verb.submitting : notSaved ? 'Retry' : verb.submit,
    discardLabel: clean ? undefined : notSaved ? 'Discard' : 'Cancel',
    autoFocus: SaveState.$is('Editing')(state),
    problem,
  }
}

/** The frame's decisions, as frameOf makes them, with the alert's id. */
export const useEditorFrame = <V,>(
  field: FramedField<V>,
  options?: Parameters<typeof frameOf<V>>[1],
) => {
  const problemId = useId()
  const frame = frameOf(field, options)

  return {
    ...frame,
    problemId,
    /** The "not saved" alert's id while it shows, for an input's aria-describedby. */
    describedBy: frame.problem === undefined ? undefined : problemId,
    /** `hintId`, then the "not saved" alert's id while it shows. */
    describedWith: (hintId: string) =>
      frame.problem === undefined ? hintId : `${hintId} ${problemId}`,
  }
}

export type EditorFrameView = ReturnType<typeof useEditorFrame>

/**
 * A one-shot send, such as a Tick or moving an Activity, that wasn't saved:
 * why, with Retry and Dismiss. Otherwise it shows nothing.
 */
export function SendNotSaved<V>({ field }: { field: FramedEditor<V> }) {
  const { problem, paused } = frameOf(field)

  return (
    problem !== undefined && (
      <NotSavedAlert problem={problem}>
        <RetryOrDismiss
          paused={paused}
          onRetry={() => void field.save()}
          onDismiss={field.discard}
        />
      </NotSavedAlert>
    )
  )
}

/** A button on the summary that opens the form, such as Edit. */
export interface EditAction {
  readonly label: string
  readonly icon: LucideIcon
  readonly onClick: () => void
  readonly disabled?: boolean
}

/**
 * The editor's summary: either its saved value with its Edit buttons, or, for
 * an editor that lays out its own, the whole view, given the frame.
 */
type Summary =
  | {
      readonly summary?: ReactNode
      /** The summary's buttons, each opening the form. */
      readonly edits: ReadonlyArray<EditAction>
    }
  | { readonly summaryView: (frame: EditorFrameView) => ReactNode }

/**
 * One editor of a value saved under the save pattern. It shows the saved
 * summary, the open form, or the withdrawn view.
 *
 * The editor supplies the summary, its verb, and the form's inputs, which it
 * renders from the frame's view. The frame owns the labels, the "not saved"
 * alert and the autofocus rule.
 */
export function EditorFrame<V>({
  field,
  labelledBy,
  verb = saveVerb,
  form = 'untilSaved',
  withdrawnReason,
  hintId,
  buttonSize = 'default',
  actions,
  ready = true,
  nameForm = true,
  formless = false,
  children,
  ...shown
}: {
  field: FramedEditor<V>
  /** The heading the editor is under. */
  labelledBy: string
  verb?: SaveVerb
  form?: FormShown
  withdrawnReason?: string
  /** The id of a hint in the form that describes it as a whole. */
  hintId?: string
  buttonSize?: 'default' | 'sm'
  /** Shown after Save and Cancel. */
  actions?: (frame: EditorFrameView) => ReactNode
  /**
   * Whether the value can be sent, such as an Activity once it has a title,
   * or a Stay edit once a date still offered is chosen.
   */
  ready?: boolean
  /**
   * Whether the heading names the form. Pass false when the heading already
   * names the editor's only input, so screen readers don't read it twice.
   */
  nameForm?: boolean
  /**
   * Shows the form as a group, with Save as a plain button, for an editor
   * with a form of its own inside, such as the Pin's Find.
   */
  formless?: boolean
  children: (frame: EditorFrameView) => ReactNode
} & (Summary | { readonly form: 'always' })) {
  const frame = useEditorFrame(field, { verb, form })

  if (frame.view === 'summary') {
    if ('summaryView' in shown) return shown.summaryView(frame)

    if (!('edits' in shown)) return null

    return (
      <div className="flex flex-col items-start gap-3">
        {shown.summary}
        <div className="flex flex-wrap items-center gap-3">
          {shown.edits.map(({ label, icon: Icon, onClick, disabled }) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              aria-describedby={labelledBy}
              disabled={disabled || frame.locked}
              onClick={onClick}
            >
              <Icon data-icon="inline-start" aria-hidden />
              {label}
            </Button>
          ))}
          <SavedStatus saved={frame.justSaved}>{verb.done}</SavedStatus>
        </div>
      </div>
    )
  }

  if (frame.view === 'withdrawn') {
    return (
      <div
        role="group"
        aria-labelledby={labelledBy}
        className="flex flex-col items-start gap-3"
      >
        {frame.problem !== undefined && (
          <NotSavedAlert problem={frame.problem} />
        )}
        {withdrawnReason !== undefined && (
          <p className="text-sm text-muted-foreground">{withdrawnReason}</p>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={field.discard}>
          {frame.discardLabel}
        </Button>
      </div>
    )
  }

  const content = (
    <>
      {frame.problem !== undefined && (
        <NotSavedAlert problem={frame.problem} problemId={frame.problemId} />
      )}
      {children(frame)}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type={formless ? 'button' : 'submit'}
          size={buttonSize}
          disabled={frame.locked || !ready}
          onClick={formless ? () => void field.save() : undefined}
        >
          {frame.submitLabel}
        </Button>
        {frame.discardLabel !== undefined && (
          <Button
            type="button"
            size={buttonSize}
            variant="ghost"
            disabled={frame.busy}
            onClick={field.discard}
          >
            {frame.discardLabel}
          </Button>
        )}
        {actions?.(frame)}
        {form !== 'untilSaved' && (
          <SavedStatus saved={frame.justSaved}>{verb.done}</SavedStatus>
        )}
      </div>
      {frame.paused && <EditingPausedNote />}
    </>
  )

  if (formless) {
    return (
      <div
        role="group"
        aria-labelledby={labelledBy}
        aria-describedby={hintId}
        className="flex flex-col gap-3"
      >
        {content}
      </div>
    )
  }

  return (
    <form
      aria-labelledby={nameForm ? labelledBy : undefined}
      aria-describedby={hintId}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void field.save()
      }}
    >
      {content}
    </form>
  )
}
