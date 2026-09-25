import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getAppBrandName, getAppBrandShortName } from './lib/cloudSync';


document.title = getAppBrandName();
const manifestLink = document.querySelector('link[rel=manifest]') as HTMLLinkElement | null;
if (manifestLink) {
  const manifest = { name: getAppBrandName(), short_name: getAppBrandShortName(), start_url: '/', display: 'standalone', background_color: '#09090b', theme_color: '#09090b', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] };
  manifestLink.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
