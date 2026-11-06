import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/')({ component: HomePage })

type Home = { id: string; name: string }
type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
type Bill = { id: string; homeId: string; title: string; totalCents: number; shares: Share[] }
type Balance = { memberId: string; name: string; outstandingCents: number }

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

function getHomeIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('homeId')
}

function setHomeIdInUrl(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('homeId', id)
  else url.searchParams.delete('homeId')
  window.history.pushState({}, '', url.toString())
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function HomePage() {
  const [homeId, setHomeId] = useState<string | null>(() => getHomeIdFromUrl())
  return (
    <div className="app">
      <style>{styles}</style>
      <h1>Shared Bill Splitter</h1>
      {homeId ? (
        <BillsView
          homeId={homeId}
          onChangeHome={() => {
            setHomeIdInUrl(null)
            setHomeId(null)
          }}
        />
      ) : (
        <Setup
          onCreated={(id) => {
            setHomeIdInUrl(id)
            setHomeId(id)
          }}
        />
      )}
    </div>
  )
}

function Setup({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const home = await apiFetch<Home>('/api/homes', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      onCreated(home.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create home')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Create a home</h2>
      <form onSubmit={submit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Home name"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </form>
      {error && (
        <div className="error" role="alert">
          Error: {error}
        </div>
      )}
    </section>
  )
}

function BillsView({
  homeId,
  onChangeHome,
}: {
  homeId: string
  onChangeHome: () => void
}) {
  const [home, setHome] = useState<Home | null>(null)
  const [bills, setBills] = useState<Bill[] | null>(null)
  const [balances, setBalances] = useState<Balance[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payingShareId, setPayingShareId] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const idempotencyKeys = useRef<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [h, b, bal] = await Promise.all([
        apiFetch<Home>(`/api/homes/${homeId}`),
        apiFetch<{ bills: Bill[] }>(`/api/homes/${homeId}/bills`),
        apiFetch<{ balances: Balance[] }>(`/api/homes/${homeId}/balances`),
      ])
      setHome(h)
      setBills(b.bills)
      setBalances(bal.balances)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [homeId])

  useEffect(() => {
    void load()
  }, [load])

  async function payShare(bill: Bill, share: Share) {
    setPayError(null)
    setPayingShareId(share.id)
    const key = idempotencyKeys.current.get(share.id) ?? crypto.randomUUID()
    idempotencyKeys.current.set(share.id, key)
    try {
      await apiFetch(`/api/bills/${bill.id}/shares/${share.id}/pay`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
      })
      idempotencyKeys.current.delete(share.id)
      await load()
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPayingShareId(null)
    }
  }

  if (loading) return <div className="loading">Loading…</div>
  if (error)
    return (
      <div>
        <div className="error" role="alert">
          Error: {error}
        </div>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </div>
    )

  return (
    <div>
      <header className="header">
        <strong>{home?.name ?? 'Home'}</strong>
        <button type="button" onClick={onChangeHome}>
          Switch home
        </button>
      </header>

      <AddMemberForm homeId={homeId} onAdded={load} />
      <AddBillForm homeId={homeId} onAdded={load} />

      <section>
        <h2>Bills</h2>
        {!bills || bills.length === 0 ? (
          <div className="empty">No bills yet.</div>
        ) : (
          <ul>
            {bills.map((bill) => (
              <li key={bill.id}>
                <div>
                  <strong>{bill.title}</strong> — {formatCents(bill.totalCents)}
                </div>
                <ul>
                  {bill.shares.map((s) => {
                    const memberName =
                      balances?.find((b) => b.memberId === s.memberId)?.name ?? s.memberId
                    return (
                      <li key={s.id}>
                        {memberName}: {formatCents(s.amountCents)}{' '}
                        {s.paidAt ? (
                          <span className="paid">✓ paid</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void payShare(bill, s)}
                            disabled={payingShareId === s.id}
                          >
                            {payingShareId === s.id ? 'Paying…' : 'Pay'}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {payError && (
          <div className="error" role="alert">
            Payment error: {payError}
          </div>
        )}
      </section>

      <section>
        <h2>Balances</h2>
        {!balances || balances.length === 0 ? (
          <div className="empty">No members yet.</div>
        ) : (
          <ul>
            {balances.map((b) => (
              <li key={b.memberId}>
                {b.name}: {formatCents(b.outstandingCents)} outstanding
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AddMemberForm({
  homeId,
  onAdded,
}: {
  homeId: string
  onAdded: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/homes/${homeId}/members`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setName('')
      await onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Add member</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Member name"
        disabled={busy}
      />
      <button type="submit" disabled={busy || !name.trim()}>
        {busy ? 'Adding…' : 'Add member'}
      </button>
      {error && (
        <div className="error" role="alert">
          Error: {error}
        </div>
      )}
    </form>
  )
}

function AddBillForm({
  homeId,
  onAdded,
}: {
  homeId: string
  onAdded: () => void | Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cents = Number(amount)
    if (!Number.isInteger(cents) || cents <= 0) {
      setError('Amount must be a positive whole number of cents')
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/api/homes/${homeId}/bills`, {
        method: 'POST',
        body: JSON.stringify({ title, totalCents: cents }),
      })
      setTitle('')
      setAmount('')
      await onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bill')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Add bill</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Bill title"
        disabled={busy}
      />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (cents)"
        inputMode="numeric"
        disabled={busy}
      />
      <button type="submit" disabled={busy || !title.trim() || !amount}>
        {busy ? 'Adding…' : 'Add bill'}
      </button>
      {error && (
        <div className="error" role="alert">
          Error: {error}
        </div>
      )}
    </form>
  )
}

const styles = `
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 1rem; color: #222; }
  .app { padding: 1rem 0; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; }
  h2 { font-size: 1.05rem; margin: 0 0 .5rem; }
  section, form { margin: 1rem 0; padding: .75rem 1rem; border: 1px solid #e2e2e2; border-radius: 8px; }
  .header { display: flex; justify-content: space-between; align-items: center; padding: .5rem 0; }
  input, button { font: inherit; padding: .35rem .6rem; margin-right: .4rem; border-radius: 6px; border: 1px solid #bbb; }
  button { cursor: pointer; background: #fff; }
  button:disabled { cursor: not-allowed; opacity: .55; }
  ul { list-style: none; padding-left: .5rem; }
  li { margin: .25rem 0; }
  .loading { color: #666; font-style: italic; }
  .empty { color: #666; }
  .error { color: #b00020; margin-top: .5rem; }
  .paid { color: #0a7d2b; font-weight: 600; }
`