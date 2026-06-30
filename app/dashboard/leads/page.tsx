import { createClient } from '@/lib/supabase/server'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, phone, interests, source, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  const count = leads?.length ?? 0

  return (
    <div className="p-8">
      <h1 className="text-white text-2xl font-semibold mb-1">Leads</h1>
      <p className="text-gray-400 text-sm mb-8">
        {count} total — everyone who submitted the quote form
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-gray-400 font-medium px-5 py-3">Name</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">Phone</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">Interested in</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {count === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                  No leads yet. They&apos;ll appear here once the form is live.
                </td>
              </tr>
            ) : (
              leads!.map((lead, i) => (
                <tr
                  key={lead.id}
                  className={i < count - 1 ? 'border-b border-gray-800' : ''}
                >
                  <td className="px-5 py-3 text-white font-medium">{lead.name}</td>
                  <td className="px-5 py-3 text-gray-300">
                    <a
                      href={`tel:${lead.phone.replace(/\D/g, '')}`}
                      className="hover:text-blue-400 transition-colors"
                    >
                      {lead.phone}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-gray-300">{lead.interests || '—'}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
