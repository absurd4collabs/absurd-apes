# Deploy to Vercel — checklist

Use this when deploying so the team can test (including Raffles).

## 1. Repo and Vercel project

- Push the repo to GitHub.
- In [Vercel](https://vercel.com): **Add New** → **Project** → import the repo.
- **Framework Preset**: Other. **Root Directory**: (leave default).

## 2. Environment variables

In Vercel: **Project** → **Settings** → **Environment Variables**. Add these (same as your local `.env`):

| Variable | Required | Notes |
|----------|----------|--------|
| `SESSION_SECRET` | Yes | Long random string (e.g. 32+ chars). |
| `DISCORD_CLIENT_ID` | Yes (for Discord) | From Discord Developer Portal. |
| `DISCORD_CLIENT_SECRET` | Yes (for Discord) | From Discord Developer Portal. |
| `DATABASE_URL` | Yes (for Discord + Raffles) | PostgreSQL connection string (e.g. Neon). |
| `SITE_URL` | **Required for link embeds** | Your live URL, e.g. `https://your-app.vercel.app`. Used for `og:image` and `og:url` so shared links show the logo and description in Discord/Twitter/etc. |
| `HELIUS_API_KEY` | Yes (for Raffles + NFT) | From [Helius](https://dashboard.helius.dev). |
| `PRIZE_WALLET` | Yes (for Raffles) | Solana address for prize NFTs and (if unset) ticket payments. |
| `RAFFLE_TREASURY_WALLET` | Optional | Where ticket payments go; defaults to `PRIZE_WALLET`. |
| `ADMIN_DISCORD_IDS` | Yes (for Raffles admin) | Comma-separated Discord user IDs who can create raffles. |
| `AAA_TOKEN_MINT` | Optional | Project token mint for prices/verify/holders. |
| `DISCORD_BOT_TOKEN` | Optional | For Team section avatars and raffle announcements. |
| `DISCORD_RAFFLE_CHANNEL_ID` | Optional | Channel ID where the bot posts new raffles and winners. See [docs/DISCORD-BOT-INVITE.md](docs/DISCORD-BOT-INVITE.md) for the bot invite link. |
| `BIRDEYE_API_KEY` | Optional | For token chart. |

## 3. Discord callback URL

In [Discord Developer Portal](https://discord.com/developers/applications) → your app → **OAuth2** → **Redirects**:

- Add: `https://<your-vercel-domain>/api/discord/callback`  
  (e.g. `https://absurd-apes-xxx.vercel.app/api/discord/callback`)

## 4. Database migration (once per production DB)

Raffles and payment signatures need tables. From your machine (with production `DATABASE_URL` set or passed):

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

Or run the SQL from `scripts/db-migrate.js` in your DB’s SQL editor.

## 5. Deploy

- **Deploy** from the Vercel dashboard, or push to the connected branch.
- Build runs `npm run vercel-build` (injects `SITE_URL` into HTML, copies static files).

## 6. Test

- Open `https://your-app.vercel.app` and `https://your-app.vercel.app/raffles`.
- Log in with Discord, connect wallet, then test raffle list and ticket purchase.

## Troubleshooting

- **404 on /raffles**: Rewrites in `vercel.json` send `/raffles` to `/`; the app serves `index.html` and the client router handles `/raffles`.
- **Raffles or Discord not working**: Confirm `DATABASE_URL`, `HELIUS_API_KEY`, `PRIZE_WALLET`, and `ADMIN_DISCORD_IDS` are set in Vercel and that the migration has been run.
- **“Raffle treasury not configured”**: Set `RAFFLE_TREASURY_WALLET` or `PRIZE_WALLET` in Vercel.
