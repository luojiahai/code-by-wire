import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { PrototypeApp } from './prototype/PrototypeApp'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrototypeApp />
  </React.StrictMode>,
)
