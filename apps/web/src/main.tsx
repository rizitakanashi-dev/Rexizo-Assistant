import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { theme } from './theme'
import './index.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
