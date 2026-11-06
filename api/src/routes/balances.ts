import { Hono } from 'hono'
import { getHome } from '../db'

export const balancesRoutes = new Hono<{ Bindings: Env }>()

type BalanceRow = {
  member_id: string
  name: string
  outstanding_cents: number | string
}

balancesRoutes.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await getHome(c.env.DB, homeId)
  if (!home) return c.json({ error: 'home not found' }, 404)

  const rows = await c.env.DB.prepare(
    `SELECT m.id AS member_id, m.name,
              COALESCE(SUM(CASE WHEN s.paid_at IS NULL THEN s.amount_cents ELSE 0 END), 0)
                AS outstanding_cents
       FROM members m
       LEFT JOIN shares s ON s.member_id = m.id AND s.home_id = m.home_id
       WHERE m.home_id = ?
       GROUP BY m.id, m.name
       ORDER BY m.position`,
  )
    .bind(homeId)
    .all<BalanceRow>()

  const balances = (rows.results ?? []).map((r) => ({
    memberId: r.member_id,
    name: r.name,
    outstandingCents: Number(r.outstanding_cents),
  }))

  return c.json({ balances }, 200)
})
