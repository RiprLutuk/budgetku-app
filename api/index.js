import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import crypto from "node:crypto";
import { getDb, queryOne } from "../lib/db.js";
import { GOAL_FOR_CATEGORY_SQL, GOALS_SNAPSHOT_SQL } from "../lib/goals.js";
import { MONTHLY_SUMMARY_SQL } from "../lib/transactions.js";
import { ensureSuperadmin, hashPassword, mountAdminRoutes, needsPasswordRehash, verifyPassword } from "../lib/admin.js";
import { googleOAuthConfig, isGoogleOAuthConfigured } from "../lib/oauth.js";

const app = new Hono();

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const token = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const normEmail = (value) => String(value || "").trim().toLowerCase();
const json = (c, data, status = 200) => c.json(data, status);
const validDate = (value) => {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

async function readJson(c) {
  let body;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "JSON tidak valid" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "JSON harus berupa objek" });
  }
  return body;
}
function cookie(c, name) {
  const raw = c.req.header("cookie") || "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  try {
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
function sessionCookie(c, value, maxAge = 30 * 86400) {
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  return `budgetku_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function currentUser(c) {
  const db = getDb(c.env.DB);
  const sid = cookie(c, "budgetku_session");
  if (!sid) return null;
  return queryOne(db, 
    `SELECT u.id,u.email,u.name,u.is_superadmin,u.status,s.expires_at
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.id=? AND s.expires_at>? AND u.status='active'`,
    [sid, now()],
  );
}
async function requireUser(c) {
  const user = await currentUser(c);
  if (!user) throw new HTTPException(401, { message: "Silakan login dulu" });
  return user;
}
async function householdFor(c, user) {
  const db = getDb(c.env.DB);
  const householdId = c.req.header("x-household-id") || c.req.query("householdId");
  const args = householdId ? [householdId, user.id] : [user.id];
  return queryOne(db, 
    householdId
      ? `SELECT h.*,m.role FROM households h
         JOIN household_members m ON m.household_id=h.id
         WHERE h.id=? AND m.user_id=?`
      : `SELECT h.*,m.role FROM households h
         JOIN household_members m ON m.household_id=h.id
         WHERE m.user_id=? ORDER BY h.created_at LIMIT 1`,
    args,
  );
}
async function requireHousehold(c, user) {
  const household = await householdFor(c, user);
  if (!household) throw new HTTPException(403, { message: "Tidak punya akses household" });
  return household;
}
function validMoney(value, minimum = 0) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}
async function validateOwnedRows(db, table, rows, householdId) {
  const ids = rows.map((row) => row?.id);
  if (ids.some((value) => typeof value !== "string") || new Set(ids).size !== ids.length) {
    throw new HTTPException(400, { message: "ID tidak valid / duplikat" });
  }
  const result = await db.execute({
    sql: `SELECT id FROM ${table} WHERE household_id=? AND id IN (${ids.map(() => "?").join(",")})`,
    args: [householdId, ...ids],
  });
  if (result.rows.length !== ids.length) throw new HTTPException(400, { message: "Data bukan milik household aktif" });
}
async function gmailToken(db, userId) {
  const row = await queryOne(db, "SELECT token_json FROM gmail_tokens WHERE user_id=?", [userId]);
  return row ? JSON.parse(row.token_json) : null;
}
async function saveGmailToken(db, userId, value) {
  await db.execute({
    sql: `INSERT INTO gmail_tokens(user_id,token_json,updated_at) VALUES(?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET token_json=excluded.token_json,updated_at=excluded.updated_at`,
    args: [userId, JSON.stringify(value), now()],
  });
}
async function exchangeCode(c, code) {
  const config = await googleOAuthConfig(getDb(c.env.DB), c.env, c.req.url);
  if (!isGoogleOAuthConfigured(config)) throw new HTTPException(400, { message: 'Integrasi Gmail belum diatur di Settings' });
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Token exchange gagal");
  return { ...data, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
}
async function gmailAccess(c, userId) {
  const db = getDb(c.env.DB);
  const config = await googleOAuthConfig(db, c.env, c.req.url);
  if (!isGoogleOAuthConfigured(config)) throw new HTTPException(400, { message: 'Integrasi Gmail belum diatur di Settings' });
  let saved = await gmailToken(db, userId);
  if (!saved) throw new Error("Gmail belum terkoneksi");
  if (saved.expires_at && saved.expires_at > Date.now() + 60000) return saved.access_token;
  if (!saved.refresh_token) return saved.access_token;
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: saved.refresh_token,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Refresh token gagal");
  saved = { ...saved, ...data, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
  await saveGmailToken(db, userId, saved);
  return saved.access_token;
}
const decodeBase64Url = (value) => Buffer.from(String(value || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function flattenParts(part, output = []) {
  if (!part) return output;
  if (part.body?.data) output.push(decodeBase64Url(part.body.data));
  for (const child of part.parts || []) flattenParts(child, output);
  return output;
}
function stripHtml(value = "") {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
function parseMoney(text = "") {
  const values = [];
  const patterns = [
    /(?:Rp\.?\s*)(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{4,})(?!\d)/gi,
    /(?:IDR\s*)(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d{4,})(?!\d)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const amount = Number(match[1].replace(/[.\s]/g, "").replace(/,\d{1,2}$/, ""));
      if (Number.isFinite(amount) && amount >= 1000 && amount <= 1000000000) values.push(amount);
    }
  }
  return values.length ? Math.max(...values) : null;
}
const headerValue = (headers, name) => headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";

async function initialize(c, next) {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (c.env?.DB) await ensureSuperadmin(getDb(c.env.DB), c.env);
  await next();
}
app.use("/api/*", initialize);
app.use("/auth/*", initialize);
app.use("/health", initialize);
app.use("*", bodyLimit({ maxSize: 1500000, onError: (c) => json(c, { error: "Payload terlalu besar. Maksimum nota 1 MB." }, 413) }));
app.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) return json(c, { error: "Origin tidak diizinkan" }, 403);
  }
  await next();
});
app.onError((error, c) => {
  if (error instanceof HTTPException) return json(c, { error: error.message }, error.status);
  console.error("BudgetKu API gagal:", error.code || error.name, error.message);
  return json(c, { error: "Permintaan gagal. Silakan coba lagi." }, 500);
});
app.notFound((c) => json(c, { error: "Endpoint tidak ditemukan" }, 404));

app.get("/health", (c) => json(c, { ok: true, db: "d1" }));

app.post("/api/auth/login", async (c) => {
  const db = getDb(c.env.DB);
  const body = await readJson(c);
  const password = String(body.password || "");
  if (!password || password.length > 1024) return json(c, { error: "Email atau password salah" }, 401);
  const user = await queryOne(db, "SELECT * FROM users WHERE email=?", [normEmail(body.email)]);
  if (!user || user.status !== "active" || !verifyPassword(password, user.password_hash)) return json(c, { error: "Email atau password salah" }, 401);
  if (needsPasswordRehash(user.password_hash)) {
    await db.execute({ sql: "UPDATE users SET password_hash=? WHERE id=?", args: [hashPassword(body.password), user.id] });
  }
  const sessionId = token();
  await db.execute({
    sql: "INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)",
    args: [sessionId, user.id, new Date(Date.now() + 30 * 86400000).toISOString()],
  });
  c.header("Set-Cookie", sessionCookie(c, sessionId));
  return json(c, { ok: true });
});

app.put("/api/account/password", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  const body = await readJson(c);
  const currentPassword = body.currentPassword;
  const nextPassword = body.password;
  if (typeof currentPassword !== "string" || currentPassword.length > 1024 || typeof nextPassword !== "string" || nextPassword.length < 12 || nextPassword.length > 1024) {
    return json(c, { error: "Password baru minimal 12 karakter" }, 400);
  }
  const saved = await queryOne(db, "SELECT password_hash FROM users WHERE id=?", [user.id]);
  if (!verifyPassword(currentPassword, saved.password_hash)) return json(c, { error: "Password saat ini tidak cocok" }, 400);
  await db.batch([
    { sql: "UPDATE users SET password_hash=? WHERE id=?", args: [hashPassword(nextPassword), user.id] },
    { sql: "DELETE FROM sessions WHERE user_id=? AND id!=?", args: [user.id, cookie(c, "budgetku_session")] },
  ]);
  return json(c, { ok: true });
});

app.post("/api/auth/logout", async (c) => {
  const db = getDb(c.env.DB);
  const sessionId = cookie(c, "budgetku_session");
  if (sessionId) await db.execute({ sql: "DELETE FROM sessions WHERE id=?", args: [sessionId] });
  c.header("Set-Cookie", sessionCookie(c, "", 0));
  return json(c, { ok: true });
});

app.get("/api/me", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  if (!user) return;
  const result = await db.execute({
    sql: `SELECT h.id,h.name,m.role FROM households h
          JOIN household_members m ON m.household_id=h.id
          WHERE m.user_id=? ORDER BY h.created_at`,
    args: [user.id],
  });
  return json(c, { user: { id: user.id, email: user.email, name: user.name, is_superadmin: Boolean(user.is_superadmin) }, households: result.rows });
});

mountAdminRoutes(app, { getDb, requireUser, requireHousehold, readJson });

app.get("/api/snapshot", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  if (!user) return;
  const household = await requireHousehold(c, user);
  if (!household) return;
  const [members, categories, transactions, goals, monthlySummary] = await Promise.all([
    db.execute({ sql: `SELECT u.id,u.name,u.email,m.role FROM household_members m JOIN users u ON u.id=m.user_id WHERE m.household_id=? ORDER BY m.joined_at`, args: [household.id] }),
    db.execute({ sql: "SELECT id,name,pct,sort_order FROM categories WHERE household_id=? ORDER BY sort_order", args: [household.id] }),
    db.execute({ sql: `SELECT t.*,u.name AS created_by_name,c.name AS category_name,g.name AS goal_name FROM transactions t JOIN users u ON u.id=t.user_id LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN goals g ON g.id=t.goal_id AND g.household_id=t.household_id WHERE t.household_id=? ORDER BY tx_date DESC,created_at DESC LIMIT 2000`, args: [household.id] }),
    db.execute({ sql: GOALS_SNAPSHOT_SQL, args: [household.id] }),
    db.execute({ sql: MONTHLY_SUMMARY_SQL, args: [household.id] }),
  ]);
  return json(c, {
    household: { id: household.id, name: household.name, role: household.role, monthly_limit: household.monthly_limit },
    members: members.rows,
    categories: categories.rows,
    transactions: transactions.rows,
    goals: goals.rows,
    monthlySummary: monthlySummary.rows,
    realtime: "polling",
  });
});

app.post("/api/transactions", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const household = await requireHousehold(c, user);
  const body = await readJson(c);
  const type = body.type;
  const amount = body.amount;
  const note = String(body.note || "").trim();
  const date = String(body.date || "");
  const externalRef = String(body.externalRef || "").trim();
  if (!["income", "expense"].includes(type) || !validMoney(amount, 1) || !note || note.length > 255 || !validDate(date)) {
    return json(c, { error: "Transaksi tidak valid. Cek tanggal, nominal, dan catatan." }, 400);
  }
  if (externalRef.length > 128) return json(c, { error: "Referensi eksternal terlalu panjang" }, 400);
  const categoryId = type === "income" ? null : String(body.categoryId || "").trim() || null;
  if (categoryId) {
    const category = await queryOne(db, "SELECT id FROM categories WHERE id=? AND household_id=?", [categoryId, household.id]);
    if (!category) return json(c, { error: "Kategori tidak valid" }, 400);
  }
  if (body.goalId != null && typeof body.goalId !== "string") return json(c, { error: "Goal tidak valid" }, 400);
  let goalId = typeof body.goalId === "string" ? body.goalId.trim() || null : null;
  if (type === "income" && goalId) return json(c, { error: "Goal hanya untuk setoran tabungan melalui pengeluaran" }, 400);
  if (type === "expense" && body.goalId === undefined && categoryId) {
    goalId = (await queryOne(db, GOAL_FOR_CATEGORY_SQL, [categoryId, household.id]))?.id || null;
  }
  if (goalId && !(await queryOne(db, "SELECT id FROM goals WHERE id=? AND household_id=?", [goalId, household.id]))) {
    return json(c, { error: "Goal tidak valid" }, 400);
  }
  const paidBy = String(body.paidBy || "shared").trim();
  if (paidBy !== "shared") {
    const member = await queryOne(db, "SELECT user_id FROM household_members WHERE household_id=? AND user_id=?", [household.id, paidBy]);
    if (!member) return json(c, { error: "Member pembayaran tidak valid" }, 400);
  }
  const receiptUrl = body.receiptUrl ? String(body.receiptUrl).trim() : null;
  if (receiptUrl) {
    const receiptId = receiptUrl.match(/^\/api\/receipts\/([a-zA-Z0-9_-]+)$/)?.[1];
    if (!receiptId || !(await queryOne(db, "SELECT id FROM receipts WHERE id=? AND household_id=?", [receiptId, household.id]))) {
      return json(c, { error: "Nota tidak valid" }, 400);
    }
  }
  const transactionId = id();
  const statement = {
    sql: `INSERT INTO transactions(id,household_id,user_id,type,amount,note,category_id,goal_id,tx_date,need,source,paid_by,receipt_url,external_ref,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [transactionId, household.id, user.id, type, amount, note, categoryId, goalId, date, type === "income" ? 0 : body.need ? 1 : 0, String(body.source || "manual").slice(0, 32), paidBy, receiptUrl, externalRef || null, now()],
  };
  statement.sql += " ON CONFLICT DO NOTHING";
  const created = await db.execute(statement);
  if (!created.rowsAffected && externalRef) {
    const existing = await queryOne(db, "SELECT id FROM transactions WHERE household_id=? AND external_ref=?", [household.id, externalRef]);
    if (existing) return json(c, { ok: true, id: existing.id, duplicate: true });
  }
  return json(c, { ok: true, id: transactionId });
});

app.delete("/api/transactions/:id", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const household = await requireHousehold(c, user);
  const result = await db.execute({ sql: "DELETE FROM transactions WHERE id=? AND household_id=?", args: [c.req.param("id"), household.id] });
  if (!result.rowsAffected) return json(c, { error: "Transaksi tidak ditemukan" }, 404);
  return json(c, { ok: true });
});

