import { useEffect, useState, lazy, Suspense } from 'react'
import { GameApp } from './game/GameApp'
const ResultsPage=lazy(()=>import('./results/ResultsPage').then((m)=>({default:m.ResultsPage})))
const Gallery=lazy(()=>import('./gallery/Gallery').then((m)=>({default:m.Gallery})))

export function Root() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const change = () => setHash(window.location.hash)
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  if (hash.startsWith('#/results')) return <Suspense fallback={<p role="status">Loading results...</p>}><ResultsPage key={hash} debateId={hash.startsWith('#/results/') ? hash.slice('#/results/'.length) : undefined} /></Suspense>
  return hash === '#/gallery' ? <Suspense fallback={<p role="status">Loading gallery...</p>}><Gallery /></Suspense> : <GameApp />
}
