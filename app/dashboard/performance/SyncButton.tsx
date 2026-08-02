'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../ui'

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  async function sync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/meta/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResult({
          ok: true,
          text: data.synced > 0
            ? `Synced ${data.synced} campaign${data.synced === 1 ? '' : 's'} · $${data.totalSpend} spend`
            : (data.note ?? 'Nothing to sync yet'),
        })
        router.refresh()
      } else {
        setResult({ ok: false, text: data.error ?? 'Sync failed' })
      }
    } catch {
      setResult({ ok: false, text: 'Could not reach the server' })
    }
    setSyncing(false)
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={sync} disabled={syncing} variant="primary" size="md">
        {syncing ? 'Syncing…' : 'Sync now'}
      </Button>
      {result && (
        <p className={`text-xs text-right max-w-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
          {result.text}
        </p>
      )}
    </div>
  )
}
