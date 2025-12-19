import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Lock orientation to portrait
function lockOrientation() {
  // Try Screen Orientation API first
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(() => {
      // Lock failed, fall back to viewport detection
      checkViewportOrientation();
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
  } else {
    // Fall back to viewport detection
    checkViewportOrientation();
  }
}

// Check viewport size and show message if landscape
function checkViewportOrientation() {
  const checkOrientation = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Calculate aspect ratio - landscape is when width/height > 1.3 (more strict threshold)
    // This ensures we only trigger on actual landscape orientation, not just wide screens
    const aspectRatio = width / height;
    const isLandscape = aspectRatio > 1.3;
    
    if (isLandscape) {
      // Landscape detected
      document.body.classList.add('landscape-mode');
    } else {
      document.body.classList.remove('landscape-mode');
    }
  };
  
  // Wait for DOM to be ready
  if (document.body) {
    checkOrientation();
  } else {
    document.addEventListener('DOMContentLoaded', checkOrientation);
  }
  
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
}

lockOrientation();

// Wait for DOM to be ready before checking viewport
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkViewportOrientation);
} else {
  // DOM is already ready
  setTimeout(checkViewportOrientation, 0);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)