import { Hono } from 'hono'
import { balancesRoutes } from './routes/balances'
import { billsRoutes } from './routes/bills'
import { homesRoutes } from './routes/homes'
import { paymentsRoutes } from './routes/payments'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/', homesRoutes)
app.route('/', billsRoutes)
app.route('/', paymentsRoutes)
app.route('/', balancesRoutes)

app.notFound((c) => c.json({ error: 'not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal server error' }, 500)
})

export default app