app.put("/api/categories", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const household = await requireHousehold(c, user);
  const body = await readJson(c);
  const categories = Array.isArray(body.categories) ? body.categories : [];
  if (!categories.length || categories.length > 50) return json(c, { error: "Kategori tidak valid" }, 400);
  await validateOwnedRows(db, "categories", categories, household.id);
  if (categories.some((item) => typeof item.name !== "string" || !item.name.trim() || item.name.length > 60 || typeof item.pct !== "number" || !Number.isFinite(item.pct) || item.pct < 0 || item.pct > 100)) {
    return json(c, { error: "Alokasi kategori harus berada di antara 0% dan 100%" }, 400);
  }
  const statements = categories.map((item, sortOrder) => ({
    sql: "UPDATE categories SET name=?,pct=?,sort_order=? WHERE id=? AND household_id=?",
    args: [String(item.name).trim(), Number(item.pct), sortOrder, item.id, household.id],
  }));
  await db.batch(statements);
  return json(c, { ok: true });
});

app.put("/api/goals", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const household = await requireHousehold(c, user);
  const body = await readJson(c);
  const goals = Array.isArray(body.goals) ? body.goals : [];
  if (!goals.length || goals.length > 50) return json(c, { error: "Goals tidak valid" }, 400);
  await validateOwnedRows(db, "goals", goals, household.id);
  if (goals.some((item) => typeof item.name !== "string" || !item.name.trim() || item.name.length > 60 || !validMoney(item.target) || (item.initial_balance !== undefined && !validMoney(item.initial_balance)) || (item.target_date && !validDate(item.target_date)))) {
    return json(c, { error: "Goals tidak valid. Nominal harus bulat non-negatif dan tanggal berformat YYYY-MM-DD." }, 400);
  }
  const statements = goals.map((item, sortOrder) => ({
    sql: "UPDATE goals SET name=?,target=?,current=COALESCE(?,current),target_date=?,sort_order=? WHERE id=? AND household_id=?",
    args: [String(item.name).trim(), item.target, item.initial_balance ?? null, item.target_date || null, sortOrder, item.id, household.id],
  }));
  await db.batch(statements);
  return json(c, { ok: true });
});

