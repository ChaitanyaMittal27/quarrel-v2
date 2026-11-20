import { useEffect, useState } from 'react'
import { GameApp } from './game/GameApp'
import { ResultsPage } from './results/ResultsPage'
import { Gallery } from './gallery/Gallery'

export function Root() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const change = () => setHash(window.location.hash)
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  if (hash.startsWith('#/results')) return <ResultsPage key={hash} debateId={hash.startsWith('#/results/') ? hash.slice('#/results/'.length) : undefined} />
  return hash === '#/gallery' ? <Gallery /> : <GameApp />
}
