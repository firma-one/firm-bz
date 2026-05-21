'use client'

import { useEffect, useState } from 'react'
import { Terminal, Play, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import type { ScriptResult } from '@/lib/admin-scripts'

interface ScriptMeta {
  id: string
  name: string
  description: string
}

interface ScriptState {
  running: boolean
  result: ScriptResult | null
  error: string | null
}

export default function AdminScriptsPage() {
  const { session } = useAuth()
  const [scripts, setScripts] = useState<ScriptMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [states, setStates] = useState<Record<string, ScriptState>>({})

  useEffect(() => {
    if (!session?.access_token) return
    fetch('/api/system/admin-scripts', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data) => {
        setScripts(data.scripts)
        const initial: Record<string, ScriptState> = {}
        for (const s of data.scripts) initial[s.id] = { running: false, result: null, error: null }
        setStates(initial)
      })
      .catch((e) => setFetchError(String(e)))
      .finally(() => setLoading(false))
  }, [session?.access_token])

  const runScript = async (id: string) => {
    if (!session?.access_token) return
    setStates((prev) => ({ ...prev, [id]: { running: true, result: null, error: null } }))
    try {
      const res = await fetch(`/api/system/admin-scripts/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setStates((prev) => ({ ...prev, [id]: { running: false, result: data, error: null } }))
    } catch (e) {
      setStates((prev) => ({ ...prev, [id]: { running: false, result: null, error: String(e) } }))
    }
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-600">
        <Terminal className="h-4 w-4" />
        <span>Administration</span>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900 font-medium">Admin Scripts</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Admin Scripts</h1>
        <p className="text-gray-600">
          Run one-off administrative operations. All scripts are idempotent — safe to run multiple times.
        </p>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>{fetchError}</div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {scripts.map((script) => {
            const state = states[script.id]
            return (
              <div key={script.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
                {/* Script header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <h2 className="text-base font-semibold text-gray-900">{script.name}</h2>
                    <p className="text-sm text-gray-500">{script.description}</p>
                    <p className="text-xs font-mono text-gray-400">{script.id}</p>
                  </div>
                  <Button
                    onClick={() => runScript(script.id)}
                    disabled={state?.running}
                    size="sm"
                  >
                    {state?.running ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Running…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run
                      </>
                    )}
                  </Button>
                </div>

                {/* Error */}
                {state?.error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-2">
                    <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{state.error}</span>
                  </div>
                )}

                {/* Result */}
                {state?.result && (
                  <div className="space-y-3">
                    {/* Status bar */}
                    <div className={`rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm font-medium ${
                      state.result.status === 'success'
                        ? 'bg-green-50 border border-green-200 text-green-800'
                        : 'bg-red-50 border border-red-200 text-red-800'
                    }`}>
                      {state.result.status === 'success'
                        ? <CheckCircle className="h-4 w-4" />
                        : <XCircle className="h-4 w-4" />}
                      <span className="capitalize">{state.result.status}</span>
                      <span className="ml-auto text-xs font-normal text-gray-500">
                        {state.result.durationMs.toLocaleString()} ms
                      </span>
                    </div>

                    {state.result.error && (
                      <p className="text-sm text-red-700">{state.result.error}</p>
                    )}

                    {/* Per-model summary table */}
                    {Object.keys(state.result.summary).length > 0 && (
                      <div className="rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Model</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-green-700">Processed</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Skipped</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-red-600">Errors</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {Object.entries(state.result.summary).map(([model, counts]) => (
                              <tr key={model} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-mono text-gray-700">{model}</td>
                                <td className="px-4 py-2 text-right text-green-700 font-medium">{counts.processed}</td>
                                <td className="px-4 py-2 text-right text-gray-500">{counts.skipped}</td>
                                <td className="px-4 py-2 text-right text-red-600">{counts.errors}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t border-gray-200">
                            <tr>
                              <td className="px-4 py-2 text-xs font-semibold text-gray-600">Total</td>
                              <td className="px-4 py-2 text-right text-xs font-semibold text-green-700">
                                {Object.values(state.result.summary).reduce((a, b) => a + b.processed, 0)}
                              </td>
                              <td className="px-4 py-2 text-right text-xs font-semibold text-gray-500">
                                {Object.values(state.result.summary).reduce((a, b) => a + b.skipped, 0)}
                              </td>
                              <td className="px-4 py-2 text-right text-xs font-semibold text-red-600">
                                {Object.values(state.result.summary).reduce((a, b) => a + b.errors, 0)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
