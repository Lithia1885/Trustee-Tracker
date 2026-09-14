import { useCallback, useState } from 'react';
import { SaveError, isSaveError } from '../store/saveError';

const HEADING: Record<SaveError['outcome'], string> = {
  'not-saved': 'Not saved',
  'saved-incomplete': 'Saved — one step left',
  unconfirmed: 'Not sure this was saved',
  'already-saving': 'Already saving',
};

const TONE: Record<SaveError['outcome'], 'error' | 'warn' | 'info'> = {
  'not-saved': 'error',
  'saved-incomplete': 'warn',
  unconfirmed: 'warn',
  'already-saving': 'info',
};

export interface SaveSubmit {
  submitting: boolean;
  /** A structured save problem, when the store reported one. */
  problem: SaveError | null;
  /** A plain message — validation, or an error with no recovery path. */
  message: string | null;
  /**
   * True while a record is known (or suspected) to be in SharePoint and
   * the form must not be submitted again. The way out is Finish saving
   * or Check again, never a second Save.
   */
  blocked: boolean;
  setMessage: (text: string | null) => void;
  clear: () => void;
  /** Runs a save, capturing the outcome. Resolves true when it worked. */
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  /** Retries only the unfinished part. Resolves true when it worked. */
  resume: () => Promise<boolean>;
}

export function useSaveSubmit(): SaveSubmit {
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<SaveError | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const blocked =
    problem !== null &&
    (problem.outcome === 'saved-incomplete' ||
      (problem.outcome === 'unconfirmed' && !problem.resubmitSafe));

  const capture = useCallback((err: unknown) => {
    if (isSaveError(err)) {
      setProblem(err);
      setMessage(null);
    } else {
      setProblem(null);
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const clear = useCallback(() => {
    setProblem(null);
    setMessage(null);
  }, []);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      if (blocked) return false;
      setSubmitting(true);
      setProblem(null);
      setMessage(null);
      try {
        await action();
        return true;
      } catch (err) {
        capture(err);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [blocked, capture],
  );

  const resume = useCallback(async () => {
    const pending = problem?.resume;
    if (!pending) return false;
    setSubmitting(true);
    setMessage(null);
    try {
      await pending();
      setProblem(null);
      return true;
    } catch (err) {
      capture(err);
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [problem, capture]);

  return { submitting, problem, message, blocked, setMessage, clear, run, resume };
}

/**
 * Says what happened to the record in plain words, and offers the one
 * action that actually helps. The distinction it draws — nothing saved
 * versus saved but unfinished versus unknown — is what keeps the same
 * update from being typed into the record twice.
 */
export function SaveNotice({ state }: { state: SaveSubmit }) {
  const { problem, message, submitting, resume } = state;

  if (problem) {
    const tone = TONE[problem.outcome];
    return (
      <div className={`notice notice-${tone}`} role="alert">
        <p className="notice-heading">{HEADING[problem.outcome]}</p>
        <p className="notice-body">{problem.message}</p>
        <p className="notice-body">{problem.recovery}</p>
        {problem.resume && (
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void resume()}
              disabled={submitting}
            >
              {submitting ? 'Working…' : (problem.resumeLabel ?? 'Try again')}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (message) {
    return (
      <p className="form-error" role="alert">
        {message}
      </p>
    );
  }

  return null;
}
