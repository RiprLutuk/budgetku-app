export function sqliteBinding(database) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const statement = database.prepare(sql);
          return {
            all: () => ({ results: statement.all(...args), meta: { changes: 0 } }),
            run: () => {
              const result = statement.run(...args);
              return { results: [], meta: { changes: Number(result.changes) } };
            },
          };
        },
      };
    },
    batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
