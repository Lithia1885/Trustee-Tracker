import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './components/AppShell';
import { UpdateBar } from './components/UpdateBar';
import { registerServiceWorker } from './pwa/registerSW';
import './styles.css';

// Before the UI mounts, and outside the auth gate on purpose: a copy
// sitting on the sign-in screen is the one most likely to be stale, and
// it has to be able to hear about a new build too.
registerServiceWorker();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <UpdateBar />
    <AppShell />
  </StrictMode>,
);
