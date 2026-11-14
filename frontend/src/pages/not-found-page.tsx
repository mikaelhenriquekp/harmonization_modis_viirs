import { Link } from 'react-router'

import { Mascot } from '@/components/mascot'

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
      <Mascot mood="curious" label="The mascot looks lost" className="w-40" />
      <h1 className="text-2xl font-semibold">This page is not on the map</h1>
      <Link to="/" className="bg-gold rounded-full px-4 py-2 text-sm font-medium text-[#03133f]">
        Back to exploring
      </Link>
    </div>
  )
}