app.put("/api/household", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const household = await requireHousehold(c, user);
  if (household.role !== "owner") return json(c, { error: "Hanya owner yang bisa mengubah pengaturan household" }, 403);
  const body = await readJson(c);
  const name = String(body.name ?? household.name).trim();
  const monthlyLimit = body.monthlyLimit ?? household.monthly_limit;
  if (!name || name.length > 100 || !validMoney(monthlyLimit)) {
    return json(c, { error: "Settings tidak valid" }, 400);
  }
  await db.execute({ sql: "UPDATE households SET name=?,monthly_limit=? WHERE id=?", args: [name, monthlyLimit, household.id] });
  return json(c, { ok: true });
});

app.post("/api/invites", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const household = await requireHousehold(c, user);
  if (household.role !== "owner") return json(c, { error: "Hanya owner yang bisa membuat invite" }, 403);
  const inviteToken = token(18);
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await db.execute({ sql: "INSERT INTO invites(token,household_id,created_by,expires_at) VALUES(?,?,?,?)", args: [inviteToken, household.id, user.id, expiresAt] });
  return json(c, { token: inviteToken, expiresAt, joinPath: `/?join=${encodeURIComponent(inviteToken)}` });
});

app.post("/api/invites/:token/join", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const inviteToken = String(c.req.param("token") || "").trim();
  const invite = await queryOne(db, "SELECT * FROM invites WHERE token=?", [inviteToken]);
  if (invite?.used_by === user.id) return json(c, { ok: true, householdId: invite.household_id });
  if (!invite || invite.used_by || invite.expires_at <= now()) return json(c, { error: "Invite tidak valid / sudah kedaluwarsa" }, 400);
  const member = await queryOne(db, "SELECT user_id FROM household_members WHERE household_id=? AND user_id=?", [invite.household_id, user.id]);
  if (member) return json(c, { ok: true, householdId: invite.household_id });
  const joinedAt = now();
  const result = await db.batch([
    { sql: "UPDATE invites SET used_by=? WHERE token=? AND used_by IS NULL AND expires_at>?", args: [user.id, inviteToken, joinedAt] },
    { sql: "INSERT OR IGNORE INTO household_members(household_id,user_id,role,joined_at) SELECT household_id,?,'member',? FROM invites WHERE token=? AND used_by=? AND expires_at>?", args: [user.id, joinedAt, inviteToken, user.id, joinedAt] },
  ]);
  if (!result[0].rowsAffected) return json(c, { error: "Invite sudah dipakai / kedaluwarsa" }, 400);
  return json(c, { ok: true, householdId: invite.household_id });
});

