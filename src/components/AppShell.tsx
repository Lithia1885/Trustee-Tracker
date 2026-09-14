import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicClientApplication } from '@azure/msal-browser';
import { initializeMsal, loginRequest } from '../auth/msal';
import { loadEnv, type AppEnv } from '../env';
import { useHashRoute, type Route } from '../routing/hashRoute';
import { useStore } from '../store/useStore';
import {
  actionsHref,
  decisionsHref,
  helpHref,
  itemsHref,
  meetingsHref,
} from '../routing/hashRoute';
import { ActionsDashboard } from './ActionsDashboard';
import { AgendaView } from './AgendaView';
import { DecisionLog } from './DecisionLog';
import { HelpView } from './HelpView';
import { ItemDetail } from './ItemDetail';
import { ItemForm } from './ItemForm';
import { ItemsList } from './ItemsList';
import { MeetingDetail } from './MeetingDetail';
import { MeetingsList } from './MeetingsList';

type Phase = 'boot' | 'config-error' | 'signed-out' | 'authenticating' | 'ready';

const AGENDA_HREF = '#';

// The church's own wordmark, served from this origin.
const CHURCH_LOGO = '/brand/lsmc-logo-ink.svg';

interface NavItem {
  href: string;
  label: string;
  glyph: string;
  matches: (r: Route) => boolean;
}

const NAV: NavItem[] = [
  {
    href: AGENDA_HREF,
    label: 'Agenda',
    glyph: '☰',
    matches: (r) => r.view === 'agenda',
  },
  {
    href: meetingsHref,
    label: 'Meetings',
    glyph: '◧',
    matches: (r) => r.view === 'meetings' || r.view === 'meeting',
  },
  {
    href: actionsHref,
    label: 'Actions',
    glyph: '✓',
    matches: (r) => r.view === 'actions',
  },
  {
    href: itemsHref,
    label: 'Items',
    glyph: '⊞',
    matches: (r) =>
      r.view === 'items' || r.view === 'item' || r.view === 'newItem' || r.view === 'editItem',
  },
  {
    href: decisionsHref,
    label: 'Decisions',
    glyph: '§',
    matches: (r) => r.view === 'decisions',
  },
];

