export function getDb(binding) {
  if (!binding) throw new Error("Binding D1 DB belum dikonfigurasi");
  const prepare = (statement) => {
    const { sql, args = [] } = typeof statement === "string" ? { sql: statement } : statement;
    return binding.prepare(sql).bind(...args);
  };
  const result = (value) => ({ rows: value.results || [], rowsAffected: value.meta.changes });
  return {
    async execute(statement) {
      const sql = typeof statement === "string" ? statement : statement.sql;
      const query = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
      return result(await (query ? prepare(statement).all() : prepare(statement).run()));
    },
    async batch(statements) {
      return (await binding.batch(statements.map(prepare))).map(result);
    },
  };
}

export async function queryOne(db, sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows[0] || null;
}
