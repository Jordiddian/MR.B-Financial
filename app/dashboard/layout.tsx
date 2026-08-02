import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BudgetProposalBanner from './BudgetProposalBanner'
import Nav from './Nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside className="w-56 flex-shrink-0 border-r border-gray-800 flex flex-col sticky top-0 h-screen">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded text-gray-950 text-xs font-bold flex items-center justify-center leading-tight">MR<br/>B</div>
            <div className="min-w-0">
              <div className="text-white text-sm font-semibold">Ad Manager</div>
              <div className="text-gray-500 text-xs">Internal portal</div>
            </div>
          </div>
        </div>

        <Nav />

        <div className="p-4 border-t border-gray-800">
          <p className="text-gray-600 text-xs truncate" title={user.email}>{user.email}</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <BudgetProposalBanner />
        {children}
      </main>
    </div>
  )
}
