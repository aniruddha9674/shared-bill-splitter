import { describe, expect, it } from 'vitest'
import { call, createBill, createHome } from './helpers'

describe('cross-resource isolation', () => {
  it('paying a share via the wrong bill id returns 404', async () => {
    const { homeId } = await createHome(['Asha'])
    const billA = await createBill(homeId, 1000)
    const billB = await createBill(homeId, 500)
    const shareFromA = billA.body.shares[0]
    if (!shareFromA) throw new Error('expected a share')

    const res = await call('POST', `/api/bills/${billB.body.id}/shares/${shareFromA.id}/pay`, {
      headers: { 'Idempotency-Key': `k-${crypto.randomUUID()}` },
    })

    expect(res.status).toBe(404)
  })

  it('bills from two homes do not leak into each other', async () => {
    const homeA = await createHome(['Asha'])
    const homeB = await createHome(['Ben'])
    await createBill(homeA.homeId, 1000)

    const billsB = await call<{ bills: unknown[] }>('GET', `/api/homes/${homeB.homeId}/bills`)
    expect(billsB.status).toBe(200)
    expect(billsB.body.bills).toEqual([])
  })
})
