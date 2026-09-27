/**
 * Contract configuration for The Praise Board frontend.
 *
 * CONTRACT_ADDRESS is intentionally blank until you deploy (see the root
 * README, "Deployment"). Run `npm run deploy:sepolia` from the project root,
 * then paste the printed contract address in below. The app shows a clear
 * "missing contract address" message until this is set.
 *
 * The ABI below was generated from the compiled PraiseBoard.sol artifact
 * (artifacts/contracts/PraiseBoard.sol/PraiseBoard.json) - it is not
 * hand-typed, so it matches the deployed bytecode exactly.
 */

export const CONTRACT_ADDRESS: string = "0xF7Ab76E753d6fAbc431EB1420E35aE9058AFA334";

export const SEPOLIA_CHAIN_ID = 11155111n;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"; // 11155111 in hex, used for wallet_switchEthereumChain
export const SEPOLIA_NETWORK_NAME = "Ethereum Sepolia";
export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";

// A public, keyless Sepolia RPC endpoint used ONLY to read the wall (getTips)
// so the wall loads for every visitor even before they connect a wallet.
// Sending transactions always goes through the visitor's own wallet
// (MetaMask), never through this endpoint - it is read-only in this app.
export const READ_ONLY_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export const MAX_NOTE_BYTES = 200;

export const PRAISE_BOARD_ABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [], name: "EmptyNote", type: "error" },
  { inputs: [], name: "NotOwner", type: "error" },
  {
    inputs: [
      { internalType: "uint256", name: "length", type: "uint256" },
      { internalType: "uint256", name: "maxLength", type: "uint256" },
    ],
    name: "NoteTooLong",
    type: "error",
  },
  { inputs: [], name: "NothingToWithdraw", type: "error" },
  { inputs: [], name: "WithdrawFailed", type: "error" },
  { inputs: [], name: "ZeroTip", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "string", name: "note", type: "string" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "TipReceived",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "Withdrawn",
    type: "event",
  },
  {
    inputs: [],
    name: "MAX_NOTE_BYTES",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTips",
    outputs: [
      {
        components: [
          { internalType: "address", name: "sender", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "string", name: "note", type: "string" },
          { internalType: "uint256", name: "timestamp", type: "uint256" },
        ],
        internalType: "struct PraiseBoard.Tip[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "note", type: "string" }],
    name: "tip",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "tipCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
] as const;

export type TipStruct = {
  sender: string;
  amount: bigint;
  note: string;
  timestamp: bigint;
};
