import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, parseEther, type Eip1193Provider } from "ethers";
import {
  CONTRACT_ADDRESS,
  MAX_NOTE_BYTES,
  PRAISE_BOARD_ABI,
  READ_ONLY_RPC_URL,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  SEPOLIA_EXPLORER_URL,
  SEPOLIA_NETWORK_NAME,
  type TipStruct,
} from "./contract.js";

type WalletStatus = "no-wallet" | "disconnected" | "connecting" | "connected";
type TxPhase = "idle" | "awaiting-signature" | "pending" | "confirmed" | "rejected" | "failed";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function formatTimestamp(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString();
}

/** Turns a thrown wallet/provider/contract error into a friendly sentence. */
function describeError(err: unknown, iface: import("ethers").Interface): string {
  const e = err as {
    code?: string | number;
    data?: string;
    error?: { data?: string };
    info?: { error?: { data?: string; message?: string } };
    shortMessage?: string;
    reason?: string;
    message?: string;
  };

  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
    return "You rejected the transaction in your wallet.";
  }

  const data = e?.data ?? e?.error?.data ?? e?.info?.error?.data;
  if (typeof data === "string") {
    try {
      const decoded = iface.parseError(data);
      if (decoded) {
        switch (decoded.name) {
          case "ZeroTip":
            return "Tip amount must be greater than zero.";
          case "EmptyNote":
            return "Please write a short note with your tip.";
          case "NoteTooLong": {
            const [length, maxLength] = decoded.args as unknown as [bigint, bigint];
            return `Note is too long (${length} bytes). Max is ${maxLength} bytes.`;
          }
          case "NotOwner":
            return "Only the contract owner can do that.";
          case "NothingToWithdraw":
            return "There is nothing to withdraw.";
          case "WithdrawFailed":
            return "The withdrawal transfer failed.";
          default:
            return `Transaction reverted: ${decoded.name}`;
        }
      }
    } catch {
      // fall through to generic messages below
    }
  }

  if (typeof e?.shortMessage === "string" && e.shortMessage.length > 0) return e.shortMessage;
  if (typeof e?.reason === "string" && e.reason.length > 0) return e.reason;
  if (typeof e?.message === "string") {
    if (e.message.toLowerCase().includes("insufficient funds")) {
      return "Insufficient Sepolia ETH to cover the tip and gas.";
    }
    return e.message;
  }
  return "Something went wrong sending the transaction.";
}

