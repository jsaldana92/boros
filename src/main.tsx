import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initialScreen } from './app/navigation-preference'

const screen = initialScreen(window)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialScreen={screen} />
  </StrictMode>,
)
