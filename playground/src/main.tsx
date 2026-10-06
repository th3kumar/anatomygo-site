import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthPopup } from './AuthPopup'
import './styles.css'
import './public.css'
// The Google sign-in window returns to ?auth=popup; it only needs to finish signing in, not load the Playground.
const popup = new URLSearchParams(location.search).get('auth') === 'popup'
createRoot(document.getElementById('root')!).render(popup ? <AuthPopup /> : <App />)