app.post("/api/receipts", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const household = await requireHousehold(c, user);
  const body = await readJson(c);
  const dataUrl = String(body.dataUrl || "");
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return json(c, { error: "Format gambar tidak didukung" }, 400);
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 1024 * 1024) return json(c, { error: "Maksimum ukuran nota 1 MB" }, 413);
  const signatures = {
    "image/png": bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    "image/jpeg": bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")),
    "image/webp": bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP",
  };
  if (bytes.length < 16 || bytes.toString("base64") !== match[2] || !signatures[match[1]]) return json(c, { error: "Gambar nota tidak valid" }, 400);
  const receiptId = id();
  await db.execute({ sql: "INSERT INTO receipts(id,household_id,data_url,created_at) VALUES(?,?,?,?)", args: [receiptId, household.id, dataUrl, now()] });
  return json(c, { ok: true, url: `/api/receipts/${receiptId}` });
});

app.get("/api/receipts/:id", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const receipt = await queryOne(db, `SELECT r.data_url FROM receipts r
    JOIN household_members m ON m.household_id=r.household_id
    WHERE r.id=? AND m.user_id=?`, [c.req.param("id"), user.id]);
  if (!receipt) return json(c, { error: "Nota tidak ditemukan" }, 404);
  const match = receipt.data_url.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return json(c, { error: "Nota tidak valid" }, 500);
  c.header("Content-Type", match[1]);
  c.header("Cache-Control", "private, no-store");
  return c.body(Buffer.from(match[2], "base64"));
});

