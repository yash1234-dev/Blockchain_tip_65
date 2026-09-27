# The Praise Board

## Project

The Praise Board — a wallet-to-contract tip jar with public notes, deployed to Ethereum Sepolia.

## Problem

Ifeoma has kept her city's bus timetables online for three years, out of her own pocket, because
the transit authority only publishes scanned PDFs that go stale without warning. Nine thousand
people check her site every morning. Tip platforms take a cut, demand tax paperwork, and some
won't even onboard her. She wants the simplest possible thing: a page where a commuter connects a
wallet, sends her a few dollars with a short note, and watches their name go up on a live wall of
supporters — with nobody in the middle taking a cut or deciding who's allowed to give.

## Solution

A single small Solidity contract (`PraiseBoard.sol`) holds every tip and note on-chain. A React
page lets a commuter connect a browser wallet, send a real Sepolia-testnet tip with a note, and
watch it appear on a public wall built entirely from on-chain reads. Only the contract owner
(Ifeoma) can withdraw the accumulated balance. There is no backend, no database, and no custodian
in between the commuter and the contract.

## Architecture

```
Commuter's browser
      │
      ▼
  MetaMask (EIP-1193)
      │  signs "tip(note)" with msg.value
      ▼
Ethereum Sepolia  ──────────────►  PraiseBoard.sol
      ▲                                   │
      │ reads (getTips / owner)           │ stores Tip{sender, amount, note, timestamp}
      │                                   │ emits TipReceived
  React frontend  ◄─────────────────────┘
  (Vite, ethers v6, no backend)
```

The frontend reads the wall via a public, keyless Sepolia RPC endpoint (see
`READ_ONLY_RPC_URL` in `frontend/src/contract.ts`) so anyone can see the wall without connecting a
wallet. Sending a tip always goes through the visitor's own wallet, never through that read-only
endpoint.

## Contract

`contracts/PraiseBoard.sol` — deliberately small and auditable: one struct, one array, one main
event, three state-changing functions.

- `tip(string calldata note) external payable` — records a tip. Reverts (custom errors) if
  `msg.value == 0`, the note is empty, or the note exceeds 200 bytes.
- `getTips() external view returns (Tip[] memory)` — returns every tip ever recorded. Callable by
  anyone, for free (no gas, no transaction).
- `withdraw() external` — transfers the full contract balance to `owner`. Reverts if called by
  anyone else, or if the balance is zero.
- `tipCount()` / `getBalance()` — small read-only helpers.
- `owner` — set once, in the constructor, to the deploying address. Immutable afterwards.
- `TipReceived(address indexed sender, uint256 amount, string note, uint256 timestamp)` — emitted
  on every successful tip.
- `Withdrawn(address indexed owner, uint256 amount)` — emitted on withdrawal.

The contract is the **only** place a tip can be recorded. There is no off-chain database anywhere
in this project that a tip could be written to instead.

## Deployment

```text
Network: Ethereum Sepolia
Chain ID: 11155111
Deployed Contract Address: <NOT YET DEPLOYED - run `npm run deploy:sepolia`, see below>
Etherscan: <NOT YET DEPLOYED>
```

This project ships un-deployed: it was built without real QuickNode credentials or a funded
burner wallet in the environment, so no address has been invented. To deploy for real:

1. Create a QuickNode Ethereum Sepolia HTTP endpoint at <https://www.quicknode.com/>.
2. Create a disposable/testnet-only wallet and fund it with Sepolia ETH from a faucet, e.g.
   <https://www.alchemy.com/faucets/ethereum-sepolia> or <https://sepoliafaucet.com/>.
3. `cp .env.example .env` and fill in `QUICKNODE_SEPOLIA_URL` and `DEPLOYER_PRIVATE_KEY`.
4. `npm run deploy:sepolia`

The script (`scripts/deploy.ts`) prints the deployer address, network/chain ID, the deployed
contract address, the deployment transaction hash, and Etherscan links for both. Copy the printed
address into `CONTRACT_ADDRESS` in `frontend/src/contract.ts`, then update this README's
Deployment block above with the real address and Etherscan link.

## Setup

```bash
# from the project root
npm install
cp .env.example .env   # fill in QUICKNODE_SEPOLIA_URL and DEPLOYER_PRIVATE_KEY before deploying

# frontend, in a second terminal
cd frontend
npm install
```

## Environment

```env
QUICKNODE_SEPOLIA_URL=
DEPLOYER_PRIVATE_KEY=
```

`DEPLOYER_PRIVATE_KEY` must be a **testnet-only** burner key — never a key holding real funds.
`.env` is listed in `.gitignore` and must never be committed; only `.env.example` (placeholders)
is tracked.

## Commands

```bash
npm install
npm run compile
npm test
npm run deploy:sepolia
```

Then, for the frontend:

```bash
cd frontend
npm install
npm run dev      # local development server
npm run build    # production build (frontend/dist)
```

