# Backup v2 and optional Google Drive

The settings page can download a full JSON backup at any time. New exports use format **v2** and contain the inventory ledger, supplier records, shifts, milk entries, prices, accounts, settlements, POS credentials, and audit events. Inventory balances are rebuilt from the immutable inventory ledger during restore.

Version-1 exports still restore safely, but they contain only the original inventory data. The settings page displays an explicit warning after a legacy restore.

## Google Drive setup

Google Drive is an optional backup destination, never a requirement for operating the POS or closing a shift. When Drive is disconnected or unavailable, the shift remains closed in MongoDB and a pending upload job is retained for later retry.

Create a Google OAuth Web application and configure this exact redirect URL:

```text
https://YOUR-DOMAIN/api/integrations/google-drive/callback
```

Set these production environment variables in Vercel:

```text
GOOGLE_OAUTH_CLIENT_ID=<Google OAuth client ID>
GOOGLE_OAUTH_CLIENT_SECRET=<Google OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR-DOMAIN/api/integrations/google-drive/callback
DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY=<base64-encoded random 32-byte key>
DAIRY_BACKUP_CRON_SECRET=<long random scheduler secret>
```

Generate the encryption key once and keep it unchanged while the Drive connection exists:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

After deployment, an owner uses **Settings → Google Drive → Connect**. The app asks Google only for `drive.file`, creates its own `Dairy System Backups` folder, stores the refresh token encrypted with AES-256-GCM, and never sends that token to the browser.

## Manual, retry, and weekly backups

- **Create Drive backup now** writes a full v2 backup job and immediately attempts upload.
- **Retry pending backups** retries jobs left by a temporary Drive error.
- Each closed supplier shift queues its canonical close snapshot for Drive without affecting the close result.
- The weekly scheduler endpoint is `GET /api/backups/weekly` with `Authorization: Bearer $DAIRY_BACKUP_CRON_SECRET`. Calls during the same ISO week share one job key, so repeated scheduler calls do not create duplicate weekly uploads.

Use distinct MongoDB databases and Drive OAuth settings for production and previews. Do not schedule preview deployments against production data, and do not commit any of these values.
