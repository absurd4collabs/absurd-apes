# Raffle full-flow test checklist (5 min, 1 ticket, you win & claim)

Use this before creating a raffle so you don’t waste SOL.

## 1. Env (already set in your .env)

- [x] `PRIZE_WALLET` – where the prize NFT is sent when you start the raffle
- [x] `PRIZE_WALLET_PRIVATE_KEY` – base58 secret for that wallet (needed for **Claim** to send NFT to winner)
- [x] `HELIUS_API_KEY` – RPC for NFT transfer verification and claim tx
- [x] `ADMIN_DISCORD_IDS` – your Discord ID so you can create raffles
- [x] `DATABASE_URL` – Neon DB for raffles/tickets
- [ ] `RAFFLE_TREASURY_WALLET` – optional; if unset, ticket payments go to `PRIZE_WALLET`

Discord bot/channel are optional for this test (embeds not required).

## 2. Before you create the raffle

1. **Log in with Discord** on the site (so admin panel and create are allowed).
2. **Connect the same wallet** you’ll use to buy the ticket and that owns the NFT you’ll use as the prize.
3. **Pick a prize NFT** in the admin panel (must be in the connected wallet; not compressed).
4. **Number of tickets:** set to **1** (so one ticket = sold out = you win).
5. **Ticket price:** set to the smallest amount you’re happy with (e.g. 0.001 SOL) so the buy tx is cheap.
6. **End date & time:** set to **~5 minutes from now**. The form’s minimum is already “now + 5 min”, so pick that or a bit later.
7. Click **Start raffle** → approve the **NFT transfer** in your wallet (sends the NFT to `PRIZE_WALLET`). After that, the raffle is created and appears in the list.

## 3. Buy the ticket

1. On the raffle card, enter **1** in the ticket field and click **Buy tickets**.
2. Approve the **payment** tx in your wallet (SOL or token to the treasury).
3. The list will refresh; you should see **1 / 1** tickets sold. Because the raffle is sold out, the winner is drawn the next time the list or raffle is loaded (no cron: draw happens on-demand when the API sees “ended by time or sold out”).

## 4. After 5 minutes (or immediately if sold out)

1. **Refresh the raffles list** (or wait for the in-page timer, which refetches every 5s when any raffle has ended).
2. Once the backend has drawn the winner, your raffle card will show **Ended** and a **Claim** button (only for the winning wallet).
3. **Connect the same wallet** that bought the ticket (that’s the winner).
4. Click **Claim** → server sends the prize NFT from `PRIZE_WALLET` to your wallet (you don’t sign a tx; the server signs with `PRIZE_WALLET_PRIVATE_KEY`).
5. You should see “Prize sent to your wallet” and the tx signature.

## 5. If something fails

- **Create fails after NFT transfer:** Server verifies the transfer (ATA, retries). If you see 400, wait a few seconds and try again without sending the NFT again; if it keeps failing, check server logs for the verification error.
- **Buy fails:** Payment verification can return “not found” briefly; the server retries. Ensure you’re paying the exact amount to the treasury address shown.
- **No Claim button:** Winner is drawn only when the raffle is fetched and (end time passed OR sold out). Refresh the list; if you’re the only entrant and sold out, you’re the winner and Claim will appear once the draw has run.
- **Claim fails:** Server needs `PRIZE_WALLET_PRIVATE_KEY` and the NFT must still be in the prize wallet. Check server logs.
