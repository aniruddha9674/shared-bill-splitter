import { Hono } from 'hono'
import { getHome } from '../db'

export const billsRoutes = new Hono<{ Bindings: Env }>()

type MemberIdRow = { id: string }

billsRoutes.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await getHome(c.env.DB, homeId)
  if (!home) return c.json({ error: 'home not found' }, 404)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 422)
  }
  const { title, totalCents } = (body ?? {}) as { title?: unknown; totalCents?: unknown }

  if (typeof title !== 'string' || title.trim() === '') {
    return c.json({ error: 'title is required' }, 400)
  }
  if (typeof totalCents !== 'number' || !Number.isInteger(totalCents) || totalCents <= 0) {
    return c.json({ error: 'totalCents must be a positive whole number' }, 422)
  }

  const members = await c.env.DB.prepare(
    'SELECT id FROM members WHERE home_id = ? ORDER BY position',
  )
    .bind(homeId)
    .all<MemberIdRow>()

  const memberRows = members.results ?? []
  if (memberRows.length === 0) {
    return c.json({ error: 'home has no members' }, 422)
  }

  const base = Math.floor(totalCents / memberRows.length)
  const remainder = totalCents % memberRows.length

  const billId = crypto.randomUUID()
  const shares = memberRows.map((m, i) => ({
    id: crypto.randomUUID(),
    memberId: m.id,
    amountCents: base + (i < remainder ? 1 : 0),
  }))

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
    ).bind(billId, homeId, title.trim(), totalCents),
    ...shares.map((s) =>
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, home_id, amount_cents) VALUES (?, ?, ?, ?, ?)',
      ).bind(s.id, billId, s.memberId, homeId, s.amountCents),
    ),
  ])

  return c.json(
    {
      id: billId,
      homeId,
      title: title.trim(),
      totalCents,
      shares: shares.map((s) => ({
        id: s.id,
        memberId: s.memberId,
        amountCents: s.amountCents,
        paidAt: null,
      })),
    },
    201,
  )
})

type BillRow = {
  id: string
  home_id: string
  title: string
  total_cents: number
}

type ShareListRow = {
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
}

billsRoutes.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await getHome(c.env.DB, homeId)
  if (!home) return c.json({ error: 'home not found' }, 404)

  const billRows = await c.env.DB.prepare(
    'SELECT id, home_id, title, total_cents FROM bills WHERE home_id = ? ORDER BY created_at ASC, id ASC',
  )
    .bind(homeId)
    .all<BillRow>()

  const bills = billRows.results ?? []
  if (bills.length === 0) return c.json({ bills: [] }, 200)

  const shareRows = await c.env.DB.prepare(
    `SELECT s.id, s.bill_id, s.member_id, s.amount_cents, s.paid_at
     FROM shares s
     JOIN bills b ON b.id = s.bill_id
     JOIN members m ON m.id = s.member_id
     WHERE b.home_id = ?
     ORDER BY s.bill_id, m.position`,
  )
    .bind(homeId)
    .all<ShareListRow>()

  const byBill = new Map<string, ShareListRow[]>()
  for (const s of shareRows.results ?? []) {
    const list = byBill.get(s.bill_id) ?? []
    list.push(s)
    byBill.set(s.bill_id, list)
  }

  return c.json(
    {
      bills: bills.map((b) => ({
        id: b.id,
        homeId: b.home_id,
        title: b.title,
        totalCents: b.total_cents,
        shares: (byBill.get(b.id) ?? []).map((s) => ({
          id: s.id,
          memberId: s.member_id,
          amountCents: s.amount_cents,
          paidAt: s.paid_at,
        })),
      })),
    },
    200,
  )
})