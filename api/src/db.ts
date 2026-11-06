export type HomeRow = { id: string; name: string }
export type MemberRow = { id: string; home_id: string; name: string; position: number }

export async function getHome(db: D1Database, id: string): Promise<HomeRow | null> {
  return (
    (await db.prepare('SELECT id, name FROM homes WHERE id = ?').bind(id).first<HomeRow>()) ?? null
  )
}

export async function insertHome(db: D1Database, id: string, name: string): Promise<HomeRow> {
  await db.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()
  return { id, name }
}

/**
 * Atomic position assignment: the subquery runs inside the same INSERT statement,
 * so D1's serialized writes make it race-free. The UNIQUE(home_id, position)
 * constraint is our backup — if the subquery ever races, we retry with a fresh id.
 */
export async function insertMember(
  db: D1Database,
  homeId: string,
  name: string,
): Promise<MemberRow> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID()
    try {
      const row = await db
        .prepare(
          `INSERT INTO members (id, home_id, name, position)
           VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM members WHERE home_id = ?))
           RETURNING id, home_id, name, position`,
        )
        .bind(id, homeId, name, homeId)
        .first<MemberRow>()
      if (row) return row
      throw new Error('insertMember: no row returned')
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint/i.test(err.message)) continue
      throw err
    }
  }
  throw new Error('insertMember: exhausted retries')
}
