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
    title: 'ABSURD APES',
    tagline: "The Most Absurd Art you'll see in Web3",
    subtitle: "<p>The Absurd brand was introduced over 2 years ago in March 2024 with our very first NFT Collection \"Absurd Art Apes\".</p><p>We started as an art project, raising awareness for artists and now we have multiple utilities including NFT staking earning $AAA token and Trait store for ultimate customisation both provided by GOTM Labs, we also have Raffles and much more.</p><p>We are just getting started with huge plans for brand expansion including our second NFT collection \"Absurd Horizons\" MINTING NOW, Absurd Reserve airdropping $SOL on a monthly basis, token launch, Absurd Merch and the major step of bridging into Web2.</p><p>We Absurd, Expect Us.</p>",
    solanaLogoUrl: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=040',
    backgroundImage: 'assets/hero-bg.png',
  },

  // ——— Footer ———
  footerCopy: 'Absurd Apes',

  // ——— Utilities ———
  utilitiesLead: 'Staking, partner utilities and external tools.',
  utilities: [
    {
      id: 'gotm',
      name: 'GOTM Labz',
      description: 'Stake your NFTs and upgrade traits for Absurd Art Apes.',
      links: [
        { label: 'NFT Stake', url: 'https://www.gotmlabz.io/nftstake/absurdartapes' },
        { label: 'Trait Store', url: 'https://www.gotmlabz.io/traitstore/absurdartapes' },
      ],
    },
  ],
  utilitiesComingSoon: [
    {
      name: 'Absurd Reserve',
      image: 'assets/absurd-reserve.png',
      description: 'Locked liquidity for peace of mind to holders 🔒\nCompounding for constant growth for the vault ✅\nMonthly Solana airdrops that increase monthly 🪂',
    },
    {
      name: 'Absurd Portals',
      image: 'assets/absurd-portals.png',
      description: "We're bringing the minting madness back - bigger, wilder, and more absurd than ever!\n\nHere's the deal:\nYour Apes are about to step through mysterious portals into an alternate dimension. On the other side? A brand-new Ape with a fresh set of traits with new artwork. Think of it as re-rolling the dice with a shot at landing hyper-rare traits that unlock massive staking benefits.\n\nAll 400+ OG traits will be in the mix, PLUS brand-new exclusive traits that deliver real utility:\n• 💧 Staking drip boosts\n• 💰 SOL & NFT bounties",
      expandable: true,
    },
  ],

  // ——— Partners ———
  partnersLead: 'Platforms and tools integrated with Absurd Apes.',
  partnersPlaceholder: 'Adding soon',
  partners: [],

  // ——— Holders (labels; keys match server countKey: token, absurdApes, col2, totalNfts) ———
  holdingsLabels: {
    token: 'AAA',
    absurdApes: 'Apes',
    col2: 'Horizons',
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
  xSpacesTagline: 'Podcasting the most extraordinary minds, people and projects in Web3',

  // ——— Pairs game (standalone page at /pairs) ———
  pairs: {
    turnsPerBuy: 5,
    costToken: 100000,
    gridCols: 6,
    gridRows: 4,
  },

  // ——— Team (image, name, role, xProfileUrl — no Discord fetch) ———
  team: [
    { name: 'SkeetsANC', image: 'assets/team-skeets.png', role: 'Founder, Artist & Creative', xProfileUrl: 'https://x.com/SkeetsANC' },
    { name: 'zippo5118', image: 'assets/team-zippo.png', role: 'Head MOD, Games Coordinator', xProfileUrl: 'https://x.com/Zippo1321' },
    { name: 'capnchronic85', image: 'assets/team-capnchronic.png', role: 'MOD, Space Host', xProfileUrl: 'https://x.com/Cap_N_Chronic' },
    { name: 'shaawtyanc', image: 'assets/team-shaawty.png', role: 'Project Assistant, Advisor', xProfileUrl: 'https://x.com/ShaawtyANC' },
    { name: 'anonymous.__.', image: 'assets/team-anonymous.png', role: 'MOD, King Ding-a-ling', xProfileUrl: 'https://x.com/della_jonny' },
    { name: 'Tom [SLOTTO]', image: 'assets/team-tom.png', role: 'Website developer', xProfileUrl: 'https://x.com/BUXDAO' },
  ],
};
