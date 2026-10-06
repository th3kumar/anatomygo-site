import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthPopup } from './AuthPopup'
import { startPlaygroundAnalytics } from './telemetry'
import './styles.css'
import './public.css'
// The Google sign-in window returns to ?auth=popup; it only needs to finish signing in, not load the Playground
// (and its address holds a sign-in code, so it is never reported).
const popup = new URLSearchParams(location.search).get('auth') === 'popup'
if (!popup) startPlaygroundAnalytics()
createRoot(document.getElementById('root')!).render(popup ? <AuthPopup /> : <App />)
