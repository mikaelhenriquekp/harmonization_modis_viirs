import { createBrowserRouter } from 'react-router'

import { AppShell } from '@/components/app-shell'
import { AboutPage } from '@/pages/about-page'
import { ExplorePage } from '@/pages/explore-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { ValidationPage } from '@/pages/validation-page'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <ExplorePage /> },
      { path: '/validation', element: <ValidationPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
