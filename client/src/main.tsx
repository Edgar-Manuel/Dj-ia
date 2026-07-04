import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { buildDemoLibrary } from './lib/demoLibrary';
import { api } from './lib/api';
import { useDJStore } from './state/store';

// Bootstrap: demo crate immediately, server library + engine status async.
useDJStore.setState({ library: buildDemoLibrary() });

void (async () => {
  const [serverTracks, status] = await Promise.all([api.listLibrary(), api.aiStatus()]);
  if (serverTracks && serverTracks.length > 0) {
    const { library } = useDJStore.getState();
    const known = new Set(library.map((t) => t.id));
    useDJStore.setState({
      library: [...library, ...serverTracks.filter((t) => !known.has(t.id))],
    });
  }
  useDJStore.setState({ serverEngine: status?.engine ?? null });
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
