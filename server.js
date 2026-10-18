import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { BACKFILL_GOAL_LINKS_SQL, GOAL_TRANSACTIONS_INDEX_SQL } from './lib/goals.js';
import apiApp from './api/index.js';
import { sqliteBinding } from './lib/sqlite-binding.js';

const __filename=fileURLToPath(import.meta.url), __dirname=path.dirname(__filename);
function loadEnv(file=path.join(__dirname,'.env')){try{for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const s=line.trim();if(!s||s.startsWith('#'))continue;const i=s.indexOf('=');if(i>0&&!process.env[s.slice(0,i)])process.env[s.slice(0,i)]=s.slice(i+1)}}catch{}}
loadEnv();
const PORT=Number(process.env.PORT||3000), DATA_DIR=path.resolve(__dirname,process.env.DATA_DIR||'data'), UPLOAD_DIR=path.join(DATA_DIR,'receipts'), PUBLIC_DIR=path.join(__dirname,'public');
fs.mkdirSync(UPLOAD_DIR,{recursive:true});
const db=new DatabaseSync(path.join(DATA_DIR,'budgetku.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL,is_superadmin INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',deleted_at TEXT);
CREATE TABLE IF NOT EXISTS households(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_id TEXT NOT NULL,monthly_limit INTEGER NOT NULL DEFAULT 15000000,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS household_members(household_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',joined_at TEXT NOT NULL,PRIMARY KEY(household_id,user_id));
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,household_id TEXT NOT NULL,name TEXT NOT NULL,pct REAL NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,household_id TEXT NOT NULL,user_id TEXT NOT NULL,type TEXT NOT NULL,amount INTEGER NOT NULL,note TEXT NOT NULL,category_id TEXT,goal_id TEXT,tx_date TEXT NOT NULL,need INTEGER NOT NULL DEFAULT 1,source TEXT NOT NULL DEFAULT 'manual',paid_by TEXT NOT NULL DEFAULT 'shared',receipt_url TEXT,external_ref TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS goals(id TEXT PRIMARY KEY,household_id TEXT NOT NULL,name TEXT NOT NULL,target INTEGER NOT NULL DEFAULT 0,current INTEGER NOT NULL DEFAULT 0,target_date TEXT,sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY,household_id TEXT NOT NULL,created_by TEXT NOT NULL,expires_at TEXT NOT NULL,used_by TEXT);
CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmail_tokens(user_id TEXT PRIMARY KEY,token_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,household_id TEXT NOT NULL,data_url TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS household_defaults(household_id TEXT PRIMARY KEY,initialized_at TEXT NOT NULL);`);

db.exec('BEGIN IMMEDIATE');
try {
  if (!db.prepare('PRAGMA table_info(transactions)').all().some((column) => column.name === 'goal_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN goal_id TEXT');
    db.exec(BACKFILL_GOAL_LINKS_SQL);
  }
  db.exec(GOAL_TRANSACTIONS_INDEX_SQL);
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  if (!userCols.includes('is_superadmin')) db.exec('ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0');
  if (!userCols.includes('status')) db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  if (!userCols.includes('deleted_at')) db.exec('ALTER TABLE users ADD COLUMN deleted_at TEXT');
  db.exec(fs.readFileSync(path.join(__dirname, 'migrations/0002_superadmin.sql'), 'utf8').replace(/^ALTER TABLE[^\n]+/gm, ''));
  for (const [table, column, definition] of [
    ['goals', 'purpose', "TEXT NOT NULL DEFAULT 'general' CHECK(purpose IN ('general','emergency'))"],
    ['households', 'essential_monthly', 'INTEGER NOT NULL DEFAULT 0 CHECK(essential_monthly>=0)'],
    ['transactions', 'version', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  db.exec(fs.readFileSync(path.join(__dirname, 'migrations/0003_financial_integrity.sql'), 'utf8').replace(/^ALTER TABLE[^\n]+/gm, ''));
  const superCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE is_superadmin=1 AND status='active'").get().count;
  if (!superCount) {
    const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
    if (firstUser) db.prepare("UPDATE users SET is_superadmin=1,status='active' WHERE id=?").run(firstUser.id);
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}



const DEFAULT_BUDGET=[['Kontrakan / Rumah',25],['Makan Harian',12],['Belanja Bulanan',8],['Pendidikan',10],['Transport',7],['Tagihan & Utilitas',5],['Kesehatan',3],['Dana Darurat',10],['Target Rumah',8],['Target Mobil',5],['Target Umroh',4],['Lifestyle',3]],DEFAULT_GOALS=[['Rumah',500000000],['Mobil',200000000],['Umroh',75000000]];
const now=()=>new Date().toISOString(), uid=()=>crypto.randomUUID(), token=(n=24)=>crypto.randomBytes(n).toString('base64url'), normEmail=s=>String(s||'').trim().toLowerCase();
function hashPassword(password,salt=token(16)){const hash=crypto.pbkdf2Sync(String(password),salt,120000,32,'sha256').toString('base64url');return `${salt}.${hash}`}
function verifyPassword(password,stored=''){const [salt,expected]=stored.split('.');if(!salt||!expected)return false;const actual=hashPassword(password,salt).split('.')[1];return crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected))}
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}))}
function sessionUser(req){const sid=cookies(req).budgetku_session;if(!sid)return null;const r=db.prepare(`SELECT u.id,u.email,u.name,u.is_superadmin,u.status,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?`).get(sid);return r&&r.status==='active'&&new Date(r.expires_at)>new Date()?r:null}
function householdFor(userId,hid){if(hid)return db.prepare(`SELECT h.*,m.role FROM households h JOIN household_members m ON m.household_id=h.id WHERE h.id=? AND m.user_id=?`).get(hid,userId);return db.prepare(`SELECT h.*,m.role FROM households h JOIN household_members m ON m.household_id=h.id WHERE m.user_id=? ORDER BY h.created_at LIMIT 1`).get(userId)}
function createHousehold(userId,name='Keluarga Kita'){const hid=uid();db.prepare(`INSERT INTO households(id,name,owner_id,created_at) VALUES(?,?,?,?)`).run(hid,name,userId,now());db.prepare(`INSERT INTO household_members(household_id,user_id,role,joined_at) VALUES(?,?,?,?)`).run(hid,userId,'owner',now());const c=db.prepare(`INSERT INTO categories(id,household_id,name,pct,sort_order) VALUES(?,?,?,?,?)`);DEFAULT_BUDGET.forEach(([n,p],i)=>c.run(uid(),hid,n,p,i));const g=db.prepare(`INSERT INTO goals(id,household_id,name,target,current,sort_order) VALUES(?,?,?,?,?,?)`);DEFAULT_GOALS.forEach(([n,t],i)=>g.run(uid(),hid,n,t,0,i));return hid}
function send(res,status,data,headers={}){const body=typeof data==='string'?data:JSON.stringify(data);res.writeHead(status,{'Content-Type':typeof data==='string'?'text/plain; charset=utf-8':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),...headers});res.end(body)}
function json(res,status,data,headers={}){send(res,status,data,headers)}
async function bodyJson(req){let total=0,chunks=[];for await(const ch of req){total+=ch.length;if(total>12*1024*1024)throw new Error('Payload terlalu besar');chunks.push(ch)}if(!chunks.length)return{};return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
function setSessionHeader(userId){const sid=token(32),exp=new Date(Date.now()+30*86400000).toISOString();db.prepare(`INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)`).run(sid,userId,exp);return `budgetku_session=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30*86400}${process.env.NODE_ENV==='production'?'; Secure':''}`}
const clients=new Map();function broadcast(hid){const p=`event: changed\ndata: ${JSON.stringify({householdId:hid,at:now()})}\n\n`;for(const c of clients.values())if(c.hid===hid)c.res.write(p)}
function mime(p){return p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.woff2')?'font/woff2':p.endsWith('.webmanifest')?'application/manifest+json':p.endsWith('.png')?'image/png':p.endsWith('.jpg')||p.endsWith('.jpeg')?'image/jpeg':p.endsWith('.webp')?'image/webp':'application/octet-stream'}
function staticFile(res,file){if(!fs.existsSync(file)||!fs.statSync(file).isFile())return false;const b=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime(file),'Content-Length':b.length});res.end(b);return true}
function requireAuth(req,res){const u=sessionUser(req);if(!u){json(res,401,{error:'Silakan login dulu'});return null}return u}
function requireHouse(req,res,u,url){const h=householdFor(u.id,req.headers['x-household-id']||url.searchParams.get('householdId'));if(!h){json(res,403,{error:'Tidak punya akses household'});return null}return h}


const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`), p=url.pathname;
  if(req.method==='GET'&&p==='/health')return json(res,200,{ok:true,db:'sqlite',realtimeClients:clients.size});
  if(p.startsWith('/api/auth/')||p.startsWith('/api/admin/')||p.startsWith('/api/account/')||p.startsWith('/api/gmail/')||p.startsWith('/auth/google')||p==='/api/me'||p==='/api/snapshot'||p==='/api/goals'||p.startsWith('/api/goals/')||p==='/api/transactions'||p.startsWith('/api/transactions/')||p==='/api/categories'||p==='/api/household') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1500000) return json(res, 413, {error:'Payload terlalu besar'});
      chunks.push(chunk);
    }
    const method = req.method || 'GET';
    const request = new Request(url, {method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
    const response = await apiApp.fetch(request, {...process.env,DB:sqliteBinding(db),REALTIME:'events'});
    if (response.ok && !['GET','HEAD'].includes(method)) {
      const user = sessionUser(req);
      const household = user && householdFor(user.id, req.headers['x-household-id'] || url.searchParams.get('householdId'));
      if (household) broadcast(household.id);
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  if(req.method==='GET'&&p==='/api/events'){const u=requireAuth(req,res);if(!u)return;const h=requireHouse(req,res,u,url);if(!h)return;res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});const cid=uid();clients.set(cid,{hid:h.id,res});res.write('event: ready\ndata: {}\n\n');const k=setInterval(()=>res.write(': ping\n\n'),25000);req.on('close',()=>{clearInterval(k);clients.delete(cid)});return}
  if(req.method==='POST'&&p==='/api/invites'){const u=requireAuth(req,res);if(!u)return;const h=requireHouse(req,res,u,url);if(!h)return;if(h.role!=='owner')return json(res,403,{error:'Hanya owner yang bisa membuat invite'});const t=token(18),exp=new Date(Date.now()+7*86400000).toISOString();db.prepare(`INSERT INTO invites(token,household_id,created_by,expires_at) VALUES(?,?,?,?)`).run(t,h.id,u.id,exp);return json(res,200,{token:t,expiresAt:exp,joinPath:`/?join=${encodeURIComponent(t)}`})}
  const join=p.match(/^\/api\/invites\/([^/]+)\/join$/);if(req.method==='POST'&&join){const u=requireAuth(req,res);if(!u)return;const t=decodeURIComponent(join[1]),inv=db.prepare(`SELECT * FROM invites WHERE token=?`).get(t);if(!inv||inv.used_by||new Date(inv.expires_at)<=new Date())return json(res,400,{error:'Invite tidak valid / sudah kedaluwarsa'});db.prepare(`INSERT OR IGNORE INTO household_members(household_id,user_id,role,joined_at) VALUES(?,?,?,?)`).run(inv.household_id,u.id,'member',now());db.prepare(`UPDATE invites SET used_by=? WHERE token=?`).run(u.id,t);broadcast(inv.household_id);return json(res,200,{ok:true,householdId:inv.household_id})}
  if(req.method==='POST'&&p==='/api/receipts'){const u=requireAuth(req,res);if(!u)return;const h=requireHouse(req,res,u,url);if(!h)return;const b=await bodyJson(req),m=String(b.dataUrl||'').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);if(!m)return json(res,400,{error:'Format gambar tidak didukung'});const buf=Buffer.from(m[2],'base64');if(buf.length>8*1024*1024)return json(res,413,{error:'Maksimum ukuran nota 8MB'});const ext=m[1].includes('png')?'png':m[1].includes('webp')?'webp':'jpg',fn=`${h.id}-${Date.now()}-${token(6)}.${ext}`;fs.writeFileSync(path.join(UPLOAD_DIR,fn),buf);return json(res,200,{ok:true,url:`/receipts/${fn}`})}
  if(p.startsWith('/receipts/')){const u=requireAuth(req,res);if(!u)return;const h=requireHouse(req,res,u,url);if(!h)return;const filename=path.basename(p);if(!filename.startsWith(`${h.id}-`))return json(res,404,{error:'Nota tidak ditemukan'});const file=path.resolve(UPLOAD_DIR,filename);res.setHeader('Cache-Control','private, no-store');if(staticFile(res,file))return;return json(res,404,{error:'Nota tidak ditemukan'})}
  if(req.method==='GET'){let rel=p==='/'?'index.html':p.replace(/^\//,'');if(rel.includes('..'))return send(res,400,'Bad path');const file=path.join(PUBLIC_DIR,rel);if(staticFile(res,file))return;if(staticFile(res,path.join(PUBLIC_DIR,'index.html')))return}
  return json(res,404,{error:'Not found'});
}catch(e){console.error(e);if(!res.headersSent)return json(res,500,{error:e.message});res.end()}});
server.listen(PORT,()=>console.log(`BudgetKu Family running on http://localhost:${PORT}`));
