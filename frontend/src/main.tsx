import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Browser quirk: layout inside ResizeObserver can throw; harmless but noisy in Vite dev overlay.
window.addEventListener(
  'error',
  (event) => {
    if (event.message?.includes('ResizeObserver loop')) {
      event.stopImmediatePropagation()
    }
  },
  true
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
