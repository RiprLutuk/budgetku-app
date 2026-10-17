const GOOGLE_KEYS = [
  "google_client_id",
  "google_client_secret",
  "google_redirect_uri",
];

export async function googleOAuthConfig(db, env = {}, requestUrl) {
  const result = await db.execute({
    sql: `SELECT key,value FROM app_settings WHERE key IN (?,?,?)`,
    args: GOOGLE_KEYS,
  });
  const stored = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  const saved = result.rows.length > 0;
  const defaultRedirect = requestUrl ? new URL('/auth/google/callback', requestUrl).href : '';
  return {
    clientId: saved ? stored.google_client_id || '' : String(env.GOOGLE_CLIENT_ID || ''),
    clientSecret: saved ? stored.google_client_secret || '' : String(env.GOOGLE_CLIENT_SECRET || ''),
    redirectUri: (saved ? stored.google_redirect_uri : env.GOOGLE_REDIRECT_URI) || defaultRedirect,
  };
}

export function isGoogleOAuthConfigured(config) {
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

export const GOOGLE_SETTING_KEYS = GOOGLE_KEYS;