Before running the frontend for real use, set `CONTRACT_ADDRESS` in `frontend/src/contract.ts` to
the address printed by `npm run deploy:sepolia`.

## Trust model

The blockchain contract is the only source of truth. The frontend does not use MongoDB, Firebase,
localStorage, or any backend database to store or authorize wall entries — it calls the deployed
contract's `getTips()` (via a public, keyless Sepolia RPC endpoint) every time it needs to show the
wall, and refreshes from the contract again after a new tip's transaction is confirmed. Because of
this, **the frontend cannot fabricate, edit, or hide a supporter entry on its own** — every card on
the wall is exactly, and only, what `PraiseBoard.sol` has stored on Sepolia. If you disconnect the
frontend entirely and query the contract directly from Etherscan or `cast call`, you'll see the
same entries.

## Owner withdrawal

- **Who owns the funds:** the address that deployed the contract (`owner`, set once in the
  constructor and immutable afterwards) — in production, Ifeoma's own wallet.
- **Who can withdraw:** only `owner`. `withdraw()` reverts with `NotOwner` for any other caller.
- **Why commuters cannot withdraw:** a commuter's tip is a one-way payable call; nothing in the
  contract lets a sender reclaim or redirect funds once sent, by design — this is a tip jar, not an
  escrow.
- **Why the owner is stored on-chain:** so the rule is enforced by the contract itself, not by a
  server Claude or anyone else could tamper with. There's no admin panel or database flag that
  could quietly change who's allowed to withdraw.

The frontend only shows the "Owner tools" withdraw button when the connected wallet address
matches the on-chain `owner` address — there is no public withdrawal UI for anyone else.

## Failure handling

The frontend explicitly handles, with plain-language messages:

- **Wrong network** — shown as a clear "Wrong network" badge with a "Switch to Ethereum Sepolia"
  button that calls `wallet_switchEthereumChain` (falling back to `wallet_addEthereumChain` if the
  wallet doesn't have Sepolia configured yet). No transaction is ever sent on the wrong network.
- **Rejected wallet prompt** — detected via the wallet's `ACTION_REJECTED` / `4001` error code and
  shown as "You rejected the transaction in your wallet."
- **Failed / reverted transaction** — the contract's custom errors (`ZeroTip`, `EmptyNote`,
  `NoteTooLong`, `NotOwner`, `NothingToWithdraw`, `WithdrawFailed`) are decoded from the revert data
  and shown as friendly sentences instead of raw hex.
- **Insufficient Sepolia ETH** — detected from the provider's "insufficient funds" error and shown
  as a specific message.
- **Overlong note** — validated client-side (byte length, not character length, via
  `TextEncoder`) before the transaction is even sent, and also enforced on-chain by
  `MAX_NOTE_BYTES = 200`, so it can never be bypassed by calling the contract directly.
- **Missing contract address** — if `CONTRACT_ADDRESS` hasn't been set yet, the page shows a clear
  banner instead of silently failing.

Every transaction goes through explicit states shown in the UI: idle → connecting → awaiting
wallet confirmation → submitted/pending → confirmed (or rejected/failed). The app never claims
success before `tx.wait()` resolves with a successful receipt, and only refreshes the wall — so a
new tip only appears — after that confirmation.

## Security

- No private keys, seed phrases, or credentials are committed anywhere in this repository.
- `.env` is listed in `.gitignore`; only `.env.example` (placeholders, no real values) is tracked.
- `DEPLOYER_PRIVATE_KEY` must be a testnet-only burner key, funded only from a faucet. Never use a
  key that holds real assets.
- Deployment targets **Ethereum Sepolia only**. `hardhat.config.ts` defines no mainnet network.
- The frontend's read-only RPC endpoint (`READ_ONLY_RPC_URL`) is a public, keyless endpoint used
  only for reads (`getTips`, `owner`) — it never signs or sends transactions.

## Project structure

```text
praise-board/
  contracts/
    PraiseBoard.sol
  scripts/
    deploy.ts
  test/
    PraiseBoard.ts
  frontend/
    src/
      App.tsx
      main.tsx
      contract.ts
      styles.css
      eip1193.d.ts
    index.html
    package.json
    vite.config.ts
    tsconfig.json
  hardhat.config.ts
  package.json
  tsconfig.json
  .env.example
  .gitignore
  README.md
```

## Notes on the build environment

- Hardhat compiles Solidity using the exact solc build bundled by the `solc` npm package
  (`node_modules/solc/soljson.js`), referenced via `path` in `hardhat.config.ts`, instead of
  Hardhat's default binary downloader. This pins the compiler version exactly and keeps
  `npm run compile` working in network-restricted environments (CI runners, sandboxes) that can't
  reach `binaries.soliditylang.org` — it behaves identically to a normal Hardhat-downloaded
  compiler otherwise.
- This is Hardhat 3, using its current mocha + ethers testing/config API
  (`hardhat/config`'s `defineConfig`/`configVariable`, `network.create()` in scripts/tests) rather
  than Hardhat 2 patterns.