export function AppShell() {
  const envResult = useMemo(() => loadEnv(), []);
  const [phase, setPhase] = useState<Phase>('boot');
  const [msal, setMsal] = useState<PublicClientApplication | null>(null);
  const [msalError, setMsalError] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);

  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const hydrate = useStore((s) => s.hydrate);
  const setConfigError = useStore((s) => s.setConfigError);
  const route = useHashRoute();

  useEffect(() => {
    let cancelled = false;
    if (!envResult.env) {
      setConfigError(envResult.missing);
      setPhase('config-error');
      return;
    }
    (async () => {
      try {
        const instance = await initializeMsal(envResult.env as AppEnv);
        if (cancelled) return;
        setMsal(instance);
        const active = instance.getActiveAccount();
        setAccount(active?.username ?? null);
        setPhase(active ? 'ready' : 'signed-out');
      } catch (err) {
        if (cancelled) return;
        setMsalError(err instanceof Error ? err.message : String(err));
        setPhase('signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envResult, setConfigError]);

  useEffect(() => {
    if (phase !== 'ready' || !msal || !envResult.env) return;
    if (status !== 'idle' && status !== 'error') return;
    void hydrate(msal, envResult.env);
  }, [phase, msal, envResult.env, status, hydrate]);

  const signIn = useCallback(async () => {
    if (!msal) return;
    setPhase('authenticating');
    try {
      await msal.loginRedirect(loginRequest);
    } catch (err) {
      setMsalError(err instanceof Error ? err.message : String(err));
      setPhase('signed-out');
    }
  }, [msal]);

  const signOut = useCallback(async () => {
    if (!msal) return;
    await msal.logoutRedirect();
  }, [msal]);

  const retry = useCallback(() => {
    if (!msal || !envResult.env) return;
    void hydrate(msal, envResult.env);
  }, [msal, envResult.env, hydrate]);

  if (phase === 'boot') {
    return <Centered>Starting…</Centered>;
  }

  if (phase === 'config-error') {
    return (
      <Centered>
        <h1>This copy of the app is not configured yet</h1>
        <p className="signin-lede">
          These settings are missing, so there is nothing to connect to:
        </p>
        <ul>
          {envResult.missing.map((m) => (
            <li key={m}>
              <code>{m}</code>
            </li>
          ))}
        </ul>
        <p className="signin-lede">
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in the
          values, and start the app again.
        </p>
      </Centered>
    );
  }

  if (phase === 'signed-out' || phase === 'authenticating') {
    return (
      <Centered>
        <img
          src={CHURCH_LOGO}
          alt="Lithia Springs Methodist Church"
          className="signin-mark"
        />
        <h1>Trustee Tracker</h1>
        <p className="signin-lede">
          The Board of Trustees' record of projects, meetings and decisions.
          Sign in with your church Microsoft 365 account.
        </p>
        {msalError && <p className="form-error">{msalError}</p>}
        <button
          onClick={signIn}
          disabled={phase === 'authenticating' || !msal}
          className="btn btn-primary"
        >
          {phase === 'authenticating' ? 'Signing in…' : 'Sign in'}
        </button>
      </Centered>
    );
  }

  return (
    <div className="shell">
      <UtilityStrip account={account} onSignOut={signOut} />
      <DesktopNav route={route} />
      {status === 'loading' || status === 'idle' ? (
        <Centered>Loading the board's records…</Centered>
      ) : status === 'error' && error ? (
        <Centered>
          <h1>
            {error.kind === 'unprovisioned'
              ? 'A SharePoint list is missing'
              : "We couldn't load the board's records"}
          </h1>
          <p className="form-error">{error.message}</p>
          <p className="signin-lede">
            {error.kind === 'unprovisioned'
              ? 'Provision the list in SharePoint, then try again.'
              : 'This is usually the connection or an expired sign-in. Try again, and sign out and back in if it keeps failing.'}
          </p>
          <button onClick={retry} className="btn btn-primary">
            Try again
          </button>
        </Centered>
      ) : route.view === 'item' ? (
        <ItemDetail itemId={route.itemId} />
      ) : route.view === 'newItem' ? (
        <ItemForm mode="create" />
      ) : route.view === 'editItem' ? (
        <ItemForm mode="edit" itemId={route.itemId} />
      ) : route.view === 'meetings' ? (
        <MeetingsList />
      ) : route.view === 'meeting' ? (
        <MeetingDetail meetingId={route.meetingId} />
      ) : route.view === 'actions' ? (
        <ActionsDashboard />
      ) : route.view === 'items' ? (
        <ItemsList />
      ) : route.view === 'decisions' ? (
        <DecisionLog />
      ) : route.view === 'help' ? (
        <HelpView />
      ) : (
        <AgendaView />
      )}
      <MobileTabs route={route} />
    </div>
  );
}

function UtilityStrip({
  account,
  onSignOut,
}: {
  account: string | null;
  onSignOut: () => void;
}) {
  return (
    <div className="utility-strip">
      <span className="account" title={account ?? ''}>{account ?? 'Signed in'}</span>
      <a href={helpHref} className="link" aria-label="Help and tips">
        Help
      </a>
      <button onClick={onSignOut} className="link">
        Sign out
      </button>
    </div>
  );
}

function DesktopNav({ route }: { route: Route }) {
  return (
    <nav className="nav-desktop">
      <a href={AGENDA_HREF} className="brand">
        <img
          src={CHURCH_LOGO}
          alt="Lithia Springs Methodist Church"
          className="brand-mark"
        />
        Trustee Tracker
      </a>
      {NAV.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={item.matches(route) ? 'active' : ''}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function MobileTabs({ route }: { route: Route }) {
  return (
    <nav className="nav-tabs">
      {NAV.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={item.matches(route) ? 'active' : ''}
        >
          <span className="tab-glyph">{item.glyph}</span>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="centered">{children}</div>;
}