export default function App() {
  const hasContractAddress = CONTRACT_ADDRESS.trim().length > 0;

  const readOnlyContract = useMemo(() => {
    if (!hasContractAddress) return null;
    const provider = new JsonRpcProvider(READ_ONLY_RPC_URL);
    return new Contract(CONTRACT_ADDRESS, PRAISE_BOARD_ABI, provider);
  }, [hasContractAddress]);

  const [walletStatus, setWalletStatus] = useState<WalletStatus>(
    typeof window !== "undefined" && window.ethereum ? "disconnected" : "no-wallet",
  );
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<bigint | null>(null);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);

  const [tips, setTips] = useState<TipStruct[]>([]);
  const [loadingTips, setLoadingTips] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);

  const [amountEth, setAmountEth] = useState("0.001");
  const [note, setNote] = useState("");

  const [txPhase, setTxPhase] = useState<TxPhase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const [withdrawPhase, setWithdrawPhase] = useState<TxPhase>("idle");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawHash, setWithdrawHash] = useState<string | null>(null);

  const onCorrectNetwork = chainId !== null && chainId === SEPOLIA_CHAIN_ID;
  const isOwner =
    !!account && !!ownerAddress && account.toLowerCase() === ownerAddress.toLowerCase();

  const loadTips = useCallback(async () => {
    if (!readOnlyContract) return;
    setLoadingTips(true);
    setTipsError(null);
    try {
      const [rawTips, owner] = await Promise.all([
        readOnlyContract.getTips() as Promise<TipStruct[]>,
        readOnlyContract.owner() as Promise<string>,
      ]);
      const normalized = rawTips.map((t) => ({
        sender: t.sender,
        amount: t.amount,
        note: t.note,
        timestamp: t.timestamp,
      }));
      normalized.reverse(); // newest first
      setTips(normalized);
      setOwnerAddress(owner);
    } catch (err) {
      console.error(err);
      setTipsError("Could not read the wall from the contract. Check your connection and try again.");
    } finally {
      setLoadingTips(false);
    }
  }, [readOnlyContract]);

  useEffect(() => {
    loadTips();
  }, [loadTips]);

  const refreshWalletNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    const provider = new BrowserProvider(window.ethereum as unknown as Eip1193Provider);
    const network = await provider.getNetwork();
    setChainId(network.chainId);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const eth = window.ethereum;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        setAccount(null);
        setWalletStatus("disconnected");
      } else {
        setAccount(accounts[0]);
        setWalletStatus("connected");
      }
    };
    const handleChainChanged = () => {
      refreshWalletNetwork();
    };

    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);
    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged);
      eth.removeListener("chainChanged", handleChainChanged);
    };
  }, [refreshWalletNetwork]);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setWalletStatus("no-wallet");
      return;
    }
    setWalletStatus("connecting");
    try {
      const provider = new BrowserProvider(window.ethereum as unknown as Eip1193Provider);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      const network = await provider.getNetwork();
      setAccount(accounts[0] ?? null);
      setChainId(network.chainId);
      setWalletStatus(accounts.length > 0 ? "connected" : "disconnected");
    } catch (err) {
      console.error(err);
      setWalletStatus("disconnected");
    }
  }, []);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        // Chain not yet added to the wallet - offer to add it.
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID_HEX,
                chainName: SEPOLIA_NETWORK_NAME,
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: [READ_ONLY_RPC_URL],
                blockExplorerUrls: [SEPOLIA_EXPLORER_URL],
              },
            ],
          });
        } catch (addErr) {
          console.error(addErr);
        }
      } else {
        console.error(err);
      }
    } finally {
      await refreshWalletNetwork();
    }
  }, [refreshWalletNetwork]);

  const noteBytes = byteLength(note);
  const amountNumber = Number(amountEth);
  const formValid =
    walletStatus === "connected" &&
    onCorrectNetwork &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    note.trim().length > 0 &&
    noteBytes <= MAX_NOTE_BYTES;

  const sendTip = useCallback(async () => {
    if (!window.ethereum || !hasContractAddress) return;
    setTxError(null);
    setTxHash(null);

    if (walletStatus !== "connected") {
      setTxPhase("failed");
      setTxError("Connect your wallet first.");
      return;
    }
    if (!onCorrectNetwork) {
      setTxPhase("failed");
      setTxError(`Wrong network. Switch to ${SEPOLIA_NETWORK_NAME} and try again.`);
      return;
    }
    if (!(amountNumber > 0)) {
      setTxPhase("failed");
      setTxError("Enter a tip amount greater than zero.");
      return;
    }
    if (note.trim().length === 0) {
      setTxPhase("failed");
      setTxError("Write a short note with your tip.");
      return;
    }
    if (noteBytes > MAX_NOTE_BYTES) {
      setTxPhase("failed");
      setTxError(`Note is too long (${noteBytes} bytes). Max is ${MAX_NOTE_BYTES} bytes.`);
      return;
    }

    const provider = new BrowserProvider(window.ethereum as unknown as Eip1193Provider);
    const signer = await provider.getSigner();
    const contract = new Contract(CONTRACT_ADDRESS, PRAISE_BOARD_ABI, signer);

    try {
      setTxPhase("awaiting-signature");
      const tx = await contract.tip(note, { value: parseEther(amountEth) });
      setTxPhase("pending");
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      if (receipt && receipt.status === 1) {
        setTxPhase("confirmed");
        setNote("");
        await loadTips(); // only show the new tip after confirmation
      } else {
        setTxPhase("failed");
        setTxError("Transaction failed on-chain.");
      }
    } catch (err) {
      console.error(err);
      const message = describeError(err, contract.interface);
      const rejected =
        (err as { code?: string | number })?.code === "ACTION_REJECTED" ||
        (err as { code?: string | number })?.code === 4001;
      setTxPhase(rejected ? "rejected" : "failed");
      setTxError(message);
    }
  }, [amountEth, amountNumber, hasContractAddress, loadTips, note, noteBytes, onCorrectNetwork, walletStatus]);

  const withdraw = useCallback(async () => {
    if (!window.ethereum || !hasContractAddress) return;
    setWithdrawError(null);
    setWithdrawHash(null);

    const provider = new BrowserProvider(window.ethereum as unknown as Eip1193Provider);
    const signer = await provider.getSigner();
    const contract = new Contract(CONTRACT_ADDRESS, PRAISE_BOARD_ABI, signer);

    try {
      setWithdrawPhase("awaiting-signature");
      const tx = await contract.withdraw();
      setWithdrawPhase("pending");
      setWithdrawHash(tx.hash);
      const receipt = await tx.wait();
      if (receipt && receipt.status === 1) {
        setWithdrawPhase("confirmed");
      } else {
        setWithdrawPhase("failed");
        setWithdrawError("Withdrawal failed on-chain.");
      }
    } catch (err) {
      console.error(err);
      const message = describeError(err, contract.interface);
      const rejected =
        (err as { code?: string | number })?.code === "ACTION_REJECTED" ||
        (err as { code?: string | number })?.code === 4001;
      setWithdrawPhase(rejected ? "rejected" : "failed");
      setWithdrawError(message);
    }
  }, [hasContractAddress]);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-inner">
          <p className="eyebrow">On-chain tip jar &middot; {SEPOLIA_NETWORK_NAME} testnet</p>
          <h1>The Praise Board</h1>
          <p className="subtitle">
            Ifeoma keeps the city's bus timetables online, out of her own pocket. Connect a wallet,
            send a few dollars of testnet ETH with a short note, and your name goes straight onto
            the wall below - read from the blockchain itself, with nobody in the middle taking a
            cut or deciding who's allowed to give.
          </p>
          <WalletBar
            walletStatus={walletStatus}
            account={account}
            chainId={chainId}
            onConnect={connectWallet}
            onSwitch={switchToSepolia}
          />
        </div>
      </header>

      <main className="content">
        {!hasContractAddress && (
          <div className="banner banner-warn">
            <strong>Missing contract address.</strong> This app hasn't been pointed at a deployed
            PraiseBoard contract yet. Deploy it with <code>npm run deploy:sepolia</code> from the
            project root, then set <code>CONTRACT_ADDRESS</code> in{" "}
            <code>frontend/src/contract.ts</code>.
          </div>
        )}

        <section className="panel">
          <h2>Send a tip</h2>
          <TipForm
            amountEth={amountEth}
            setAmountEth={setAmountEth}
            note={note}
            setNote={setNote}
            noteBytes={noteBytes}
            walletStatus={walletStatus}
            onCorrectNetwork={onCorrectNetwork}
            formValid={formValid}
            hasContractAddress={hasContractAddress}
            txPhase={txPhase}
            txHash={txHash}
            txError={txError}
            onConnect={connectWallet}
            onSwitch={switchToSepolia}
            onSend={sendTip}
          />
        </section>

        {isOwner && (
          <section className="panel owner-panel">
            <h2>Owner tools</h2>
            <p className="muted">
              You're connected as the contract owner. Only this account can withdraw the
              accumulated balance.
            </p>
            <button
              className="btn btn-secondary"
              onClick={withdraw}
              disabled={withdrawPhase === "awaiting-signature" || withdrawPhase === "pending"}
            >
              {withdrawPhase === "awaiting-signature"
                ? "Confirm in wallet..."
                : withdrawPhase === "pending"
                  ? "Withdrawing..."
                  : "Withdraw balance"}
            </button>
            {withdrawHash && (
              <p className="tx-line">
                <a href={`${SEPOLIA_EXPLORER_URL}/tx/${withdrawHash}`} target="_blank" rel="noreferrer">
                  View withdrawal on Etherscan
                </a>
              </p>
            )}
            {withdrawPhase === "confirmed" && <p className="status status-ok">Withdrawal confirmed.</p>}
            {withdrawError && <p className="status status-error">{withdrawError}</p>}
          </section>
        )}

        <section className="panel">
          <div className="panel-header">
            <h2>The wall</h2>
            <button className="btn btn-ghost" onClick={loadTips} disabled={loadingTips}>
              {loadingTips ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <p className="muted">
            Every card below is read directly from the PraiseBoard contract on{" "}
            {SEPOLIA_NETWORK_NAME}. This page cannot add, edit, or fake an entry - it can only
            display what the blockchain already stored.
          </p>
          {tipsError && <p className="status status-error">{tipsError}</p>}
          <PraiseWall tips={tips} loading={loadingTips} />
        </section>
      </main>

      <footer className="footer">
        <p>
          Contract source of truth on {SEPOLIA_NETWORK_NAME}
          {hasContractAddress && (
            <>
              {" "}
              &middot;{" "}
              <a href={`${SEPOLIA_EXPLORER_URL}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
                View contract on Etherscan
              </a>
            </>
          )}
        </p>
      </footer>
    </div>
  );
}

function WalletBar({
  walletStatus,
  account,
  chainId,
  onConnect,
  onSwitch,
}: {
  walletStatus: WalletStatus;
  account: string | null;
  chainId: bigint | null;
  onConnect: () => void;
  onSwitch: () => void;
}) {
  if (walletStatus === "no-wallet") {
    return (
      <div className="wallet-bar">
        <span className="badge badge-warn">No wallet detected</span>
        <p className="muted small">
          Install{" "}
          <a href="https://metamask.io/" target="_blank" rel="noreferrer">
            MetaMask
          </a>{" "}
          (or another EIP-1193 wallet) to send a tip.
        </p>
      </div>
    );
  }

  if (walletStatus === "disconnected") {
    return (
      <div className="wallet-bar">
        <button className="btn btn-primary" onClick={onConnect}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (walletStatus === "connecting") {
    return (
      <div className="wallet-bar">
        <span className="badge badge-neutral">Connecting...</span>
      </div>
    );
  }

  const onCorrectNetwork = chainId !== null && chainId === SEPOLIA_CHAIN_ID;

  return (
    <div className="wallet-bar">
      <span className="badge badge-ok">{account ? shortenAddress(account) : "Connected"}</span>
      {onCorrectNetwork ? (
        <span className="badge badge-ok">{SEPOLIA_NETWORK_NAME}</span>
      ) : (
        <>
          <span className="badge badge-warn">
            Wrong network{chainId !== null ? ` (chain ${chainId.toString()})` : ""}
          </span>
          <button className="btn btn-secondary" onClick={onSwitch}>
            Switch to {SEPOLIA_NETWORK_NAME}
          </button>
        </>
      )}
    </div>
  );
}

function TipForm({
  amountEth,
  setAmountEth,
  note,
  setNote,
  noteBytes,
  walletStatus,
  onCorrectNetwork,
  formValid,
  hasContractAddress,
  txPhase,
  txHash,
  txError,
  onConnect,
  onSwitch,
  onSend,
}: {
  amountEth: string;
  setAmountEth: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  noteBytes: number;
  walletStatus: WalletStatus;
  onCorrectNetwork: boolean;
  formValid: boolean;
  hasContractAddress: boolean;
  txPhase: TxPhase;
  txHash: string | null;
  txError: string | null;
  onConnect: () => void;
  onSwitch: () => void;
  onSend: () => void;
}) {
  const busy = txPhase === "awaiting-signature" || txPhase === "pending";
  const overLimit = noteBytes > MAX_NOTE_BYTES;

  return (
    <div className="tip-form">
      <label className="field">
        <span>Amount (ETH, Sepolia testnet)</span>
        <input
          type="number"
          min="0"
          step="0.0001"
          value={amountEth}
          onChange={(e) => setAmountEth(e.target.value)}
          disabled={busy}
        />
      </label>

      <label className="field">
        <span>Note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={400}
          rows={3}
          placeholder="Thanks for keeping the bus timetable online!"
          disabled={busy}
        />
        <span className={`byte-counter ${overLimit ? "byte-counter-over" : ""}`}>
          {noteBytes} / {MAX_NOTE_BYTES} bytes
        </span>
      </label>

      {walletStatus === "no-wallet" && (
        <p className="status status-warn">Install a browser wallet like MetaMask to send a tip.</p>
      )}
      {walletStatus === "disconnected" && (
        <button className="btn btn-primary" onClick={onConnect}>
          Connect Wallet to Tip
        </button>
      )}
      {walletStatus === "connected" && !onCorrectNetwork && (
        <div>
          <p className="status status-warn">Wrong network - switch to {SEPOLIA_NETWORK_NAME} first.</p>
          <button className="btn btn-secondary" onClick={onSwitch}>
            Switch to {SEPOLIA_NETWORK_NAME}
          </button>
        </div>
      )}
      {walletStatus === "connected" && onCorrectNetwork && (
        <button className="btn btn-primary" onClick={onSend} disabled={!formValid || busy || !hasContractAddress}>
          {txPhase === "awaiting-signature"
            ? "Confirm in wallet..."
            : txPhase === "pending"
              ? "Sending tip..."
              : "Send Tip"}
        </button>
      )}

      {txHash && (
        <p className="tx-line">
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
            View transaction on Etherscan
          </a>
        </p>
      )}
      {txPhase === "confirmed" && (
        <p className="status status-ok">Tip confirmed - thank you! It's on the wall below.</p>
      )}
      {txPhase === "rejected" && <p className="status status-warn">{txError ?? "Transaction rejected."}</p>}
      {txPhase === "failed" && <p className="status status-error">{txError ?? "Something went wrong."}</p>}
    </div>
  );
}

function PraiseWall({ tips, loading }: { tips: TipStruct[]; loading: boolean }) {
  if (loading && tips.length === 0) {
    return <p className="muted">Loading the wall from the contract...</p>;
  }
  if (tips.length === 0) {
    return <p className="muted">No tips yet - be the first to support the timetable.</p>;
  }
  return (
    <div className="wall-grid">
      {tips.map((t, i) => (
        <article className="tip-card" key={`${t.sender}-${t.timestamp.toString()}-${i}`}>
          <div className="tip-card-header">
            <span className="tip-sender">{shortenAddress(t.sender)}</span>
            <span className="tip-amount">{formatEther(t.amount)} ETH</span>
          </div>
          <p className="tip-note">{t.note}</p>
          <p className="tip-timestamp">{formatTimestamp(t.timestamp)}</p>
        </article>
      ))}
    </div>
  );
}
