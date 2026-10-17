import crypto from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { queryOne } from './db.js';
import { DEFAULT_BUDGET, DEFAULT_GOALS } from './defaults.js';
import { GOOGLE_SETTING_KEYS, googleOAuthConfig, isGoogleOAuthConfigured } from './oauth.js';

const PASSWORD_ITERATIONS = 100000;
const PASSWORD_PREFIX = `pbkdf2-sha256$${PASSWORD_ITERATIONS}$`;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('base64url');
  return `${PASSWORD_PREFIX}${salt}$${hash}`;
}

export function needsPasswordRehash(stored = '') {
  return !stored.startsWith(PASSWORD_PREFIX);
}

export function verifyPassword(password, stored = '') {
  if (typeof stored !== 'string') return false;
  if (/^[a-f0-9]{64}$/.test(stored)) {
    const actual = crypto.createHash('sha256').update(String(password)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
  }
  const current = stored.startsWith(PASSWORD_PREFIX);
  const parts = current ? stored.slice(PASSWORD_PREFIX.length).split('$') : stored.split('.');
  if (parts.length !== 2) return false;
  const [salt, expected] = parts;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(salt) || !/^[A-Za-z0-9_-]{43}$/.test(expected)) return false;
  for (const iterations of current ? [PASSWORD_ITERATIONS] : [PASSWORD_ITERATIONS, 120000]) {
    let actual;
    try {
      actual = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('base64url');
    } catch (error) {
      if (iterations > PASSWORD_ITERATIONS && error.name === 'NotSupportedError') continue;
      throw error;
    }
    if (crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return true;
  }
  return false;
}

export function householdStatements(userId, householdId, name, createdAt) {
  return [
    { sql: 'INSERT INTO households(id,name,owner_id,monthly_limit,created_at) VALUES(?,?,?,?,?)', args: [householdId, name, userId, 15000000, createdAt] },
    { sql: 'INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES(?,?,?,?)', args: [householdId, userId, 'owner', createdAt] },
    { sql: 'INSERT INTO household_defaults(household_id,initialized_at) VALUES(?,?)', args: [householdId, createdAt] },
    ...DEFAULT_BUDGET.map(([categoryName, pct], sortOrder) => ({
      sql: 'INSERT INTO categories(id,household_id,name,pct,sort_order) VALUES(?,?,?,?,?)',
      args: [crypto.randomUUID(), householdId, categoryName, pct, sortOrder],
    })),
    ...DEFAULT_GOALS.map(([goalName, target], sortOrder) => ({
      sql: 'INSERT INTO goals(id,household_id,name,target,current,sort_order) VALUES(?,?,?,?,?,?)',
      args: [crypto.randomUUID(), householdId, goalName, target, 0, sortOrder],
    })),
  ];
}

export async function ensureSuperadmin(db, env) {
  if (await queryOne(db, "SELECT value FROM app_settings WHERE key='superadmin_initialized'")) return;
  const existing = await queryOne(db, "SELECT id FROM users WHERE is_superadmin=1 AND status='active' LIMIT 1");
  if (existing) {
    await db.execute({ sql: "INSERT OR IGNORE INTO app_settings(key,value) VALUES('superadmin_initialized',?)", args: [existing.id] });
    return;
  }
  const email = String(env.SUPERADMIN_EMAIL || 'admin@budgetku.local').trim().toLowerCase();
  const password = String(env.SUPERADMIN_PASSWORD || '');
  if (!password) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 1024) {
    throw new Error('Konfigurasi superadmin tidak valid. Password awal minimal 12 karakter.');
  }
  const configuredUser = await queryOne(db, 'SELECT id FROM users WHERE email=?', [email]);
  const userId = configuredUser?.id || crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const statements = configuredUser
    ? [{ sql: "UPDATE users SET is_superadmin=1,status='active',deleted_at=NULL WHERE id=?", args: [userId] }]
    : [{ sql: "INSERT INTO users(id,email,name,password_hash,created_at,is_superadmin,status) VALUES(?,?,?,?,?,1,'active')", args: [userId, email, 'Superadmin', hashPassword(password), createdAt] }];
  const membership = await queryOne(db, 'SELECT household_id FROM household_members WHERE user_id=? LIMIT 1', [userId]);
  if (!membership) statements.push(...householdStatements(userId, crypto.randomUUID(), 'Keluarga Kita', createdAt));
  statements.push({ sql: "INSERT OR IGNORE INTO app_settings(key,value) VALUES('superadmin_initialized',?)", args: [userId] });
  await db.batch(statements);
}

