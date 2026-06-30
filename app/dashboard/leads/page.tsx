export default function LeadsPage() {
  return (
    <div className="p-8">
      <h1 className="text-white text-2xl font-semibold mb-1">Leads</h1>
      <p className="text-gray-400 text-sm mb-8">Everyone who submitted the quote form</p>

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
            <tr>
              <td colSpan={4} className="px-5 py-8 text-center text-gray-500">
                No leads yet. They'll appear here once the form is connected.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
