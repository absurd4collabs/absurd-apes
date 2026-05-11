/* Built into solana-tx-deps.iife.js — load that file before @solana/web3.js in index.html */
import { Buffer } from 'buffer';
import BN from 'bn.js';

if (typeof globalThis !== 'undefined') {
  globalThis.Buffer = Buffer;
  globalThis.BN = BN;
}
