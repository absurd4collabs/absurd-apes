# Absurd Apes — NFT & Token site

Official site for Absurd Apes: collections, AAA token, holders, team, Discord login, and verify holdings.

## Quick start

```bash
npm install
cp .env.example .env
```

Edit **`.env`**: set `BASE_URL`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`. Optionally add `DISCORD_BOT_TOKEN` (for Team section avatars), `HELIUS_API_KEY`, `AAA_TOKEN_MINT` (or `TOKEN_MINT`), collection mints, `BIRDEYE_API_KEY` (for token chart). For **Discord logins saved to DB** and **holders table showing Discord names** (with multiple wallets per user merged into one row), set `DATABASE_URL` and run the migration once (see **Database** below).

```bash
npm start
```

Open `http://localhost:3000`.

## Discord login

1. [Discord Developer Portal](https://discord.com/developers/applications) → create or use an application.
2. **OAuth2 → Redirects**: add `http://localhost:3000/api/discord/callback` (local) and `https://yourdomain.com/api/discord/callback` (production).
3. Copy **Application ID** → `DISCORD_CLIENT_ID`, and **Client Secret** → `DISCORD_CLIENT_SECRET` in `.env`.
4. For **Team** section avatars: same app → **Bot** → create/reset token → `DISCORD_BOT_TOKEN` in `.env`.

## Database (Neon PostgreSQL)

Used for: saving Discord logins, linking wallets to Discord (via Verify), Pairs game state, and the **holders table** (Discord names for linked holders, multiple wallets per Discord user merged into one row).

1. Create a database at [Neon](https://neon.tech) (or any PostgreSQL).
2. In **`.env`** set `DATABASE_URL=postgresql://user:pass@host/db?sslmode=require`.
3. Run the migration once: `npm run db:migrate` (creates `users`, `wallets`, `pairs_state`, `pairs_buys`).
4. In production (e.g. Vercel), add the same `DATABASE_URL` to environment variables. Run `npm run db:migrate` locally against that URL once, or use Neon’s SQL editor to run the schema from `scripts/db-migrate.js`.

After this, Discord logins are stored in `users`, and when a user **Verify**s (Discord + wallet), the wallet is linked in `wallets`. The holders table then shows Discord names for linked holders and aggregates all wallets with the same Discord ID into one entry.

## Deploy to Vercel

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com) as a new project.
2. **Framework**: Other. **Root Directory**: (leave default).
3. **Environment Variables**: add the same as `.env` (`BASE_URL` = your Vercel URL, `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and optionally `HELIUS_API_KEY`, `AAA_TOKEN_MINT`, `DISCORD_BOT_TOKEN`, `BIRDEYE_API_KEY`, collection mints, `DATABASE_URL` for Discord/holders and Pairs).
4. In Discord, add redirect: `https://<your-vercel-domain>/api/discord/callback`.
5. Deploy.

## Project config

Site copy and links are in **`js/config.js`** (project name, token, hero, footer, team, social, etc.). Edit there to change branding or team members. Team entries use `xProfileUrl`, `discordId`, and `description`; with `DISCORD_BOT_TOKEN` set, the site fetches Discord usernames and avatars.

## Static-only (no backend)

To serve only the static files (no Discord login or API): use any static server (e.g. `npx serve .`). API and Discord features will not work unless you point to an external backend via config.
