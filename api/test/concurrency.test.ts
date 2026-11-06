import { describe, expect, it } from 'vitest'
import { call, createBill, createHome } from './helpers'

type PaidShare = { id: string; memberId: string; amountCents: number; paidAt: string }

describe('concurrent payments', () => {
  it('two simultaneous pays with different keys: exactly one wins', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)
    const share = bill.body.shares[0]
    if (!share) throw new Error('expected a share')

    const path = `/api/bills/${bill.body.id}/shares/${share.id}/pay`

    const [resA, resB] = await Promise.all([
      call<PaidShare>('POST', path, {
        headers: { 'Idempotency-Key': `k-a-${crypto.randomUUID()}` },
      }),
      call<PaidShare>('POST', path, {
        headers: { 'Idempotency-Key': `k-b-${crypto.randomUUID()}` },
      }),
    ])

    const statuses = [resA.status, resB.status].sort((a, b) => a - b)
    expect(statuses).toEqual([200, 409])

    const winner = resA.status === 200 ? resA : resB
    expect(winner.body.paidAt).toEqual(expect.any(String))
  })

  it('many simultaneous pays with the SAME key: all 200, one paidAt', async () => {
    const { homeId } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1000)
    const share = bill.body.shares[0]
    if (!share) throw new Error('expected a share')

    const path = `/api/bills/${bill.body.id}/shares/${share.id}/pay`
    const key = `k-${crypto.randomUUID()}`

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        call<PaidShare>('POST', path, { headers: { 'Idempotency-Key': key } }),
      ),
    )

    expect(results.every((r) => r.status === 200)).toBe(true)
    expect(new Set(results.map((r) => r.body.paidAt)).size).toBe(1)
  })
})
