import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { initSpatialNav } from '@repo/ui-tv/spatial-nav-provider';
import { I18nProvider } from './i18n/provider';
import { App } from './App';
import './index.css';

// Initialise D-pad spatial navigation once, before the first render.
initSpatialNav();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// HashRouter keeps routing working when the .wgt is served from the TV
// filesystem (no HTML5 history server).
createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </I18nProvider>
  </StrictMode>,
);
