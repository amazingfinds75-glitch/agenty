import { useCallback, useEffect, useRef, useState } from 'react'
import {
  errorMessage,
  fetchHealth,
  fetchLiveTrends,
  fetchSignalHistory,
  type BackendHealth,
  type LiveSignal,
  type LiveTrendsResponse,
  type SignalHistory,
} from './live'

export type LiveConnection = 'checking' | 'online' | 'offline'

export function useBackendHealth(intervalMs = 30_000) {
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [connection, setConnection] = useState<LiveConnection>('checking')
  const [checkedAt, setCheckedAt] = useState<number | null>(null)

  const check = useCallback(async () => {
    try {
      const result = await fetchHealth()
      setHealth(result)
      setConnection('online')
    } catch {
      setHealth(null)
      setConnection('offline')
    } finally {
      setCheckedAt(Date.now())
    }
  }, [])

  useEffect(() => {
    void check()
    const id = window.setInterval(() => void check(), intervalMs)
    return () => window.clearInterval(id)
  }, [check, intervalMs])

  return { health, connection, checkedAt, refresh: check }
}

export function useLiveTrends() {
  const [data, setData] = useState<LiveTrendsResponse | null>(null)
  const [state, setState] = useState<'loading' | 'live' | 'offline'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const dataRef = useRef<LiveTrendsResponse | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async (refresh = false) => {
    setRefreshing(true)
    try {
      const result = await fetchLiveTrends(refresh)
      if (!mounted.current) return
      dataRef.current = result
      setData(result)
      setError(null)
      setState('live')
    } catch (caught) {
      if (!mounted.current) return
      const message = errorMessage(caught)
      setError(message)
      if (!dataRef.current) setState('offline')
    } finally {
      if (mounted.current) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { data, state, error, refreshing, reload: load }
}

export function useLiveHistory(signal: LiveSignal | null) {
  const [history, setHistory] = useState<SignalHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!signal) {
      setHistory(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setHistory(null)
    setError(null)
    fetchSignalHistory(signal.key)
      .then((result) => {
        if (!cancelled) setHistory(result)
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [signal])

  return { history, loading, error }
}
