# W3Ship Commerce MCP Server

> **Let AI shop for you — with no passwords, no logins, just cryptographic identity.**

W3Ship is the first MCP (Model Context Protocol) server for **AI-powered commerce**. It gives AI agents like Claude, Cursor, and VS Code Copilot the ability to create shopping carts, place orders, track shipments, book sessions, **swap tokens via Uniswap**, **sell items P2P**, and **distribute promotional items with in-store pickup** — all using cryptographic identity (SLH-DSA / ECDSA) instead of passwords.

Built on TMF Open API standards (TMF663, TMF622, TMF621) for interoperability.

---

## ⚡ Quick Start

### Install via npx (recommended)

No installation required — just configure your AI client:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "w3ship": {
      "command": "npx",
      "args": ["-y", "w3ship-mcp-server"],
      "env": {
        "VALKEY_HOST": "localhost",
        "VALKEY_PORT": "6379"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "w3ship": {
      "command": "npx",
      "args": ["-y", "w3ship-mcp-server"],
      "env": {
        "VALKEY_HOST": "localhost",
        "VALKEY_PORT": "6379"
      }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`):
```json
{
  "servers": {
    "w3ship": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "w3ship-mcp-server"],
      "env": {
        "VALKEY_HOST": "localhost",
        "VALKEY_PORT": "6379"
      }
    }
  }
}
```

### Prerequisites

- **Node.js** 18+
- **Redis / Valkey** instance (for cart, order, and shipment storage)
  - Local: `docker run -p 6379:6379 redis:latest`
  - Or any Redis-compatible service (AWS ElastiCache, Upstash, etc.)

---

## 🛠️ Tools (22 total)

### 🛒 Shopping Cart (TMF663)

| Tool | Description |
|:---|:---|
| `create_cart` | Create a shopping cart. Uses `W3SHIP_PUBLIC_KEY` automatically if configured |
| `get_cart` | Retrieve a cart by its public key ID |
| `add_item` | Add an item (product offering + quantity) to a cart |
| `delete_cart` | Delete a shopping cart |

### 📦 Orders (TMF622)

| Tool | Description |
|:---|:---|
| `create_order` | Convert a cart into a confirmed order and initiate fulfillment |
| `get_order` | Retrieve order details by order ID |

### 🚚 Shipment Tracking (TMF621)

| Tool | Description |
|:---|:---|
| `track_shipment` | Track delivery status with simulated real-time updates |

### 📅 Session Booking

| Tool | Description |
|:---|:---|
| `get_available_slots` | Get available session time slots by location and date (VR, fitness, dining, salon, etc.) |
| `hold_slot` | Reserve a session slot (held for 10 minutes pending payment) |
| `list_bookings` | List confirmed bookings, optionally filtered by location/date |

### 🔐 Identity Lookup

| Tool | Description |
|:---|:---|
| `ship_address` | Retrieve a physical shipping address using a public key + timed signature |

> Identity lookups are forwarded to the centralized W3Ship API (`w3ship.com/api/identity`). Signature verification and database access happen server-side — no AWS credentials needed on your end.

### 🧪 Setup & Demo

| Tool | Description |
|:---|:---|
| `generate_demo_key` | Generate a demo ECDSA key pair for testing — try the commerce flow without a wallet |
| `get_identity` | Show the currently configured identity or instructions on how to set one up |

### 🔄 Uniswap Swap (NEW in v1.3.0)

| Tool | Description |
|:---|:---|
| `get_swap_quote` | Get a swap quote from Uniswap — returns output amount, gas estimate, price impact, and routing path. Supports V2, V3, V4, and UniswapX. Default chain: Base (8453). |
| `check_token_approval` | Check if a token is approved for swapping on Uniswap. Returns approval transaction data if needed. |

> Requires `UNISWAP_API_KEY` — get yours free at [developers.uniswap.org](https://developers.uniswap.org). Built-in token addresses for Base chain: ETH, USDC, USDT, DAI, WETH. Pass any ERC-20 contract address for other tokens.

### 🏪 P2P Marketplace (NEW in v1.4.0)

| Tool | Description |
|:---|:---|
| `create_listing` | Sell anything — no merchant onboarding needed. Set title, price, currency, and your wallet address for payment. Listings expire after 30 days by default. |
| `search_listings` | Browse active listings by category (electronics, gifts, clothing, etc.) or keyword search. |
| `get_listing` | Get full details of a listing: description, price, seller, payment address, shipping regions. |
| `remove_listing` | Remove your own listing. Seller address must match. |

> Categories: `electronics`, `clothing`, `collectibles`, `home`, `sports`, `gifts`, `books`, `other`. Anyone with a wallet address is a merchant.

### 💳 Payment & Fulfillment (NEW in v1.4.0)

| Tool | Description |
|:---|:---|
| `confirm_payment` | Submit an on-chain transaction hash to verify payment. Supports Base (8453) and Tempo chains. Updates order to "paid". |
| `add_tracking` | Seller provides real carrier tracking (UPS, FedEx, USPS, DHL, etc.) after shipping the item. |

> P2P orders auto-detect listing items (LST-* prefix), fill in seller wallet address, and set payment status to `awaiting_payment`. After payment, sellers use `add_tracking` to provide shipping info.

### 🎁 Promotional Items & Pickup (Updated in v1.6.0)

| Tool | Description |
|:---|:---|
| `claim_promo` | Claim a FREE promotional listing. Supports **shipping** or **in-store pickup**. One per wallet. |

> **New in v1.6.0: In-Store Pickup**
>
> Promo listings now support three fulfillment modes:
>
> | Mode | How It Works |
> |:---|:---|
> | `ship` | Customer pays shipping, item mailed (original flow) |
> | `pickup` | Customer picks up at a physical location — **zero cost** |
> | `both` | Customer chooses shipping or pickup |
>
> Create a pickup promo:
> ```
> create_listing(
>   isPromo: true,
>   fulfillmentType: "pickup",
>   pickupLocations: [{
>     id: "qbm",
>     name: "Quaker Bridge Mall",
>     address: "3320 Brunswick Pike, Lawrenceville NJ",
>     hours: "Mon-Sat 10am-9pm",
>     instructions: "Visit the kiosk near the food court. Show your claim ID."
>   }]
> )
> ```
>
> Claim with pickup:
> ```
> claim_promo(listingId: "...", fulfillmentChoice: "pickup", pickupLocationId: "qbm")
> ```
>
> The AI returns the pickup location, hours, and instructions. No address registration needed for pickup claims — only wallet identity is required.

---

## 🔐 Cryptographic Identity

W3Ship uses **cryptographic identity** — no usernames, no passwords, no accounts. Three identity types are supported:

| Scheme | Key Size | Use Case |
|:---|:---|:---|
| **EVM Address** | 20 bytes (40 hex chars) | MetaMask / any Ethereum wallet |
| **ECDSA (P-256)** | 33 bytes (compressed) / 65 bytes (uncompressed) | Standard web3 wallets |
| **SLH-DSA** | 32 bytes (64 hex chars) | Post-quantum secure identity (Dah.mx) |

Your wallet address or public key IS your cart ID. No sign-up required.

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|:---|:---|:---|:---|
| `W3SHIP_PUBLIC_KEY` | No | — | Your wallet address or public key (hex). Set once and all tools use it automatically |
| `UNISWAP_API_KEY` | No | — | Uniswap Trading API key for swap quotes. Get yours at [developers.uniswap.org](https://developers.uniswap.org) |
| `VALKEY_HOST` | No | `localhost` | Redis/Valkey host |
| `VALKEY_PORT` | No | `6379` | Redis/Valkey port |
| `VALKEY_PASSWORD` | No | — | Redis/Valkey password (if auth enabled) |
| `W3SHIP_API_URL` | No | `https://w3ship.com` | Base URL for the W3Ship API (identity, session booking) |

### Getting Your Key

- **MetaMask users**: Just copy your Ethereum address (e.g. `0x1234...abcd`) — it works directly
- **Dah.mx users**: Settings → AI Assistant Setup → Copy key
- **Demo/Testing**: Don't set a key — use `generate_demo_key` in your AI assistant instead

---

## 🏗️ Architecture

The MCP server is a **thin client** that combines local cart/order storage with centralized W3Ship services:

```
┌─────────────────────────────────────────────┐
│  AI Client (Claude / Cursor / VS Code)      │
│  "Create a cart and book a fitness session"  │
└──────────────────┬──────────────────────────┘
                   │ stdio (MCP Protocol)
┌──────────────────▼──────────────────────────┐
│  W3Ship MCP Server (your machine)           │
│                                              │
│  Local Storage (Redis/Valkey):               │
│  ┌──────────┐ ┌─────────┐ ┌──────────────┐  │
│  │ Cart     │ │ Orders  │ │ Shipment     │  │
│  │ (TMF663) │ │ (TMF622)│ │ (TMF621)     │  │
│  └──────────┘ └─────────┘ └──────────────┘  │
│                                              │
│  Centralized API (w3ship.com):               │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Booking      │  │ Identity Lookup     │  │
│  │ /api/slots   │  │ /api/identity       │  │
│  └──────────────┘  └─────────────────────┘  │
└──────────────────────────────────────────────┘
```

- **Commerce** (cart, order, shipment) → stored locally in your Redis
- **Identity** (address lookup) → forwarded to `w3ship.com` API
- **Session Booking** → forwarded to `w3ship.com` API
- **No AWS credentials** needed. No cloud config required.

---

## 💡 Example Conversations

### Shopping & Booking
```
You:    "I want to shop on W3Ship"
Claude: [calls get_identity — no key configured]
        [calls generate_demo_key — creates a test identity]
        [calls create_cart with the demo key]
        "You're all set! I've created a shopping cart for you.
         What would you like to buy?"

You:    "Book me a VR session for this afternoon"
Claude: [calls get_available_slots for today]
        "Here are today's sessions at Downtown VR:
         • 2:00 PM - $45 (3 spots left)
         • 4:00 PM - $45 (5 spots left)
         Which time works?"

You:    "4 PM"
Claude: [calls hold_slot → add_item]
        "Slot held for 10 minutes. Added to your cart."

You:    "Place the order"
Claude: [calls create_order]
        "Order confirmed! Tracking: TRK-8392751046"
```

### Claiming a Promo with Pickup (NEW in v1.6.0)
```
You:    "Any free promos I can grab?"
Claude: [calls search_listings with category: promotional]
        "There's a free VR Experience Card available!
         You can pick it up at Quaker Bridge Mall."

You:    "I'll take it"
Claude: [calls claim_promo with fulfillmentChoice: pickup]
        "Claimed! Here's your pickup info:
         📍 Quaker Bridge Mall, Lawrenceville NJ
         🕐 Mon-Sat 10am-9pm
         🎟️ Claim ID: CLM-MMB1ZW3W-W98I
         Show your claim ID at the VR kiosk near the food court."
```

> **Tip:** For production use, set your real wallet key via `W3SHIP_PUBLIC_KEY` in your MCP config. See [Getting Your Public Key](#getting-your-public-key) above.

---

## 📰 Press

- **TechBullion**: [How W3Ship Works: The MCP Server That Turns Any AI Into a Merchant](https://techbullion.com/how-w3ship-works-the-mcp-server-that-turns-any-ai-into-a-merchant/)
- **Digital Journal**: [Quantum-Resistant Commerce Token Launches via Uniswap CCA on Unichain](https://www.digitaljournal.com/pr/news/vehement-media/quantum-resistant-commerce-token-launches-via-1883892375.html)
- Syndicated across **500+ outlets** — [full coverage →](https://w3ship.com/press)

---

## 🔗 Links

- **Website**: [w3ship.com](https://w3ship.com)
- **Press**: [w3ship.com/press](https://w3ship.com/press)
- **GitHub**: [github.com/baskcart/w3ship](https://github.com/baskcart/w3ship)
- **W3SH Token**: [Uniswap CCA Auction](https://app.uniswap.org)

---

## 📄 License

MIT — see [LICENSE](./LICENSE)
