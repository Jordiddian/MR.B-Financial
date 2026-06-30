'use client'
import { useState, useEffect } from 'react'

export default function ApprovalsPage() {
  const [approvalRequired, setApprovalRequired] = useState(true)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setApprovalRequired(data.approval_required ?? true)
        setLoading(false)
      })
  }, [])

  async function toggle() {
    setToggling(true)
    const next = !approvalRequired
    setApprovalRequired(next)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approval_required: next }),
    })
    setToggling(false)
  }

  return (
    <div className="p-8">
      <h1 className="text-white text-2xl font-semibold mb-1">Approvals</h1>
      <p className="text-gray-400 text-sm mb-8">
        AI-generated ads waiting for review before going live
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">Require approval before publishing</p>
            <p className="text-gray-500 text-xs mt-0.5">
              When on, no ad goes live without your sign-off
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={loading || toggling}
            aria-pressed={approvalRequired}
            className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors disabled:opacity-50 ${
              approvalRequired ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full transition-transform ${
                approvalRequired ? 'ml-auto' : ''
              }`}
            />
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <span className="text-gray-400 text-sm">Pending ads</span>
        </div>
        <div className="px-5 py-10 text-center">
          <p className="text-gray-500 text-sm">
            No pending ads. The AI will generate drafts here once the Meta Ads pipeline is connected.
          </p>
        </div>
      </div>
    </div>
  )
}
