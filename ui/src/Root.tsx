import { useEffect, useState } from 'react'
import App from './App'
import { Gallery } from './gallery/Gallery'

export function Root() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const change = () => setHash(window.location.hash)
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  return hash === '#/gallery' ? <Gallery /> : <App />
}
