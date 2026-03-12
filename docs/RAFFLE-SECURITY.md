# Raffle system – security overview

## Critical fix applied

### Payment signer verification (ticket purchase)

**Risk:** An attacker could take someone else’s on-chain payment transaction signature and call the buy API with their own wallet. The server would see a valid payment to the treasury and could credit the attacker’s wallet instead of the real payer.

**Mitigation:** The server verifies that the payment transaction was **signed by the wallet claiming the tickets**. When you POST `/api/raffles/:id/buy` with `wallet=W`, the transaction’s signers (from the message header and account keys) must include `W`. Otherwise the request is rejected with: *"Payment transaction was not signed by the wallet claiming the tickets."*

---

## Implemented protections

| Area | Implementation |
|------|----------------|
| **Session cookie** | `secure: true` when `NODE_ENV === 'production'` so cookies are only sent over HTTPS. |
| **SESSION_SECRET** | Server refuses to start in production if `SESSION_SECRET` is unset or still the default value. |
| **Winner draw randomness** | Winner is chosen with `crypto.randomInt()` (cryptographically secure) weighted by ticket counts. |
| **Rate limiting** | **Create:** 10 requests per 15 minutes per IP. **Buy:** 30 per minute per IP. **Claim:** 20 per minute per IP. Uses `express-rate-limit`; responses include `Retry-After` when limited. |
| **Input validation** | **Wallet addresses:** Must be base58, length 32–44 chars (`isValidSolanaAddress`). **Raffle id:** Positive integer. **Ticket count (buy):** 1–1000 per request. **Ticket count (create):** 1–100,000. **paymentDestination:** Valid Solana address format. |
| **Signature replay** | Each payment transaction signature can be used only once (`raffle_payment_signatures`). |
| **Payment amount** | On-chain verification that the correct (or greater) amount was sent to the treasury/ATA. |
| **Raffle creation** | Admin-only; NFT transfer to prize wallet verified on-chain; prizeNftMint format validated. |
| **Claim** | Only the drawn winner; claim recorded once; wallet format validated. |
| **Database** | Parameterized queries; no raw user input in SQL. |

---

## Operational recommendations (not code)

| Area | Recommendation |
|------|----------------|
| **Prize wallet private key** | Restrict server access, use a secrets manager in production, rotate keys if compromise is suspected, keep only necessary funds in the prize wallet. |
| **Admin / session** | Keep `ADMIN_DISCORD_IDS` minimal; monitor admin actions; consider shorter session lifetime for sensitive roles. |
| **High-value raffles** | For very high stakes, consider an on-chain or verifiable random source (e.g. Switchboard VRF) and document the draw method. |

---

## Summary

- **Critical:** Payer verification ensures only the wallet that signed the payment receives tickets.
- **Implemented:** Secure cookies in production, mandatory strong `SESSION_SECRET` in production, cryptographic winner draw, rate limiting on create/buy/claim, strict input validation (wallet format, raffle id, ticket counts, addresses).
- **Operational:** Protect the prize wallet key and admin accounts; for very high-value raffles, consider verifiable randomness.
