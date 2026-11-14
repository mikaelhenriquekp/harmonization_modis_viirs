import { createBrowserRouter, Navigate } from 'react-router'

import { AppShell } from '@/components/app-shell'
import { AboutPage } from '@/pages/about-page'
import { AnalysisPage } from '@/pages/analysis-page'
import { AtlasPage } from '@/pages/atlas-page'
import { MethodPage } from '@/pages/method-page'
import { NotFoundPage } from '@/pages/not-found-page'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <AtlasPage /> },
      {
        path: '/compare',
        lazy: () => import('@/pages/compare-page').then((m) => ({ Component: m.ComparePage })),
      },
      { path: '/globe', element: <Navigate to="/" replace /> },
      { path: '/analysis', element: <AnalysisPage /> },
      {
        path: '/ask',
        lazy: () => import('@/pages/ask-page').then((m) => ({ Component: m.AskPage })),
      },
      { path: '/method', element: <MethodPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
