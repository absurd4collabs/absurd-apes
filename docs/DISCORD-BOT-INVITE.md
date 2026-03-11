# Discord bot invite (raffle announcements)

The app posts to a Discord channel when:
- **A new raffle is created** — rich embed with prize image, name, ticket count, cost per ticket, and link
- **A raffle ends** — announcement with winner (wallet or Discord username if linked)

The bot needs: **View Channels**, **Send Messages**, **Embed Links**, and (for future slash commands) **Use Application Commands**.

---

## Create the invite link from the Developer Portal

1. Open **[Discord Developer Portal](https://discord.com/developers/applications)** and sign in.
2. Select your application (or create one: **New Application**).
3. Go to **OAuth2** → **URL Generator** in the left sidebar.
4. Under **SCOPES**, check:
   - **bot** — so the link adds the bot to the server
   - **applications.commands** — for future slash commands (e.g. track raffle progress)
5. Under **BOT PERMISSIONS**, check:
   - **View Channels**
   - **Send Messages**
   - **Embed Links**
6. At the bottom, copy the **Generated URL**. It will look like:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=2416167936&scope=bot%20applications.commands
   ```
   (Permission value `2416167936` = View Channels, Send Messages, Embed Links, Read Message History, Use Slash Commands, and related permissions.)

**Alternative (manual URL):**  
Replace `YOUR_APPLICATION_ID` with your **Application ID** (General → Application ID):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=2416167936&scope=bot%20applications.commands
```

---

## Share the invite with your server admin

Send your **server founder/admin** one of the following:

- **Option A — Professional invite page (recommended)**  
  Deploy the project (or run locally) and open:
  ```
  https://YOUR-SITE.com/discord-bot-invite.html?client_id=YOUR_APPLICATION_ID
  ```
  Replace `YOUR_APPLICATION_ID` with your app’s Application ID from the Developer Portal (General → Application ID). That page shows a short description and an **“Invite to server”** button. Share this link with your server admin in Discord or email; when they open it, they get a single clear “Invite to server” action.

- **Option B — Direct invite link**  
  Send the Generated URL from the Developer Portal. The admin opens it, selects the server, and authorizes the bot.

The admin must have **Manage Server** or **Administrator** on the server to add the bot.

---

## After the bot is in the server

1. **Get the channel ID** for the raffles channel:  
   Discord → **User Settings** → **App Settings** → **Advanced** → enable **Developer Mode**.  
   Right‑click the channel → **Copy channel ID**.

2. **Set env vars** (and restart / redeploy):
   - **`DISCORD_BOT_TOKEN`** — Same app → **Bot** → **Reset Token** → copy.
   - **`DISCORD_RAFFLE_CHANNEL_ID`** — The channel ID from above.

New raffles and winner announcements will then post to that channel.
