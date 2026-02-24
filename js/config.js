/**
 * Project config — Absurd Apes NFT & AAA token.
 * Edit values below for your deployment.
 */
window.ABSURD_APES_CONFIG = {
  // ——— Brand ———
  projectName: 'Absurd Apes',
  // ——— Embed (Open Graph / Twitter Cards) ———
  siteUrl: 'https://absurd-apes.vercel.app',
  siteTitle: 'Absurd Apes - NFT & Token',
  siteDescription: 'Absurd Apes NFT collection and AAA token on Solana.',
  ogImageUrl: 'assets/logo.png',
  tagline: 'ABSURD TOGETHER',
  logoUrl: 'assets/logo.png',

  // ——— Social ———
  social: {
    x: 'https://x.com/absurdartapes',
    discord: 'https://discord.gg/yFyErCkAyG',
  },
  // Optional: shop URL (if set, Shop link is shown in sidebar)
  shopUrl: '',

  // ——— Token ———
  token: {
    name: 'AAA',
    symbol: 'AAA',
    navLabel: 'AAA token',
    logoUrl: 'assets/logo.png',
    menuIconUrl: 'assets/coin-icon.svg',
    priceLabel: 'AAA (AAA / USD)',
    chartLabel: 'AAA / USD — 15m',
    summaryText: 'Absurd Apes project token. Verify holdings in the dashboard.',
  },

  // ——— Hero ———
  hero: {
    title: 'Absurd Apes',
    tagline: '',
    subtitle: 'Absurd Art Apes is a unique NFT project, built on Solana, that was created to address a very real issue facing artists today. It\'s an effort to raise awareness in web3 around the challenges artists face in trusting people to pay for their services.',
    solanaLogoUrl: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=040',
    backgroundImage: 'assets/hero-bg.png',
  },

  // ——— Footer ———
  footerCopy: 'Absurd Apes',

  // ——— Utilities ———
  utilitiesLead: 'Staking, partner utilities and external tools.',
  utilities: [
    {
      id: 'lunarverse',
      name: 'Lunarverse',
      description: 'Absurd Excursions — experiences and utilities on Lunarverse.',
      url: 'https://absurdexcursions.lunarverse.app/',
    },
    {
      id: 'gotm',
      name: 'GOTM Labz',
      description: 'Stake your NFTs and upgrade traits for Absurd Art Apes.',
      links: [
        { label: 'NFT Stake', url: 'https://www.nftstake.app/absurdartapes' },
        { label: 'Trait Store', url: 'https://www.traitstore.app/absurdartapes' },
      ],
    },
  ],

  // ——— Partners ———
  partnersLead: 'Platforms and tools integrated with Absurd Apes.',
  partnersPlaceholder: 'Adding soon',
  partners: [],

  // ——— Holders (labels; keys match server countKey: token, absurdApes, col2, totalNfts) ———
  holdingsLabels: {
    token: 'AAA',
    absurdApes: 'Absurd Art Apes',
    col2: 'Absurd Horizons',
    totalNfts: 'Total NFTs',
  },
  holdersLead: 'Top holders by AAA token and NFT collections.',
  holdersSortOptions: {
    token: 'AAA token',
    absurdApes: 'Absurd Art Apes NFTs',
    col2: 'Absurd Horizons NFTs',
  },

  // ——— Holder portal & API ———
  holderPortalUrl: '',
  endpoints: { holdings: '/api/holdings', discordAuth: '/api/discord/auth' },
  discordConnectUrl: '',
  tokenMint: 'D6p61cpMVByNQyt6cwHQe5CLW6CTixRucp7cFUnD7BWz',
  tokenDextoolsPairUrl: '',
  tokenBirdeyeUrl: 'https://birdeye.so/solana/token/D6p61cpMVByNQyt6cwHQe5CLW6CTixRucp7cFUnD7BWz',
  collections: {
    absurd_art_apes: 'https://magiceden.io/marketplace/absurd_art_apes',
    absurd_horizons: '#',
  },

  // ——— Absurd Horizons (coming soon) ———
  absurdHorizons: {
    imageUrl: 'assets/absurd-horizons.png',
    mintDate: '2026-03-01',
    mintLabel: 'Minting Sunday 1st March',
  },

  // ——— X spaces ———
  xSpacesImageUrl: 'assets/spaces.png',
  xSpacesLead: 'Tune in to our weekly X space...',
  xSpacesTime: 'Mondays @ 4pm est',
  xSpacesHosts: [
    { label: '@SkeetsANC', url: 'https://x.com/SkeetsANC' },
    { label: '@Cap_N_Chronic', url: 'https://x.com/Cap_N_Chronic' },
  ],
  xSpacesTagline: 'Community, alpha and vibes.',

  // ——— Pairs game (standalone page at /pairs) ———
  pairs: {
    turnsPerBuy: 5,
    costToken: 100000,
    gridCols: 6,
    gridRows: 4,
  },

  // ——— Team ———
  team: [
    { xProfileUrl: 'https://x.com/SkeetsANC', discordId: '1074064709101305918', description: 'Founder, Artist & Creative' },
    { xProfileUrl: 'https://x.com/Zippo1321', discordId: '971215759328030800', description: 'Head Mod & Game Coordinator' },
  ],
};
