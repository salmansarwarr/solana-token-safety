# Solana Token Security Manager

A React application for managing Solana token security operations including revoking authorities, burning tokens, and locking liquidity.

## Features

- 🔌 **Phantom Wallet Integration** - Connect your Phantom wallet securely
- 🚫 **Revoke Mint Authority** - Prevent creation of new tokens permanently
- ❄️ **Revoke Freeze Authority** - Remove ability to freeze user wallets
- 🔥 **Burn Tokens** - Permanently destroy tokens to reduce supply
- 🔐 **Lock Liquidity** - Lock LP tokens to build trust

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Phantom Wallet browser extension

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Usage

1. **Connect Wallet**: Click "Connect Phantom Wallet" to connect your wallet
2. **Enter Token Address**: Input your token mint address
3. **Choose Operation**:
   - Revoke mint authority to prevent minting new tokens
   - Revoke freeze authority to prevent freezing accounts
   - Burn tokens by specifying the amount
   - Lock LP tokens by providing LP mint address and amount

4. **Confirm Transaction**: Approve the transaction in your Phantom wallet
5. **View Results**: Check transaction logs and Solscan links

## Important Safety Notes

⚠️ **WARNING**: All operations are IRREVERSIBLE

- Always test on devnet first
- Double-check all addresses before proceeding
- Ensure you understand each operation before executing
- Keep your wallet secure

## Tech Stack

- React 18
- Vite
- @solana/web3.js
- @solana/spl-token
- Phantom Wallet Integration

## Network

Default network: Solana Mainnet Beta
- RPC: `https://api.mainnet-beta.solana.com`

To change to devnet, update the connection in `App.jsx`:
```javascript
const [connection] = useState(
  new Connection('https://api.devnet.solana.com', 'confirmed')
);
```

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

MIT
