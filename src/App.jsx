import { useState, useEffect } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createSetAuthorityInstruction,
  AuthorityType,
  createBurnInstruction,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import { clusterApiUrl } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { 
  createMetadataAccountV3,
  findMetadataPda,
  mplTokenMetadata,
} from '@metaplex-foundation/mpl-token-metadata';
import { publicKey, transactionBuilder } from '@metaplex-foundation/umi';
import { fromWeb3JsPublicKey, toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters';

function App() {
  const [wallet, setWallet] = useState(null);
  const [walletPublicKey, setWalletPublicKey] = useState(null);
  const [connection] = useState(
    new Connection('https://solana-mainnet.api.syndica.io/api-key/21P91u6oC24BUjduDPBnPEdmPWWz7fmFp3jtMBY52Mgq5j1CE9sjKbUv1TzPZGan2pKeDg289fHqvdP6UK5cAHhyJmuHSLE2qm', 'confirmed')
    // new Connection(clusterApiUrl('devnet'), 'confirmed')
  );
  const [mintAddress, setMintAddress] = useState('');
  const [burnAmount, setBurnAmount] = useState('');
  const [lpMintAddress, setLpMintAddress] = useState('');
  const [lpLockAmount, setLpLockAmount] = useState('');
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  
  // Metadata form fields
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenUri, setTokenUri] = useState('');

  useEffect(() => {
    checkIfWalletConnected();
  }, []);

  const addLog = (message, type = 'info') => {
    const newLog = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date().toLocaleTimeString(),
    };
    setLogs((prev) => [newLog, ...prev]);

    // Add toast notification
    switch (type) {
      case 'success':
        toast.success(message);
        break;
      case 'error':
        toast.error(message);
        break;
      case 'warning':
        toast.warning(message);
        break;
      default:
        toast.info(message);
    }
  };

  const checkIfWalletConnected = async () => {
    try {
      const { solana } = window;
      if (solana?.isPhantom && solana.isConnected) {
        const response = await solana.connect({ onlyIfTrusted: true });
        setWallet(response.publicKey.toString());
        setWalletPublicKey(response.publicKey);
        setIsConnected(true);
        addLog(
          `Auto-connected: ${response.publicKey.toString().slice(0, 4)}...${response.publicKey
            .toString()
            .slice(-4)}`,
          'success'
        );
      }
    } catch (error) {
      console.log('Wallet not auto-connected');
    }
  };

  const connectWallet = async () => {
    try {
      const { solana } = window;

      if (!solana || !solana.isPhantom) {
        window.open('https://phantom.app/', '_blank');
        addLog('Phantom wallet not found. Opening download page...', 'error');
        return;
      }

      addLog('Connecting to Phantom wallet...', 'info');
      const response = await solana.connect();
      setWallet(response.publicKey.toString());
      setWalletPublicKey(response.publicKey);
      setIsConnected(true);

      addLog(
        `Wallet connected: ${response.publicKey.toString().slice(0, 4)}...${response.publicKey
          .toString()
          .slice(-4)}`,
        'success'
      );
    } catch (error) {
      addLog(`Connection failed: ${error.message}`, 'error');
    }
  };

  const disconnectWallet = async () => {
    try {
      const { solana } = window;
      if (solana) {
        await solana.disconnect();
        setWallet(null);
        setWalletPublicKey(null);
        setIsConnected(false);
        addLog('Wallet disconnected', 'info');
      }
    } catch (error) {
      addLog(`Disconnect failed: ${error.message}`, 'error');
    }
  };

  const getProvider = () => {
    if ('phantom' in window) {
      const provider = window.phantom?.solana;
      if (provider?.isPhantom) {
        return provider;
      }
    }
    if ('solana' in window) {
      const provider = window.solana;
      if (provider?.isPhantom) {
        return provider;
      }
    }
    throw new Error('Phantom wallet not found');
  };

  const sendTransaction = async (transaction) => {
    try {
      const provider = getProvider();
      
      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPublicKey;
  
      // Sign transaction with Phantom
      const signedTransaction = await provider.signTransaction(transaction);
      
      // Send the signed transaction
      const signature = await connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );
  
      // Confirm the transaction
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );
  
      if (confirmation.value.err) {
        throw new Error('Transaction failed');
      }
  
      return signature;
    } catch (error) {
      console.error('Transaction error:', error);
      throw error;
    }
  };

  // Determine if token is Token-2022 or legacy
  const determineTokenProgram = async (mintPubkey) => {
    try {
      // Try Token-2022 first
      try {
        await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
        return TOKEN_2022_PROGRAM_ID;
      } catch (e) {
        // If Token-2022 fails, try legacy
        await getMint(connection, mintPubkey, 'confirmed', TOKEN_PROGRAM_ID);
        return TOKEN_PROGRAM_ID;
      }
    } catch (error) {
      throw new Error('Invalid mint address or token not found');
    }
  };

  const addMetadata = async () => {
    try {
      if (!walletPublicKey) {
        addLog('Please connect your wallet first', 'error');
        return;
      }
      if (!mintAddress) {
        addLog('Please enter token mint address', 'error');
        return;
      }
      if (!tokenName || !tokenSymbol || !tokenUri) {
        addLog('Please fill in all metadata fields (Name, Symbol, URI)', 'error');
        return;
      }
  
      addLog('Detecting token type...', 'info');
      const mint = new PublicKey(mintAddress);
      
      // Determine token program
      const tokenProgram = await determineTokenProgram(mint);
      const isToken22 = tokenProgram.equals(TOKEN_2022_PROGRAM_ID);
      
      addLog(`Token type detected: ${isToken22 ? 'Token-2022' : 'Legacy SPL Token'}`, 'info');
      addLog('Creating metadata...', 'info');
  
      // Create UMI instance
      const umi = createUmi(connection.rpcEndpoint)
        .use(mplTokenMetadata());
  
      // Convert to UMI public keys
      const mintUmi = publicKey(mintAddress);
      const updateAuthorityUmi = publicKey(walletPublicKey.toBase58());
  
      // Find metadata PDA
      const metadataPda = findMetadataPda(umi, { mint: mintUmi });
  
      // Create metadata instruction
      const createMetadataIx = createMetadataAccountV3(umi, {
        metadata: metadataPda,
        mint: mintUmi,
        mintAuthority: updateAuthorityUmi,
        payer: updateAuthorityUmi,
        updateAuthority: updateAuthorityUmi,
        data: {
          name: tokenName,
          symbol: tokenSymbol,
          uri: tokenUri,
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      });
  
      // Get the instruction and convert to web3.js
      const instruction = createMetadataIx.getInstructions()[0];
      const web3Instruction = toWeb3JsInstruction(instruction);
      
      // Create and send transaction
      const transaction = new Transaction().add(web3Instruction);
      const signature = await sendTransaction(transaction);
  
      addLog('✅ Metadata added successfully!', 'success');
      addLog(`TX: https://solscan.io/tx/${signature}`, 'success');
      
      // Clear form
      setTokenName('');
      setTokenSymbol('');
      setTokenUri('');
    } catch (error) {
      addLog(`❌ Error: ${error.message}`, 'error');
      console.error('Metadata error:', error);
    }
  };

  const revokeMintAuthority = async () => {
    try {
      if (!walletPublicKey) {
        addLog('Please connect your wallet first', 'error');
        return;
      }
      if (!mintAddress) {
        addLog('Please enter token mint address', 'error');
        return;
      }

      addLog('Revoking mint authority...', 'info');

      const mint = new PublicKey(mintAddress);
      const tokenProgram = await determineTokenProgram(mint);
      const transaction = new Transaction();

      const instruction = createSetAuthorityInstruction(
        mint,
        walletPublicKey,
        AuthorityType.MintTokens,
        null,
        [],
        tokenProgram
      );

      transaction.add(instruction);
      const signature = await sendTransaction(transaction);

      addLog('✅ Mint authority revoked!', 'success');
      addLog(`TX: https://solscan.io/tx/${signature}`, 'success');
    } catch (error) {
      addLog(`❌ Error: ${error.message}`, 'error');
    }
  };

  const revokeFreezeAuthority = async () => {
    try {
      if (!walletPublicKey) {
        addLog('Please connect your wallet first', 'error');
        return;
      }
      if (!mintAddress) {
        addLog('Please enter token mint address', 'error');
        return;
      }

      addLog('Revoking freeze authority...', 'info');

      const mint = new PublicKey(mintAddress);
      const tokenProgram = await determineTokenProgram(mint);
      const transaction = new Transaction();

      const instruction = createSetAuthorityInstruction(
        mint,
        walletPublicKey,
        AuthorityType.FreezeAccount,
        null,
        [],
        tokenProgram
      );

      transaction.add(instruction);
      const signature = await sendTransaction(transaction);

      addLog('✅ Freeze authority revoked!', 'success');
      addLog(`TX: https://solscan.io/tx/${signature}`, 'success');
    } catch (error) {
      addLog(`❌ Error: ${error.message}`, 'error');
    }
  };

  const burnTokens = async () => {
    try {
      if (!walletPublicKey) {
        addLog('Please connect your wallet first', 'error');
        return;
      }
      if (!mintAddress) {
        addLog('Please enter token mint address', 'error');
        return;
      }
      if (!burnAmount || burnAmount <= 0) {
        addLog('Please enter a valid burn amount', 'error');
        return;
      }
  
      addLog(`Burning ${burnAmount} tokens...`, 'info');

      const mint = new PublicKey(mintAddress);
      const tokenProgram = await determineTokenProgram(mint);
      
      // Get the associated token account
      const tokenAccount = await getAssociatedTokenAddress(mint, walletPublicKey, false, tokenProgram);
      
      // IMPORTANT: Check if the account exists and has the right data
      const accountInfo = await connection.getAccountInfo(tokenAccount);
      if (!accountInfo) {
        addLog('❌ Token account does not exist. You may not hold any of these tokens.', 'error');
        return;
      }
      
      // Get mint info to fetch decimals
      const mintInfo = await connection.getParsedAccountInfo(mint);
      if (!mintInfo.value) {
        addLog('❌ Invalid mint address', 'error');
        return;
      }
      
      const decimals = mintInfo.value?.data?.parsed?.info?.decimals;
      if (decimals === undefined) {
        addLog('❌ Could not fetch token decimals', 'error');
        return;
      }
      
      // Get current balance to verify
      const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
      const balance = tokenAccountInfo.value?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
      
      if (balance < parseFloat(burnAmount)) {
        addLog(`❌ Insufficient balance. You have ${balance} tokens`, 'error');
        return;
      }
      
      // Calculate amount with decimals
      const amountWithDecimals = BigInt(Math.floor(parseFloat(burnAmount) * Math.pow(10, decimals)));
  
      const transaction = new Transaction();
      const instruction = createBurnInstruction(
        tokenAccount,
        mint,
        walletPublicKey,
        amountWithDecimals,
        [],
        tokenProgram
      );
  
      transaction.add(instruction);
      const signature = await sendTransaction(transaction);
  
      addLog(`✅ ${burnAmount} tokens burned!`, 'success');
      addLog(`TX: ${getExplorerUrl(signature)}`, 'success');
      setBurnAmount('');
    } catch (error) {
      addLog(`❌ Error: ${error.message}`, 'error');
      console.error('Burn error:', error);
    }
  };
  
  const burnLPTokens = async () => {
    try {
      if (!walletPublicKey) {
        addLog('Please connect your wallet first', 'error');
        return;
      }
      if (!lpMintAddress) {
        addLog('Please enter LP mint address', 'error');
        return;
      }
      if (!lpLockAmount || lpLockAmount <= 0) {
        addLog('Please enter a valid LP amount', 'error');
        return;
      }
  
      addLog(`Burning ${lpLockAmount} LP tokens permanently...`, 'info');

      const lpMint = new PublicKey(lpMintAddress);
      const tokenProgram = await determineTokenProgram(lpMint);
      const tokenAccount = await getAssociatedTokenAddress(lpMint, walletPublicKey, false, tokenProgram);
      
      // Check if account exists
      const accountInfo = await connection.getAccountInfo(tokenAccount);
      if (!accountInfo) {
        addLog('❌ LP token account does not exist. You may not hold any LP tokens.', 'error');
        return;
      }
      
      // Get mint info
      const mintInfo = await connection.getParsedAccountInfo(lpMint);
      if (!mintInfo.value) {
        addLog('❌ Invalid LP mint address', 'error');
        return;
      }
      
      const decimals = mintInfo.value?.data?.parsed?.info?.decimals;
      if (decimals === undefined) {
        addLog('❌ Could not fetch LP token decimals', 'error');
        return;
      }
      
      // Verify balance
      const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccount);
      const balance = tokenAccountInfo.value?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
      
      if (balance < parseFloat(lpLockAmount)) {
        addLog(`❌ Insufficient LP balance. You have ${balance} LP tokens`, 'error');
        return;
      }
      
      const amountWithDecimals = BigInt(Math.floor(parseFloat(lpLockAmount) * Math.pow(10, decimals)));
  
      const transaction = new Transaction();
      const instruction = createBurnInstruction(
        tokenAccount,
        lpMint,
        walletPublicKey,
        amountWithDecimals,
        [],
        tokenProgram
      );
  
      transaction.add(instruction);
      const signature = await sendTransaction(transaction);
  
      addLog(`✅ ${lpLockAmount} LP tokens burned permanently!`, 'success');
      addLog(`TX: ${getExplorerUrl(signature)}`, 'success');
      setLpMintAddress('');
      setLpLockAmount('');
    } catch (error) {
      addLog(`❌ Error: ${error.message}`, 'error');
      console.error('LP Burn error:', error);
    }
  };

  const getExplorerUrl = (signature) => {
    const baseUrl = 'https://solscan.io/tx/';
    const network = 'mainnet'; // Changed from 'devnet'
    return network === 'devnet' 
      ? `${baseUrl}${signature}?cluster=devnet`
      : `${baseUrl}${signature}`;
  };

  return (
    <div className="app">
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      
      <div className="container">
        <h1>🔒 Solana Token Security Manager</h1>
        <p className="subtitle">
          Secure your token by revoking authorities, burning tokens, and burning LP tokens
        </p>

        <div className="warning-box">
          <h4>⚠️ Important Safety Notice</h4>
          <ul>
            <li>These operations are IRREVERSIBLE</li>
            <li>Double-check all addresses before proceeding</li>
          </ul>
        </div>

        <div className="connection-status">
          <div className={`status-dot ${isConnected ? 'connected' : ''}`}></div>
          <span>Connected to Solana Mainnet</span>
        </div>

        <div className="wallet-section">
          <div className="wallet-connect-box">
            {!isConnected ? (
              <button className="btn-connect" onClick={connectWallet}>
                🔌 Connect Phantom Wallet
              </button>
            ) : (
              <div className="wallet-info">
                <p className="connected-text">✅ Connected</p>
                <p className="wallet-address">{wallet}</p>
                <button className="btn-disconnect" onClick={disconnectWallet}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          <div className="input-group">
            <label htmlFor="mintAddress">Token Mint Address</label>
            <input
              type="text"
              id="mintAddress"
              placeholder="Enter your token mint address"
              value={mintAddress}
              onChange={(e) => setMintAddress(e.target.value)}
            />
          </div>
        </div>

        <div className="actions-grid">
          <div className="action-card">
            <h3>📝 Add Metadata</h3>
            <p>Add name, symbol, and URI to your token (supports Token-2022 & Legacy)</p>
            <input
              type="text"
              placeholder="Token Name"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              className="amount-input"
            />
            <input
              type="text"
              placeholder="Token Symbol"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value)}
              className="amount-input"
            />
            <input
              type="text"
              placeholder="Metadata URI (JSON)"
              value={tokenUri}
              onChange={(e) => setTokenUri(e.target.value)}
              className="amount-input"
            />
            <button className="btn-primary" onClick={addMetadata}>
              Add Metadata
            </button>
          </div>

          <div className="action-card">
            <h3>🚫 Revoke Mint</h3>
            <p>Prevent creation of new tokens permanently</p>
            <button className="btn-danger" onClick={revokeMintAuthority}>
              Revoke Mint Authority
            </button>
          </div>

          <div className="action-card">
            <h3>❄️ Revoke Freeze</h3>
            <p>Remove ability to freeze user wallets</p>
            <button className="btn-warning" onClick={revokeFreezeAuthority}>
              Revoke Freeze Authority
            </button>
          </div>

          <div className="action-card">
            <h3>🔥 Burn Tokens</h3>
            <p>Permanently destroy tokens to reduce supply</p>
            <input
              type="number"
              placeholder="Amount"
              value={burnAmount}
              onChange={(e) => setBurnAmount(e.target.value)}
              className="amount-input"
            />
            <button className="btn-primary" onClick={burnTokens}>
              Burn Tokens
            </button>
          </div>

          <div className="action-card">
            <h3>🔥 Burn LP Tokens</h3>
            <p>Permanently burn LP tokens - locks liquidity FOREVER</p>
            <input
              type="text"
              placeholder="LP Mint Address"
              value={lpMintAddress}
              onChange={(e) => setLpMintAddress(e.target.value)}
              className="amount-input"
            />
            <input
              type="number"
              placeholder="Amount"
              value={lpLockAmount}
              onChange={(e) => setLpLockAmount(e.target.value)}
              className="amount-input"
            />
            <button className="btn-success" onClick={burnLPTokens}>
              Burn LP Tokens
            </button>
          </div>
        </div>

        <div className="status-box">
          <h3>Transaction Logs</h3>
          <div className="logs">
            {logs.length === 0 ? (
              <p className="no-logs">No logs yet. Connect your wallet to start.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`log-entry log-${log.type}`}>
                  {log.timestamp}: {log.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;