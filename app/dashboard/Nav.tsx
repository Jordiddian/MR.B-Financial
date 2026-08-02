'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'

// The sidebar previously rendered every link identically, so there was no way
// to tell which page you were on. Active state is derived from the pathname.

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/leads', label: 'Leads' },
  { href: '/dashboard/posts', label: 'Posts' },
  { href: '/dashboard/performance', label: 'Performance' },
  { href: '/dashboard/approvals', label: 'Approvals' },
  { href: '/dashboard/campaigns', label: 'Campaigns' },
  { href: '/dashboard/experiments', label: 'Experiments' },
  { href: '/dashboard/settings', label: 'Settings' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 p-3 space-y-0.5">
      {NAV.map(({ href, label }) => {
        // Overview is the index route, so it only matches exactly — otherwise
        // it would light up on every nested dashboard page.
        const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href)

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
              active ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
            }`}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="absolute inset-0 bg-gray-800 rounded-lg"
              />
            )}
            <span className="relative z-10">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
