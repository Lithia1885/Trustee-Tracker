import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isStaleChunkError } from '../pwa/chunkError';
import { reloadToCurrentBuild } from '../pwa/registerSW';

interface Props {
  children: ReactNode;
  /** Re-render the subtree. Used by the retry path, which re-imports. */
  onRetry?: () => void;
}

interface State {
  error: unknown;
  attempt: number;
}

/**
 * The floor under anything loaded on demand.
 *
 * Distinguishes "this tab predates the last update", where re-importing
 * a URL that no longer exists can never work and the way out is a
 * reload, from "the connection dropped", where a retry re-imports
 * without losing the page. Both get a button. An instruction with no
 * button is a chore.
 */
export class LazyBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Keep the stack somewhere a person can find it; the screen below
    // deliberately does not show it.
    console.error('Trustee Tracker: view failed to load', error, info.componentStack);
  }

  private retry = () => {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
    this.props.onRetry?.();
  };

  render(): ReactNode {
    const { error, attempt } = this.state;
    if (!error) return <div key={attempt}>{this.props.children}</div>;

    const stale = isStaleChunkError(error);
    return (
      <div className="lazy-fallback" role="alert">
        <h2>{stale ? 'This page is running an older version' : "That part didn't load"}</h2>
        <p>
          {stale
            ? 'The app was updated while this tab was open, so the piece it just reached for is no longer there. Reloading picks up the current version.'
            : 'The download did not finish. This is usually the connection rather than the app.'}
        </p>
        {stale ? (
          <button type="button" className="btn-primary" onClick={reloadToCurrentBuild}>
            Reload
          </button>
        ) : (
          <span className="lazy-fallback-actions">
            <button type="button" className="btn-primary" onClick={this.retry}>
              Try again
            </button>
            <button type="button" className="btn-quiet" onClick={reloadToCurrentBuild}>
              Reload the app
            </button>
          </span>
        )}
      </div>
    );
  }
}
