# Discord bot invite (raffle announcements)

The app can post to a Discord channel when:
- **A new raffle is created** — message with prize name, ticket count, end time, and link to /raffles
- **A raffle ends** — message with prize name, winner wallet, and link to /raffles

To enable this:

## 1. Invite the bot to your server

Use this URL (replace `YOUR_APPLICATION_ID` with your **Application ID** from [Discord Developer Portal](https://discord.com/developers/applications) → your app → **General** → Application ID):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=2048&scope=bot
```

- **Permissions 2048** = Send Messages (required for the bot to post).
- Optional: add `&permissions=11264` for Send Messages + View Channel + Embed Links if you want richer embeds later.

Open the URL in a browser, choose your server, authorize. The bot will join.

## 2. Get the channel ID

1. In Discord: **User Settings** → **App Settings** → **Advanced** → enable **Developer Mode**.
2. Right‑click the channel where you want raffle posts → **Copy channel ID**.

## 3. Set env vars

- **`DISCORD_BOT_TOKEN`** — Same Discord app → **Bot** → **Reset Token** → copy. (You may already have this for the Team section.)
- **`DISCORD_RAFFLE_CHANNEL_ID`** — The channel ID from step 2.

Restart the server (or redeploy on Vercel). New raffles and drawn winners will be posted to that channel.
