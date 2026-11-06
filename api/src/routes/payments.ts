import { Hono } from 'hono'

export const paymentsRoutes = new Hono<{ Bindings: Env }>()

type ShareRow = {
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  idempotency_key: string | null
}

function projectPaidShare(row: ShareRow, paidAt: string) {
  return { id: row.id, memberId: row.member_id, amountCents: row.amount_cents, paidAt }
}

paymentsRoutes.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const key = c.req.header('Idempotency-Key')

  if (!key || key.trim() === '') {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const fetchShare = async (): Promise<ShareRow | null> => {
    const row = await c.env.DB.prepare(
      `SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key
         FROM shares WHERE id = ? AND bill_id = ?`,
    )
      .bind(shareId, billId)
      .first<ShareRow>()
    return row ?? null
  }

  const initial = await fetchShare()
  if (!initial) return c.json({ error: 'bill or share not found' }, 404)

  if (initial.paid_at !== null) {
    if (initial.idempotency_key === key) {
      return c.json(projectPaidShare(initial, initial.paid_at), 200)
    }
    return c.json({ error: 'share already paid with a different idempotency key' }, 409)
  }

  const now = new Date().toISOString()
  const result = await c.env.DB.prepare(
    `UPDATE shares SET paid_at = ?, idempotency_key = ?
       WHERE id = ? AND bill_id = ? AND paid_at IS NULL`,
  )
    .bind(now, key, shareId, billId)
    .run()

  if (result.meta.changes === 0) {
    // Lost the race to a concurrent pay — re-read and settle.
    const after = await fetchShare()
    if (!after) return c.json({ error: 'bill or share not found' }, 404)
    if (after.paid_at !== null && after.idempotency_key === key) {
      return c.json(projectPaidShare(after, after.paid_at), 200)
    }
    return c.json({ error: 'share already paid with a different idempotency key' }, 409)
  }

  return c.json(projectPaidShare(initial, now), 200)
})
