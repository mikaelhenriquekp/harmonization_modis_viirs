import { Link } from 'react-router'

import { Mascot } from '@/components/mascot'

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
      <Mascot mood="curious" label="The mascot looks lost" className="w-40" />
      <h1 className="text-2xl font-semibold">This page is not on the map</h1>
      <Link
        to="/"
        className="bg-saffron text-on-accent rounded-full px-5 py-2.5 text-sm font-semibold hover:brightness-110"
      >
        Back to the globe
      </Link>
    </div>
  )
}
