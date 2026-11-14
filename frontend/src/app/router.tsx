import { createBrowserRouter } from 'react-router'

import { AppShell } from '@/components/app-shell'
import { AboutPage } from '@/pages/about-page'
import { AnalysisPage } from '@/pages/analysis-page'
import { ComparePage } from '@/pages/compare-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { GlobePage } from '@/pages/globe-page'
import { MethodPage } from '@/pages/method-page'
import { NotFoundPage } from '@/pages/not-found-page'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/globe', element: <GlobePage /> },
      { path: '/compare', element: <ComparePage /> },
      { path: '/analysis', element: <AnalysisPage /> },
      { path: '/method', element: <MethodPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
