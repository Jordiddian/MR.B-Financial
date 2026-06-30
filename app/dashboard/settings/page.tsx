'use client'
import { useState, useEffect } from 'react'

interface Settings {
  monthly_cap: number | null
  max_ad_spend: number | null
  max_api_costs: number | null
  approval_required: boolean
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    monthly_cap: null,
    max_ad_spend: null,
    max_api_costs: null,
    approval_required: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        setLoading(false)
      })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthly_cap: settings.monthly_cap,
        max_ad_spend: settings.max_ad_spend,
        max_api_costs: settings.max_api_costs,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-white text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-gray-400 text-sm mb-8">Budget and system configuration</p>

      <div className="space-y-4">
        <form onSubmit={handleSave} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white text-sm font-semibold mb-4">Monthly budget</h2>
          <div className="space-y-3">
            {(
              [
                { label: 'Total monthly cap ($)', key: 'monthly_cap', placeholder: 'e.g. 1500' },
                { label: 'Max ad spend ($)', key: 'max_ad_spend', placeholder: 'e.g. 1200' },
                { label: 'Max API costs — text + image ($)', key: 'max_api_costs', placeholder: 'e.g. 200' },
              ] as const
            ).map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-gray-400 text-xs mb-1">{label}</label>
                <input
                  type="number"
                  placeholder={placeholder}
                  value={settings[key] ?? ''}
                  onChange={e =>
                    setSettings(s => ({
                      ...s,
                      [key]: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save budget'}
          </button>
        </form>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white text-sm font-semibold mb-1">Ad generation</h2>
          <p className="text-gray-500 text-xs mb-4">
            Controls how the automation pipeline runs once Meta Ads is connected
          </p>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex justify-between items-center">
              <span>Creative type</span>
              <span className="text-white">Images only</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Text model</span>
              <span className="text-white">GPT-4o-mini</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Image model</span>
              <span className="text-white">OpenAI image API</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white text-sm font-semibold mb-1">Pending setup</h2>
          <p className="text-gray-500 text-xs mb-4">Required before the automation pipeline can run</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">○</span>
              <span className="text-gray-300">OpenAI billing — add payment method at platform.openai.com</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">○</span>
              <span className="text-gray-300">Meta Ads API — connect account and add META_AD_ACCOUNT_ID + META_ACCESS_TOKEN to Vercel</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">○</span>
              <span className="text-gray-300">Meta Pixel ID — replace YOUR_PIXEL_ID in the landing page HTML</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
