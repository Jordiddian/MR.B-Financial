export default function PerformancePage() {
  const adTypes = ['Covered California', 'Medicare', 'Dental', 'Vision', 'Final Expenses']

  return (
    <div className="p-8">
      <h1 className="text-white text-2xl font-semibold mb-1">Performance</h1>
      <p className="text-gray-400 text-sm mb-8">How each ad type is performing</p>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-gray-400 font-medium px-5 py-3">Ad type</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">Impressions</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">Clicks</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">Spend</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">Leads</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">Cost / lead</th>
              <th className="text-left text-gray-400 font-medium px-5 py-3">AI score</th>
            </tr>
          </thead>
          <tbody>
            {adTypes.map((type, i) => (
              <tr key={type} className={i < adTypes.length - 1 ? 'border-b border-gray-800' : ''}>
                <td className="px-5 py-3 text-white font-medium">{type}</td>
                {['—', '—', '—', '—', '—', '—'].map((v, j) => (
                  <td key={j} className="px-5 py-3 text-gray-500">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-gray-600 text-xs mt-4">Data populates once Meta ads are connected and running.</p>
    </div>
  )
}
