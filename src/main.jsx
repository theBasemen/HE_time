import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Lock orientation to portrait
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('portrait').catch(() => {
    // Lock failed, orientation API might not be supported
    console.log('Orientation lock not supported');
  });
} else if (screen.lockOrientation) {
  // Legacy API
  screen.lockOrientation('portrait');
} else if (screen.mozLockOrientation) {
  // Firefox
  screen.mozLockOrientation('portrait');
} else if (screen.msLockOrientation) {
  // IE/Edge
  screen.msLockOrientation('portrait');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)