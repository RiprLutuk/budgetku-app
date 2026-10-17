ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','deleted'));
ALTER TABLE users ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_users_superadmin ON users(is_superadmin);
CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS protect_last_superadmin
BEFORE UPDATE OF is_superadmin,status ON users
WHEN OLD.is_superadmin=1 AND OLD.status='active'
  AND (NEW.is_superadmin=0 OR NEW.status!='active')
  AND (SELECT COUNT(*) FROM users WHERE is_superadmin=1 AND status='active')<=1
BEGIN SELECT RAISE(ABORT,'LAST_SUPERADMIN'); END;
CREATE TRIGGER IF NOT EXISTS protect_delete_last_superadmin
BEFORE DELETE ON users
WHEN OLD.is_superadmin=1 AND OLD.status='active'
  AND (SELECT COUNT(*) FROM users WHERE is_superadmin=1 AND status='active')<=1
BEGIN SELECT RAISE(ABORT,'LAST_SUPERADMIN'); END;
