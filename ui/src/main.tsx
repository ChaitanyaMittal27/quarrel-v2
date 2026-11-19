import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/pixelify-sans'
import '@fontsource-variable/dm-sans'
import './themes/tokens.css'
import './themes/motion.css'
import { Root } from './Root'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
