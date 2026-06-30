export default function ApprovalsPage() {
  return (
    <div className="p-8">
      <h1 className="text-white text-2xl font-semibold mb-1">Approvals</h1>
      <p className="text-gray-400 text-sm mb-8">AI-generated ads waiting for review before going live</p>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">Require approval before publishing</p>
            <p className="text-gray-500 text-xs mt-0.5">When on, no ad goes live without your sign-off</p>
          </div>
          <div className="w-10 h-6 bg-blue-600 rounded-full flex items-center px-0.5 cursor-pointer">
            <div className="w-5 h-5 bg-white rounded-full ml-auto" />
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <span className="text-gray-400 text-sm">Pending ads</span>
        </div>
        <div className="px-5 py-10 text-center">
          <p className="text-gray-500 text-sm">No pending ads. The AI will generate drafts here once the automation pipeline is running.</p>
        </div>
      </div>
    </div>
  )
}