export function mountAdminRoutes(app, { getDb, requireUser, requireHousehold, readJson }) {
  const requireAdmin = async (c) => {
    const user = await requireUser(c);
    if (!user.is_superadmin) throw new HTTPException(403, { message: 'Akses ini khusus superadmin' });
    return user;
  };
  const fields = (body, creating = false) => {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = body.password ?? '';
    if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new HTTPException(400, { message: 'Nama minimal 2 karakter dan email harus valid' });
    }
    if (typeof password !== 'string' || ((creating || password) && (password.length < 12 || password.length > 1024))) {
      throw new HTTPException(400, { message: 'Password minimal 12 karakter' });
    }
    if (typeof body.isSuperadmin !== 'boolean' || !['active', 'disabled'].includes(body.status)) {
      throw new HTTPException(400, { message: 'Role atau status user tidak valid' });
    }
    return { name, email, password, isSuperadmin: body.isSuperadmin ? 1 : 0, status: body.status };
  };
  const mutation = async (c, action) => {
    try { return await action(); }
    catch (error) {
      if (String(error.message).includes('users.email')) return c.json({ error: 'Email sudah digunakan' }, 409);
      if (String(error.message).includes('LAST_SUPERADMIN')) return c.json({ error: 'Minimal satu superadmin aktif harus tetap ada' }, 409);
      throw error;
    }
  };

  app.get('/api/admin/users', async (c) => {
    await requireAdmin(c);
    const db = getDb(c.env.DB);
    const [users, memberships, households] = await Promise.all([
      db.execute('SELECT id,name,email,is_superadmin,status,created_at FROM users WHERE status!=\'deleted\' ORDER BY is_superadmin DESC,created_at'),
      db.execute('SELECT m.user_id,m.household_id,h.name,m.role FROM household_members m JOIN households h ON h.id=m.household_id'),
      db.execute('SELECT id,name FROM households ORDER BY name'),
    ]);
    return c.json({ users: users.rows.map((user) => ({ ...user, households: memberships.rows.filter((member) => member.user_id === user.id) })), households: households.rows });
  });

  app.get('/api/admin/integrations/google', async (c) => {
    await requireAdmin(c);
    const db = getDb(c.env.DB);
    const config = await googleOAuthConfig(db, c.env, c.req.url);
    return c.json({
      configured: isGoogleOAuthConfigured(config),
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      clientSecretSet: Boolean(config.clientSecret),
    });
  });

  app.put('/api/admin/integrations/google', async (c) => {
    await requireAdmin(c);
    const db = getDb(c.env.DB);
    const body = await readJson(c);
    if (typeof body.clientId !== 'string' || typeof body.redirectUri !== 'string' || (body.clientSecret !== undefined && typeof body.clientSecret !== 'string')) {
      throw new HTTPException(400, { message: 'Konfigurasi Google tidak valid' });
    }
    const clientId = body.clientId.trim();
    const redirectUri = body.redirectUri.trim();
    const clientSecret = (body.clientSecret || '').trim();
    if (clientId.length > 512 || !/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      throw new HTTPException(400, { message: 'Gunakan Client ID Google bertipe Web application' });
    }
    let callback;
    try {
      callback = new URL(redirectUri);
    } catch {
      throw new HTTPException(400, { message: 'Redirect URI tidak valid' });
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
    if (redirectUri.length > 2048 || (callback.protocol !== 'https:' && !(local && callback.protocol === 'http:')) || callback.origin !== new URL(c.req.url).origin || callback.pathname !== '/auth/google/callback' || callback.username || callback.password || callback.search || callback.hash) {
      throw new HTTPException(400, { message: 'Redirect URI harus menuju /auth/google/callback pada alamat aplikasi ini (HTTPS, atau localhost untuk development)' });
    }
    const existing = await googleOAuthConfig(db, c.env, c.req.url);
    if (clientId !== existing.clientId && !clientSecret) {
      throw new HTTPException(400, { message: 'Isi Client Secret baru saat mengganti Client ID' });
    }
    const storedSecret = clientSecret || existing.clientSecret;
    if (!storedSecret || storedSecret.length > 4096 || /[\u0000-\u001f\u007f]/.test(storedSecret)) {
      throw new HTTPException(400, { message: 'Client Secret wajib diisi saat pertama kali menyimpan' });
    }
    const values = [
      ['google_client_id', clientId],
      ['google_redirect_uri', redirectUri],
      ['google_client_secret', storedSecret],
    ];
    const statements = values.map(([key, value]) => ({
      sql: 'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      args: [key, value],
    }));
    const changed = clientId !== existing.clientId || storedSecret !== existing.clientSecret || redirectUri !== existing.redirectUri;
    if (changed) {
      statements.push({ sql: 'DELETE FROM oauth_states' }, { sql: 'DELETE FROM gmail_tokens' });
    }
    await db.batch(statements);
    return c.json({ ok: true, configured: true, connectionsReset: changed });
  });

  app.delete('/api/admin/integrations/google', async (c) => {
    await requireAdmin(c);
    const db = getDb(c.env.DB);
    await db.batch([
      ...GOOGLE_SETTING_KEYS.map((key) => ({
        sql: 'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        args: [key, ''],
      })),
      { sql: 'DELETE FROM oauth_states' },
      { sql: 'DELETE FROM gmail_tokens' },
    ]);
    return c.json({ ok: true });
  });

  app.post('/api/admin/users', async (c) => {
    const admin = await requireAdmin(c);
    const db = getDb(c.env.DB);
    const household = await requireHousehold(c, admin);
    const body = await readJson(c);
    const value = fields(body, true);
    const householdId = household.id;
    const userId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    return mutation(c, async () => {
      await db.batch([
        { sql: 'INSERT INTO users(id,name,email,password_hash,is_superadmin,status,created_at) VALUES(?,?,?,?,?,?,?)', args: [userId, value.name, value.email, hashPassword(value.password), value.isSuperadmin, value.status, createdAt] },
        { sql: 'INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES(?,?,\'member\',?)', args: [householdId, userId, createdAt] },
      ]);
      return c.json({ ok: true, id: userId }, 201);
    });
  });

  app.put('/api/admin/users/:id', async (c) => {
    const admin = await requireAdmin(c);
    const db = getDb(c.env.DB);
    const userId = c.req.param('id');
    const existing = await queryOne(db, 'SELECT * FROM users WHERE id=? AND status!=\'deleted\'', [userId]);
    if (!existing) throw new HTTPException(404, { message: 'User tidak ditemukan' });
    const value = fields(await readJson(c));
    if (userId === admin.id && (!value.isSuperadmin || value.status !== 'active')) {
      throw new HTTPException(400, { message: 'Tidak bisa menonaktifkan atau menurunkan role akun sendiri' });
    }
    return mutation(c, async () => {
      const statements = [{
        sql: 'UPDATE users SET name=?,email=?,is_superadmin=?,status=?,password_hash=? WHERE id=?',
        args: [value.name, value.email, value.isSuperadmin, value.status, value.password ? hashPassword(value.password) : existing.password_hash, userId],
      }];
      if (value.password || value.status !== existing.status || value.isSuperadmin !== existing.is_superadmin) {
        statements.push({ sql: 'DELETE FROM sessions WHERE user_id=?', args: [userId] });
        statements.push({ sql: 'DELETE FROM oauth_states WHERE user_id=?', args: [userId] });
      }
      await db.batch(statements);
      return c.json({ ok: true });
    });
  });

  app.delete('/api/admin/users/:id', async (c) => {
    const admin = await requireAdmin(c);
    const db = getDb(c.env.DB);
    const userId = c.req.param('id');
    if (userId === admin.id) throw new HTTPException(400, { message: 'Tidak bisa menghapus akun sendiri' });
    if (!(await queryOne(db, 'SELECT id FROM users WHERE id=? AND status!=\'deleted\'', [userId]))) throw new HTTPException(404, { message: 'User tidak ditemukan' });
    if (await queryOne(db, 'SELECT id FROM households WHERE owner_id=? LIMIT 1', [userId])) {
      throw new HTTPException(409, { message: 'Pemilik household tidak dapat dihapus. Nonaktifkan akunnya agar riwayat keluarga tetap aman.' });
    }
    return mutation(c, async () => {
      await db.batch([
        { sql: 'UPDATE users SET status=\'deleted\',deleted_at=? WHERE id=?', args: [new Date().toISOString(), userId] },
        ...['sessions', 'oauth_states', 'gmail_tokens'].map((table) => ({ sql: `DELETE FROM ${table} WHERE user_id=?`, args: [userId] })),
        { sql: 'DELETE FROM invites WHERE created_by=? AND used_by IS NULL', args: [userId] },
      ]);
      return c.json({ ok: true });
    });
  });
}
