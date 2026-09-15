import { useEffect, useState } from 'react';
import { reloadToCurrentBuild, subscribeToUpdates } from '../pwa/registerSW';

/**
 * The standing offer of a newer build.
 *
 * A bar, not a toast, and it does not time out. Something that fades
 * after four seconds is how a trustee spends a month on last month's
 * build. It is dismissable, because nobody should be nagged in the
 * middle of writing up a meeting — and dismissing only hides it: the
 * update still applies on its own the next time the app is fully
 * closed and opened.
 */
export function UpdateBar() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => subscribeToUpdates((s) => setReady(s.ready)), []);

  if (!ready || hidden) return null;

  return (
    <div className="update-bar" role="status" aria-live="polite">
      <span className="update-bar-text">A newer version of Trustee Tracker is ready.</span>
      <span className="update-bar-actions">
        <button type="button" className="btn-primary" onClick={reloadToCurrentBuild}>
          Reload now
        </button>
        <button
          type="button"
          className="btn-quiet"
          title="Hides this. The update still applies on its own the next time you close the app completely and open it again."
          onClick={() => setHidden(true)}
        >
          Later
        </button>
      </span>
    </div>
  );
}
