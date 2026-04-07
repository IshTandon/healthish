import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import App from './App.jsx'

// Vercel Analytics
inject()

// OneSignal SDK
const script = document.createElement('script')
script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
script.defer = true
document.head.appendChild(script)

// Antigravity storage shim
if (!window.storage) {
  window.storage = null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
