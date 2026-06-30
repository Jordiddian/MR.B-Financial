export default function OverviewPage() {
  return (
    <div className="p-8">
      <h1 className="text-white text-2xl font-semibold mb-1">Overview</h1>
      <p className="text-gray-400 text-sm mb-8">Monthly summary and budget status</p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {[
          { label: 'Monthly ad budget', value: '—', sub: 'not set' },
          { label: 'Spent this month', value: '$0.00', sub: 'ads + API costs' },
          { label: 'Leads this month', value: '—', sub: 'from all sources' },
          { label: 'Cost per lead', value: '—', sub: 'avg this month' },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-sm mb-1">{card.label}</p>
            <p className="text-white text-3xl font-semibold">{card.value}</p>
            <p className="text-gray-500 text-xs mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-gray-400 text-sm mb-4">Budget breakdown</p>
        <p className="text-gray-500 text-sm">Set a monthly budget in Settings to see the breakdown here.</p>
      </div>
    </div>
  )
}