app.get("/api/gmail/status", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  if (!user) return;
  const config = await googleOAuthConfig(db, c.env, c.req.url);
  const configured = isGoogleOAuthConfigured(config);
  return json(c, { configured, connected: configured && Boolean(await gmailToken(db, user.id)) });
});

app.get("/auth/google", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  if (!user) return;
  const config = await googleOAuthConfig(db, c.env, c.req.url);
  if (!isGoogleOAuthConfigured(config)) return c.text("Google OAuth belum diatur. Buka Settings sebagai superadmin.", 400);
  const state = token(24);
  await db.execute({ sql: "INSERT INTO oauth_states(state,user_id,expires_at) VALUES(?,?,?)", args: [state, user.id, new Date(Date.now() + 10 * 60000).toISOString()] });
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: "https://www.googleapis.com/auth/gmail.readonly", state });
  c.header("Location", `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  return c.body(null, 302);
});

app.get("/auth/google/callback", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  const state = c.req.query("state") || "";
  const savedState = await queryOne(db, "SELECT * FROM oauth_states WHERE state=?", [state]);
  if (!savedState || savedState.user_id !== user.id || new Date(savedState.expires_at) <= new Date()) return c.text("OAuth state tidak valid", 400);
  const consumed = await db.execute({ sql: "DELETE FROM oauth_states WHERE state=? AND user_id=?", args: [state, user.id] });
  if (!consumed.rowsAffected) return c.text("OAuth state sudah dipakai", 400);
  try {
    const exchanged = await exchangeCode(c, c.req.query("code") || "");
    const previous = (await gmailToken(db, savedState.user_id)) || {};
    await saveGmailToken(db, savedState.user_id, { ...previous, ...exchanged });
    c.header("Location", "/?gmail=connected");
    return c.body(null, 302);
  } catch (error) {
    return c.text(`Gmail connect gagal: ${error.message}`, 500);
  }
});

app.post("/api/gmail/disconnect", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  if (!user) return;
  await db.execute({ sql: "DELETE FROM gmail_tokens WHERE user_id=?", args: [user.id] });
  return json(c, { ok: true });
});

app.get("/api/gmail/candidates", async (c) => {
  const db = getDb(c.env.DB);
  const user = await requireUser(c);
  if (!user) return;
  try {
    const accessToken = await gmailAccess(c, user.id);
    const days = Math.min(Math.max(Number(c.req.query("days") || 30), 1), 365);
    const query = `newer_than:${days}d (receipt OR invoice OR payment OR transaction OR tagihan OR pembayaran OR order OR purchase OR kwitansi)`;
    const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const list = await listResponse.json();
    if (!listResponse.ok) throw new Error(list.error?.message || "Gmail list gagal");
    const items = [];
    for (const message of (list.messages || []).slice(0, 20)) {
      const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await messageResponse.json();
      if (!messageResponse.ok) continue;
      const payload = data.payload || {};
      const headers = payload.headers || [];
      const subject = headerValue(headers, "Subject");
      const from = headerValue(headers, "From");
      const rawDate = headerValue(headers, "Date");
      const text = `${subject} ${data.snippet || ""} ${stripHtml(flattenParts(payload).join(" ").slice(0, 120000))}`;
      const amount = parseMoney(text);
      if (amount) items.push({ id: message.id, subject, from, date: rawDate ? new Date(rawDate).toISOString() : now(), amount, snippet: (data.snippet || "").slice(0, 180) });
    }
    return json(c, { query, count: items.length, items });
  } catch (error) {
    return json(c, { error: error.message }, 500);
  }
});

export default app;
export { app };
