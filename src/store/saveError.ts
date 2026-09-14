import { GraphError } from '../graph/client';

/**
 * What we can honestly say about a save that did not run to completion.
 *
 * The distinction matters because the wrong recovery makes duplicates:
 * telling someone "that failed" when the record actually reached
 * SharePoint invites them to type it again.
 */
export type SaveOutcome =
  /** SharePoint rejected the write. Nothing was stored; safe to try again. */
  | 'not-saved'
  /** The record was stored, but follow-up work did not finish. */
  | 'saved-incomplete'
  /** We could not reach SharePoint to find out. Check before re-entering. */
  | 'unconfirmed'
  /** An identical save is already running; this one was ignored. */
  | 'already-saving';

export interface SaveErrorInit {
  outcome: SaveOutcome;
  /** Plain-language statement of what happened to the record. */
  message: string;
  /** Plain-language statement of what to do about it. */
  recovery: string;
  /** SharePoint ID of the record, once we know it was stored. */
  recordId?: string;
  /** Finishes (or re-checks) only the work that did not complete. */
  resume?: () => Promise<void>;
  /** Label for the resume button. */
  resumeLabel?: string;
  /**
   * May the same submission be sent again without risking a duplicate?
   * True by default only when nothing was stored; set it explicitly for
   * repeatable writes such as an edit, where a repeat is harmless even
   * though the outcome is unknown.
   */
  resubmitSafe?: boolean;
  cause?: unknown;
}

export class SaveError extends Error {
  readonly outcome: SaveOutcome;
  readonly recovery: string;
  readonly recordId?: string;
  readonly resume?: () => Promise<void>;
  readonly resumeLabel?: string;
  readonly resubmitSafe: boolean;

  constructor(init: SaveErrorInit) {
    super(init.message);
    this.name = 'SaveError';
    this.outcome = init.outcome;
    this.recovery = init.recovery;
    this.recordId = init.recordId;
    this.resume = init.resume;
    this.resumeLabel = init.resumeLabel;
    this.resubmitSafe = init.resubmitSafe ?? init.outcome === 'not-saved';
    if (init.cause !== undefined) this.cause = init.cause;
  }
}

export function isSaveError(err: unknown): err is SaveError {
  return err instanceof SaveError;
}

/**
 * Did SharePoint definitely refuse this write?
 *
 * A 4xx is the server saying "no" after reading the request, so nothing
 * was stored. A timeout, a rate limit, a 5xx or a dropped connection
 * says nothing either way — the write may well have landed.
 */
export function isDefiniteRejection(err: unknown): boolean {
  if (!(err instanceof GraphError)) return false;
  if (err.status === 408 || err.status === 429) return false;
  return err.status >= 400 && err.status < 500;
}

export function describeCause(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  const s = String(err);
  return s === '[object Object]' ? 'Unknown error' : s;
}
