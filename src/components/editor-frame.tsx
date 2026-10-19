import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'

import { NotSavedAlert, SavedStatus } from '@/components/not-saved-alert'
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

/** What the frame reads of a field from the save hook. */
interface FramedField<V> {
  readonly state: SaveState<V>
  /** An open edit the Schedule shown no longer offers, as useOfferedSave says. */
  readonly withdrawn?: boolean
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
 * How the editor frame shows a field from the save hook.
 *
 * - The summary shows a Clean or Saved value, marked just saved after a save.
 * - The form shows a value being edited, on its way, or not saved, with why.
 * - The form is busy while the value is on its way, so it can't change.
 * - Opening the form focuses it; a restored Draft opens unfocused.
 */
export const useEditorFrame = <V,>(
  field: FramedField<V>,
  verb: SaveVerb = saveVerb,
) => {
  const problemId = useId()
  const { state } = field
  const notSaved = SaveState.$is('NotSaved')(state)
  const saving = SaveState.$is('Saving')(state)
  const saved = SaveState.$is('Saved')(state)
  const clean = SaveState.$is('Clean')(state)
  const problem = notSaved ? state.problem : undefined

  const view: EditorView = field.withdrawn
    ? 'withdrawn'
    : clean || saved
      ? 'summary'
      : 'form'

  return {
    view,
    justSaved: saved || (clean && state.justSaved),
    busy: saving,
    submitLabel: saving ? verb.submitting : notSaved ? 'Retry' : verb.submit,
    discardLabel: notSaved ? 'Discard' : 'Cancel',
    autoFocus: SaveState.$is('Editing')(state),
    problem,
    problemId,
    /** The "not saved" alert's id while it shows, for an input's aria-describedby. */
    describedBy: problem === undefined ? undefined : problemId,
    /** `hintId`, then the "not saved" alert's id while it shows. */
    describedWith: (hintId: string) =>
      problem === undefined ? hintId : `${hintId} ${problemId}`,
  }
}

export type EditorFrameView = ReturnType<typeof useEditorFrame>

/** A button on the summary that opens the form, such as Edit. */
export interface EditAction {
  readonly label: string
  readonly icon: LucideIcon
  readonly onClick: () => void
  readonly disabled?: boolean
}

/**
 * One editor of a value saved under the save pattern. It shows the saved
 * summary with its Edit buttons, the open form, or the withdrawn view.
 *
 * The editor supplies the summary, its verb, and the form's inputs, which it
 * renders from the frame's view. The frame owns the labels, the "not saved"
 * alert and the autofocus rule.
 */
export function EditorFrame<V>({
  field,
  labelledBy,
  verb = saveVerb,
  summary,
  edits,
  withdrawnReason,
  hintId,
  canSave = true,
  buttonSize = 'default',
  actions,
  nameForm = true,
  children,
}: {
  field: FramedEditor<V>
  /** The heading the editor is under. */
  labelledBy: string
  verb?: SaveVerb
  summary?: ReactNode
  /** The summary's buttons, each opening the form. */
  edits: ReadonlyArray<EditAction>
  withdrawnReason?: string
  /** The id of a hint in the form that describes it as a whole. */
  hintId?: string
  /** Whether Save is offered, such as once a date still offered is chosen. */
  canSave?: boolean
  buttonSize?: 'default' | 'sm'
  /** Shown after Save and Cancel. */
  actions?: ReactNode
  /**
   * Whether the heading names the form. Pass false when the heading already
   * names the editor's only input, so screen readers don't read it twice.
   */
  nameForm?: boolean
  children: (frame: EditorFrameView) => ReactNode
}) {
  const frame = useEditorFrame(field, verb)

  if (frame.view === 'summary') {
    return (
      <div className="flex flex-col items-start gap-3">
        {summary}
        <div className="flex flex-wrap items-center gap-3">
          {edits.map(({ label, icon: Icon, onClick, disabled }) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              aria-describedby={labelledBy}
              disabled={disabled}
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
      {frame.problem !== undefined && (
        <NotSavedAlert problem={frame.problem} problemId={frame.problemId} />
      )}
      {children(frame)}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size={buttonSize}
          disabled={frame.busy || !canSave}
        >
          {frame.submitLabel}
        </Button>
        <Button
          type="button"
          size={buttonSize}
          variant="ghost"
          disabled={frame.busy}
          onClick={field.discard}
        >
          {frame.discardLabel}
        </Button>
        {actions}
      </div>
    </form>
  )
}
