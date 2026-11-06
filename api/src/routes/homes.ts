import { Hono } from 'hono'
import { getHome, insertHome, insertMember } from '../db'

export const homesRoutes = new Hono<{ Bindings: Env }>()

async function readName(c: { req: { json: () => Promise<unknown> } }): Promise<string | null> {
  try {
    const body = (await c.req.json()) as { name?: unknown }
    return typeof body.name === 'string' ? body.name.trim() : null
  } catch {
    return null
  }
}

homesRoutes.post('/api/homes', async (c) => {
  const name = await readName(c)
  if (!name) return c.json({ error: 'name is required' }, 400)

  const id = crypto.randomUUID()
  const home = await insertHome(c.env.DB, id, name)
  return c.json(home, 201)
})

homesRoutes.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await getHome(c.env.DB, homeId)
  if (!home) return c.json({ error: 'home not found' }, 404)

  const name = await readName(c)
  if (!name) return c.json({ error: 'name is required' }, 400)

  const member = await insertMember(c.env.DB, homeId, name)
  return c.json({ id: member.id, homeId: member.home_id, name: member.name }, 201)
})

homesRoutes.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await getHome(c.env.DB, homeId)
  if (!home) return c.json({ error: 'home not found' }, 404)
  return c.json({ id: home.id, name: home.name }, 200)
})
