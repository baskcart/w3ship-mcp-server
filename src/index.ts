#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { valkeyService } from "./cart/service.js";
import { getKeyType } from "./cart/utils.js";

// Base URL for the W3Ship API. All identity lookups and VR booking
// requests are forwarded to this centralized service.
const W3SHIP_API = process.env.W3SHIP_API_URL || 'https://w3ship.com';

// Pre-configured public key. If set, tools like create_cart will use this
// key automatically so the user doesn't have to provide one each time.
const CONFIGURED_KEY = process.env.W3SHIP_PUBLIC_KEY || '';

// Uniswap Trading API — enables swap quotes and token approvals.
// Get your API key at https://developers.uniswap.org
const UNISWAP_API = 'https://trade-api.gateway.uniswap.org/v1';
const UNISWAP_API_KEY = process.env.UNISWAP_API_KEY || '';

// Common token addresses (Base chain)
const TOKENS: Record<string, { address: string; decimals: number; symbol: string }> = {
    ETH: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH' },
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' },
    USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, symbol: 'USDT' },
    DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, symbol: 'DAI' },
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
};

const server = new Server(
    {
        name: "w3ship-unified-server",
        version: "1.4.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Handler that lists available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "ship_address",
                description: "Securely retrieve a physical address using a public key and a timed cryptographic signature.",
                inputSchema: {
                    type: "object",
                    properties: {
                        publicKey: { type: "string", description: "The hex-encoded public key to lookup." },
                        signature: { type: "string", description: "The hex-encoded signature of the timestamp." },
                        timestamp: { type: "number", description: "The current Unix timestamp in milliseconds." },
                    },
                    required: ["publicKey", "signature", "timestamp"],
                },
            },
            {
                name: 'create_cart',
                description: 'Create a new TMF663 shopping cart. If W3SHIP_PUBLIC_KEY is configured, it is used automatically — no id required. Otherwise provide an SLH-DSA or ECDSA public key (hex).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Public key (hex). Optional if W3SHIP_PUBLIC_KEY env var is set.' },
                        customer: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                name: { type: 'string' },
                            },
                        },
                    },
                },
            },
            {
                name: 'get_cart',
                description: 'Retrieve a shopping cart by its Public Key ID. Uses W3SHIP_PUBLIC_KEY if no id is provided.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Public key ID (hex). Optional if W3SHIP_PUBLIC_KEY is set.' },
                    },
                },
            },
            {
                name: 'add_item',
                description: 'Add an item to an existing shopping cart. Uses W3SHIP_PUBLIC_KEY as cartId if not provided.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        cartId: { type: 'string', description: 'Public key ID of the cart. Optional if W3SHIP_PUBLIC_KEY is set.' },
                        item: {
                            type: 'object',
                            properties: {
                                productOffering: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        name: { type: 'string' },
                                    },
                                    required: ['id'],
                                },
                                quantity: {
                                    type: 'object',
                                    properties: {
                                        amount: { type: 'number' },
                                    },
                                    required: ['amount'],
                                },
                            },
                            required: ['productOffering'],
                        },
                    },
                    required: ['cartId', 'item'],
                },
            },
            {
                name: 'delete_cart',
                description: 'Delete a shopping cart.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Public key ID of the cart' },
                    },
                    required: ['id'],
                },
            },
            {
                name: 'create_order',
                description: 'Convert a Shopping Cart into a confirmed Order (TMF622) and initiate fulfillment.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        cartId: { type: 'string', description: 'The ID of the shopping cart to convert' },
                    },
                    required: ['cartId'],
                },
            },
            {
                name: 'get_order',
                description: 'Retrieve detailed information about a specific Order (TMF622).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'The generic Order ID' },
                    },
                    required: ['id'],
                },
            },
            {
                name: 'track_shipment',
                description: 'Track the delivery status of a shipment (TMF621).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        shipmentId: { type: 'string', description: 'The unique Shipment ID' },
                        orderId: { type: 'string', description: 'The Order ID (optional, to lookup shipment)' },
                    },
                },
            },
            {
                name: 'get_available_slots',
                description: 'Get available session time slots for a location on a given date. Returns times, capacity, pricing, and activity type. Works for any bookable service (VR, fitness, dining, salon, etc.).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        locationId: { type: 'string', description: 'Location ID (e.g. loc_downtown, loc_mall)' },
                        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                        activityId: { type: 'string', description: 'Optional activity/service ID to filter slots' },
                    },
                    required: ['locationId', 'date'],
                },
            },
            {
                name: 'hold_slot',
                description: 'Hold/reserve a session time slot for a customer. The slot is held for 10 minutes pending payment. Works for any bookable service.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slotId: { type: 'string', description: 'The time slot ID to hold' },
                        cartId: { type: 'string', description: 'The cart ID to associate with the hold' },
                        participants: { type: 'number', description: 'Number of participants (default: 1)' },
                    },
                    required: ['slotId', 'cartId'],
                },
            },
            {
                name: 'list_bookings',
                description: 'List all confirmed session bookings. Optionally filter by location or date.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        locationId: { type: 'string', description: 'Filter by location ID' },
                        date: { type: 'string', description: 'Filter by date (YYYY-MM-DD)' },
                    },
                },
            },
            {
                name: 'generate_demo_key',
                description: 'Generate a demo ECDSA key pair for testing. Returns a public key hex that can be used with create_cart and other tools. Useful for trying out the commerce flow without a real wallet.',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'get_identity',
                description: 'Show the currently configured identity (W3SHIP_PUBLIC_KEY). Returns the public key and its type if set, or instructions on how to configure one.',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'get_swap_quote',
                description: 'Get a swap quote from Uniswap. Returns estimated output, routing path, gas fees, and price impact. Supports V2, V3, V4, and UniswapX protocols. Requires UNISWAP_API_KEY env var.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tokenIn: { type: 'string', description: 'Input token symbol (ETH, USDC, USDT, DAI, WETH) or contract address' },
                        tokenOut: { type: 'string', description: 'Output token symbol (ETH, USDC, USDT, DAI, WETH) or contract address' },
                        amount: { type: 'string', description: 'Amount of input token to swap (in human-readable units, e.g. "100" for 100 USDC)' },
                        walletAddress: { type: 'string', description: 'Wallet address of the swapper. Uses W3SHIP_PUBLIC_KEY if not provided.' },
                        chainId: { type: 'number', description: 'Chain ID (default: 8453 for Base)' },
                    },
                    required: ['tokenIn', 'tokenOut', 'amount'],
                },
            },
            {
                name: 'check_token_approval',
                description: 'Check if a token is approved for swapping on Uniswap. Returns whether approval is needed and the approval transaction if so. Requires UNISWAP_API_KEY env var.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        token: { type: 'string', description: 'Token symbol (USDC, USDT, DAI, WETH) or contract address' },
                        amount: { type: 'string', description: 'Amount to approve (in human-readable units)' },
                        walletAddress: { type: 'string', description: 'Wallet address. Uses W3SHIP_PUBLIC_KEY if not provided.' },
                        chainId: { type: 'number', description: 'Chain ID (default: 8453 for Base)' },
                    },
                    required: ['token', 'amount'],
                },
            },
            {
                name: 'create_listing',
                description: 'Create a P2P marketplace listing. Anyone can sell items — no merchant onboarding needed. Specify title, price, currency (USDC/ETH/etc), and your wallet address for payment.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Item title (e.g. "PS5 Console")' },
                        description: { type: 'string', description: 'Item description' },
                        price: { type: 'number', description: 'Price amount (e.g. 200). Set to 0 for promotional items.' },
                        currency: { type: 'string', description: 'Payment currency (USDC, ETH, DAI, etc). Default: USDC' },
                        category: { type: 'string', description: 'Category: electronics, clothing, collectibles, home, sports, gifts, books, promotional, other' },
                        sellerAddress: { type: 'string', description: 'Seller wallet address for payment. Uses W3SHIP_PUBLIC_KEY if not provided.' },
                        sellerName: { type: 'string', description: 'Optional display name for the seller' },
                        condition: { type: 'string', description: 'Item condition: new, like_new, used, refurbished. Default: new' },
                        quantity: { type: 'number', description: 'How many available. Default: 1' },
                        shipsTo: { type: 'array', items: { type: 'string' }, description: 'Countries that can be shipped to (e.g. ["US", "CA"]). Default: ["US"]' },
                        expiresInDays: { type: 'number', description: 'Listing expires after N days. Default: 30' },
                        isPromo: { type: 'boolean', description: 'Set to true for promotional/free items. Price auto-sets to 0, category to "promotional".' },
                        shippingCost: { type: 'number', description: 'For promo items: shipping cost the buyer pays (e.g. 8.99). Default: 0' },
                        promoQuantity: { type: 'number', description: 'For promo items: how many are available to claim (e.g. 500). Default: 100' },
                        fulfillmentType: { type: 'string', description: 'Fulfillment method: "ship" (mail only), "pickup" (in-store only), "both" (customer chooses). Default: "ship". Set to "pickup" for zero-cost promo distribution.' },
                        pickupLocations: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string', description: 'Unique location ID (e.g. "qbm")' },
                                    name: { type: 'string', description: 'Location name (e.g. "Quaker Bridge Mall")' },
                                    address: { type: 'string', description: 'Full street address' },
                                    city: { type: 'string' },
                                    state: { type: 'string' },
                                    hours: { type: 'string', description: 'Operating hours (e.g. "Mon-Sat 10am-9pm")' },
                                    instructions: { type: 'string', description: 'Pickup instructions (e.g. "Ask at VR kiosk near entrance")' },
                                },
                                required: ['id', 'name', 'address'],
                            },
                            description: 'Pickup locations for in-store fulfillment. Required when fulfillmentType is "pickup" or "both".',
                        },
                    },
                    required: ['title', 'description', 'price'],
                },
            },
            {
                name: 'search_listings',
                description: 'Browse the W3Ship P2P marketplace. Search by category (electronics, gifts, clothing, etc.) or keyword. Returns active listings with prices and seller info.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        category: { type: 'string', description: 'Filter by category (electronics, clothing, collectibles, home, sports, gifts, books, other)' },
                        keyword: { type: 'string', description: 'Search keyword (matches title, description)' },
                        limit: { type: 'number', description: 'Max results to return. Default: 20' },
                    },
                },
            },
            {
                name: 'get_listing',
                description: 'Get full details of a specific marketplace listing by ID.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        listingId: { type: 'string', description: 'The listing ID' },
                    },
                    required: ['listingId'],
                },
            },
            {
                name: 'remove_listing',
                description: 'Remove a marketplace listing. Only the seller can remove their own listing.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        listingId: { type: 'string', description: 'The listing ID to remove' },
                        sellerAddress: { type: 'string', description: 'Seller wallet address (must match listing). Uses W3SHIP_PUBLIC_KEY if not provided.' },
                    },
                    required: ['listingId'],
                },
            },
            {
                name: 'confirm_payment',
                description: 'Submit an on-chain payment transaction for verification. After paying the seller (send crypto to their wallet address), provide the transaction hash here to verify payment and update the order status to "paid".',
                inputSchema: {
                    type: 'object',
                    properties: {
                        orderId: { type: 'string', description: 'The order ID to confirm payment for' },
                        txHash: { type: 'string', description: 'The on-chain transaction hash (0x...)' },
                        chainId: { type: 'number', description: 'Chain ID where payment was sent. Default: 8453 (Base)' },
                    },
                    required: ['orderId', 'txHash'],
                },
            },
            {
                name: 'add_tracking',
                description: 'Seller tool: Add real shipping tracking info to an order after shipping the item. Provides the buyer with a tracking number and carrier.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        orderId: { type: 'string', description: 'The order ID' },
                        carrier: { type: 'string', description: 'Shipping carrier: UPS, FedEx, USPS, DHL, etc.' },
                        trackingNumber: { type: 'string', description: 'Carrier tracking number' },
                        sellerAddress: { type: 'string', description: 'Seller wallet address (for verification). Uses W3SHIP_PUBLIC_KEY if not provided.' },
                    },
                    required: ['orderId', 'carrier', 'trackingNumber'],
                },
            },
            {
                name: 'claim_promo',
                description: 'Claim a FREE promotional listing. Items are $0. For shipping promos you pay shipping only; for pickup promos it is completely free. One claim per wallet. Must have a registered W3Ship/Dah.mx identity (address required for shipping, wallet-only for pickup).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        listingId: { type: 'string', description: 'The promotional listing ID to claim' },
                        publicKey: { type: 'string', description: 'Your public key / wallet address for identity verification. Uses W3SHIP_PUBLIC_KEY if not provided.' },
                        fulfillmentChoice: { type: 'string', description: 'How to receive the item: "ship" (mailed to your address — may have shipping cost) or "pickup" (free, collect at pickup location). Defaults based on listing configuration.' },
                        pickupLocationId: { type: 'string', description: 'ID of the pickup location (required when multiple pickup locations exist and fulfillmentChoice is "pickup")' },
                    },
                    required: ['listingId'],
                },
            },
        ],
    };
});

/**
 * Handler for tool execution.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case "ship_address": {
                // Forward the identity lookup to the centralized W3Ship API.
                // Signature verification and DB lookup happen server-side.
                const { publicKey, signature, timestamp } = args as any;

                if (!publicKey || !signature || !timestamp) {
                    return { content: [{ type: 'text', text: 'Error: publicKey, signature, and timestamp are all required.' }], isError: true };
                }

                const identityRes = await fetch(`${W3SHIP_API}/api/identity`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ publicKey, signature, timestamp }),
                });

                const identityData = await identityRes.json();

                if (!identityRes.ok) {
                    return {
                        content: [{ type: 'text', text: `Error: ${identityData.error || 'Identity lookup failed'}${identityData.details ? ' — ' + identityData.details : ''}` }],
                        isError: true,
                    };
                }

                return {
                    content: [{ type: 'text', text: JSON.stringify(identityData, null, 2) }],
                };
            }

            case 'create_cart': {
                const id = (args?.id as string) || CONFIGURED_KEY;
                if (!id) {
                    return {
                        content: [{ type: 'text', text: 'Error: No public key provided. Either set W3SHIP_PUBLIC_KEY in your MCP config, provide an id parameter, or call generate_demo_key first.' }],
                        isError: true,
                    };
                }
                const keyType = getKeyType(id);
                if (!keyType) {
                    return {
                        content: [{ type: 'text', text: 'Error: Invalid public key. Must be SLH-DSA (64 bytes hex) or ECDSA (33/65 bytes hex).' }],
                        isError: true,
                    };
                }
                const cart = { id, keyType, customer: args?.customer as any, cartItem: [] };
                await valkeyService.saveCart(cart as any);
                return { content: [{ type: 'text', text: `Cart created successfully (${keyType}): ${id}` }] };
            }

            case 'get_cart': {
                const id = (args?.id as string) || CONFIGURED_KEY;
                if (!id) {
                    return { content: [{ type: 'text', text: 'Error: No cart ID. Set W3SHIP_PUBLIC_KEY or provide an id.' }], isError: true };
                }
                const cart = await valkeyService.getCart(id);
                if (!cart) {
                    return { content: [{ type: 'text', text: `Error: Cart not found for ID ${id}` }], isError: true };
                }
                return { content: [{ type: 'text', text: JSON.stringify(cart, null, 2) }] };
            }

            case 'add_item': {
                const cartId = (args?.cartId as string) || CONFIGURED_KEY;
                if (!cartId) {
                    return { content: [{ type: 'text', text: 'Error: No cart ID. Set W3SHIP_PUBLIC_KEY or provide a cartId.' }], isError: true };
                }
                const itemArg = args?.item as any;
                const cart = await valkeyService.getCart(cartId);
                if (!cart) {
                    return { content: [{ type: 'text', text: `Error: Cart not found: ${cartId}` }], isError: true };
                }
                const cartItem = { id: Math.random().toString(36).substring(7), ...itemArg };
                cart.cartItem = cart.cartItem || [];
                cart.cartItem.push(cartItem);
                await valkeyService.saveCart(cart);
                return { content: [{ type: 'text', text: `Item added successfully to cart ${cartId}` }] };
            }

            case 'delete_cart': {
                const id = (args?.id as string) || CONFIGURED_KEY;
                if (!id) {
                    return { content: [{ type: 'text', text: 'Error: No cart ID. Set W3SHIP_PUBLIC_KEY or provide an id.' }], isError: true };
                }
                await valkeyService.deleteCart(id);
                return { content: [{ type: 'text', text: `Cart ${id} deleted successfully.` }] };
            }

            case 'create_order': {
                const { orderService } = await import('./orders/service.js');
                const { shipmentService } = await import('./shipment/service.js');
                const cartId = (args?.cartId as string) || CONFIGURED_KEY;
                if (!cartId) {
                    return { content: [{ type: 'text', text: 'Error: No cart ID. Set W3SHIP_PUBLIC_KEY or provide a cartId.' }], isError: true };
                }

                // 1. Validate Cart
                const cart = await valkeyService.getCart(cartId);
                if (!cart) {
                    return { content: [{ type: 'text', text: `Error: Cart not found: ${cartId}` }], isError: true };
                }
                if (!cart.cartItem || cart.cartItem.length === 0) {
                    return { content: [{ type: 'text', text: `Error: Cart is empty.` }], isError: true };
                }

                // 2. Check if cart contains P2P listing items
                let merchantWallet: string | undefined;
                let totalPrice = 0;
                let isP2P = false;
                const listingIds: string[] = [];

                for (const item of cart.cartItem) {
                    const offId = item.productOffering?.id || '';
                    if (offId.startsWith('LST-')) {
                        isP2P = true;
                        listingIds.push(offId);
                        // Fetch listing to get seller wallet and price
                        try {
                            const lstRes = await fetch(`${W3SHIP_API}/api/listing?id=${encodeURIComponent(offId)}`);
                            const lstData = await lstRes.json() as any;
                            if (lstRes.ok && lstData.listing) {
                                merchantWallet = lstData.listing.sellerAddress;
                                totalPrice += lstData.listing.price * (item.quantity?.amount || 1);
                            }
                        } catch { /* continue */ }
                    }
                }

                // 3. Create Order
                const orderId = `ord_${Math.random().toString(36).substring(2, 10)}`;
                const order: any = {
                    id: orderId,
                    orderDate: new Date().toISOString(),
                    state: isP2P ? 'Pending Payment' : 'Confirmed',
                    orderItem: cart.cartItem.map(item => ({
                        id: item.id,
                        quantity: item.quantity?.amount || 1,
                        productOffering: item.productOffering,
                        state: isP2P ? 'Pending' : 'Allocated'
                    })),
                    totalPrice,
                    relatedParty: [{ id: cart.id, role: 'Customer' }],
                };

                // Add payment fields for P2P orders
                if (isP2P && merchantWallet) {
                    order.merchantWallet = merchantWallet;
                    order.paymentStatus = 'awaiting_payment';
                    order.paymentToken = 'USDC';
                    order.paymentChainId = 8453; // Base
                    order.paymentAmount = totalPrice;
                }

                await orderService.createOrder(order);

                // 4. Mark listings as sold
                for (const lstId of listingIds) {
                    try {
                        await fetch(`${W3SHIP_API}/api/listing`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: lstId, status: 'sold' }),
                        });
                    } catch { /* best effort */ }
                }

                // 5. For non-P2P (demo), create simulated shipment. For P2P, seller adds tracking later.
                let shipmentInfo: any = null;
                if (!isP2P) {
                    const shipmentId = `shp_${Math.random().toString(36).substring(2, 10)}`;
                    const shipment = {
                        id: shipmentId,
                        orderId: orderId,
                        trackingNumber: `TRK-${Math.random().toString(10).substring(2, 12)}`,
                        carrier: 'QuantumLogistics',
                        status: 'Label Created',
                        origin: { address: 'Distribution Center 1', city: 'Satoshi City', country: 'Digital Nation' },
                        destination: { address: 'Customer Address', city: 'Unknown', country: 'Unknown' },
                        events: [{ timestamp: new Date().toISOString(), status: 'Label Created', description: 'Shipment info received' }]
                    };
                    await shipmentService.createShipment(shipment as any);
                    shipmentInfo = { shipmentId, trackingNumber: shipment.trackingNumber };
                }

                // 6. Clear Cart
                await valkeyService.deleteCart(cartId);

                // 7. Return appropriate response
                if (isP2P) {
                    return {
                        content: [{
                            type: 'text', text: JSON.stringify({
                                success: true,
                                message: `Order created! Send ${totalPrice} USDC to ${merchantWallet} on Base chain, then use confirm_payment with the transaction hash.`,
                                orderId,
                                paymentStatus: 'awaiting_payment',
                                payTo: merchantWallet,
                                amount: `${totalPrice} USDC`,
                                chainId: 8453,
                                nextStep: `After paying, call confirm_payment(orderId: "${orderId}", txHash: "0x...")`,
                            }, null, 2)
                        }]
                    };
                }

                return {
                    content: [{
                        type: 'text', text: JSON.stringify({
                            success: true,
                            message: "Order confirmed and shipment initiated.",
                            orderId,
                            ...shipmentInfo,
                        }, null, 2)
                    }]
                };
            }

            case 'get_order': {
                const { orderService } = await import('./orders/service.js');
                const id = args?.id as string;
                const order = await orderService.getOrder(id);
                if (!order) {
                    return { content: [{ type: 'text', text: `Error: Order not found: ${id}` }], isError: true };
                }
                return { content: [{ type: 'text', text: JSON.stringify(order, null, 2) }] };
            }

            case 'track_shipment': {
                const { shipmentService } = await import('./shipment/service.js');
                const shipmentId = args?.shipmentId as string;
                const orderId = args?.orderId as string;

                let shipment;
                if (shipmentId) {
                    shipment = await shipmentService.getShipment(shipmentId);
                } else if (orderId) {
                    shipment = await shipmentService.getShipmentByOrderId(orderId);
                } else {
                    return { content: [{ type: 'text', text: `Error: Must provide shipmentId or orderId.` }], isError: true };
                }

                if (!shipment) {
                    return { content: [{ type: 'text', text: `Error: Shipment not found.` }], isError: true };
                }

                // Simulate status update based on time elapsed
                const createdTime = new Date(shipment.events[0].timestamp).getTime();
                const now = Date.now();
                const minutesElapsed = (now - createdTime) / 60000;

                let newStatus = shipment.status;
                if (minutesElapsed > 5 && shipment.status === 'Label Created') newStatus = 'Picked Up';
                else if (minutesElapsed > 10 && shipment.status === 'Picked Up') newStatus = 'In Transit';
                else if (minutesElapsed > 20 && shipment.status === 'In Transit') newStatus = 'Out for Delivery';
                else if (minutesElapsed > 30 && shipment.status === 'Out for Delivery') newStatus = 'Delivered';

                if (newStatus !== shipment.status) {
                    shipment.status = newStatus as any;
                    shipment.events.push({
                        timestamp: new Date().toISOString(),
                        status: newStatus,
                        description: `Status updated to ${newStatus}`
                    });
                    await shipmentService.updateShipment(shipment);
                }

                return { content: [{ type: 'text', text: JSON.stringify(shipment, null, 2) }] };
            }

            case 'get_available_slots': {
                const locationId = args?.locationId as string;
                const date = args?.date as string;
                const activityId = (args?.activityId || args?.gameId) as string | undefined;

                if (!locationId || !date) {
                    return { content: [{ type: 'text', text: 'Error: locationId and date are required.' }], isError: true };
                }

                // Map activityId to gameId for the W3Ship API
                const slotsUrl = `${W3SHIP_API}/api/slots?locationId=${locationId}&date=${date}${activityId ? `&gameId=${activityId}` : ''}`;
                const slotsRes = await fetch(slotsUrl);
                const slotsData = await slotsRes.json();

                return { content: [{ type: 'text', text: JSON.stringify(slotsData, null, 2) }] };
            }

            case 'hold_slot': {
                const slotId = args?.slotId as string;
                const cartId = args?.cartId as string;
                const participants = (args?.participants as number) || 1;

                if (!slotId || !cartId) {
                    return { content: [{ type: 'text', text: 'Error: slotId and cartId are required.' }], isError: true };
                }

                const holdRes = await fetch(`${W3SHIP_API}/api/slots`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slotId, cartId, participants }),
                });
                const holdData = await holdRes.json();

                return { content: [{ type: 'text', text: JSON.stringify(holdData, null, 2) }] };
            }

            case 'list_bookings': {
                const locationId = args?.locationId as string | undefined;
                const date = args?.date as string | undefined;

                const params = new URLSearchParams();
                if (locationId) params.set('locationId', locationId);
                if (date) params.set('date', date);
                const queryStr = params.toString() ? `?${params.toString()}` : '';

                const bookingsRes = await fetch(`${W3SHIP_API}/api/bookings${queryStr}`);
                const bookingsData = await bookingsRes.json();

                return { content: [{ type: 'text', text: JSON.stringify(bookingsData, null, 2) }] };
            }

            case 'generate_demo_key': {
                const crypto = await import('crypto');
                // Generate a random 65-byte uncompressed ECDSA public key (04 prefix + 64 random bytes)
                const randomBytes = crypto.randomBytes(64);
                const publicKeyHex = '04' + randomBytes.toString('hex'); // 130 hex chars = 65 bytes uncompressed ECDSA
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            publicKey: publicKeyHex,
                            keyType: 'ECDSA (uncompressed, 65 bytes)',
                            note: 'This is a demo key for testing. Use it with create_cart to start shopping. For production, connect your MetaMask wallet or Dah.mx app at w3ship.com/setup-mcp to get your real key.',
                            usage: 'Call create_cart — the key will be used automatically, or pass it as the id parameter.',
                        }, null, 2)
                    }]
                };
            }

            case 'get_identity': {
                if (CONFIGURED_KEY) {
                    const keyType = getKeyType(CONFIGURED_KEY);
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                configured: true,
                                publicKey: CONFIGURED_KEY,
                                keyType: keyType || 'Unknown',
                                source: 'W3SHIP_PUBLIC_KEY environment variable',
                            }, null, 2)
                        }]
                    };
                }
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            configured: false,
                            message: 'No identity configured. Options: (1) Set W3SHIP_PUBLIC_KEY in your MCP config, (2) Call generate_demo_key for a test key, (3) Visit w3ship.com/setup-mcp to get your MetaMask or Dah.mx key.',
                        }, null, 2)
                    }]
                };
            }

            case 'get_swap_quote': {
                if (!UNISWAP_API_KEY) {
                    return {
                        content: [{ type: 'text', text: 'Error: UNISWAP_API_KEY environment variable is not set. Get your API key at https://developers.uniswap.org' }],
                        isError: true,
                    };
                }

                const { tokenIn: tokenInArg, tokenOut: tokenOutArg, amount: amountArg, walletAddress: swapWallet, chainId: swapChain } = args as any;
                const chainId = swapChain || 8453; // Default to Base
                const wallet = swapWallet || CONFIGURED_KEY;

                if (!wallet) {
                    return {
                        content: [{ type: 'text', text: 'Error: Wallet address required. Set W3SHIP_PUBLIC_KEY or provide walletAddress.' }],
                        isError: true,
                    };
                }

                // Resolve token symbols to addresses
                const resolveToken = (t: string) => {
                    const upper = t.toUpperCase();
                    return TOKENS[upper]?.address || t;
                };
                const resolveDecimals = (t: string) => {
                    const upper = t.toUpperCase();
                    return TOKENS[upper]?.decimals || 18;
                };

                const tokenInAddr = resolveToken(tokenInArg);
                const tokenOutAddr = resolveToken(tokenOutArg);
                const decimals = resolveDecimals(tokenInArg);

                // Convert human-readable amount to wei/smallest unit
                const amountRaw = BigInt(Math.floor(parseFloat(amountArg) * (10 ** decimals))).toString();

                try {
                    const quoteRes = await fetch(`${UNISWAP_API}/quote`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': UNISWAP_API_KEY,
                        },
                        body: JSON.stringify({
                            tokenIn: tokenInAddr,
                            tokenOut: tokenOutAddr,
                            amount: amountRaw,
                            type: 'EXACT_INPUT',
                            swapper: wallet,
                            tokenInChainId: chainId,
                            tokenOutChainId: chainId,
                            protocols: ['V2', 'V3', 'V4', 'UNISWAPX'],
                        }),
                    });

                    const quoteData = await quoteRes.json() as any;

                    if (!quoteRes.ok) {
                        return {
                            content: [{ type: 'text', text: `Uniswap API error: ${quoteData.errorCode || quoteData.detail || JSON.stringify(quoteData)}` }],
                            isError: true,
                        };
                    }

                    // Format output amount
                    const outDecimals = resolveDecimals(tokenOutArg);
                    const outputRaw = BigInt(quoteData.quote?.amountOut || quoteData.amountOut || '0');
                    const outputFormatted = (Number(outputRaw) / (10 ** outDecimals)).toFixed(6);

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                quote: {
                                    tokenIn: tokenInArg.toUpperCase(),
                                    tokenOut: tokenOutArg.toUpperCase(),
                                    amountIn: amountArg,
                                    amountOut: outputFormatted,
                                    chainId,
                                    gasEstimate: quoteData.quote?.gasEstimate || quoteData.gasEstimate || 'N/A',
                                    priceImpact: quoteData.quote?.priceImpact || quoteData.priceImpact || 'N/A',
                                    routingPath: quoteData.quote?.route || quoteData.route || [],
                                },
                                message: `Swap ${amountArg} ${tokenInArg.toUpperCase()} → ${outputFormatted} ${tokenOutArg.toUpperCase()} on chain ${chainId}`,
                                needsApproval: quoteData.permit2 ? true : false,
                            }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return {
                        content: [{ type: 'text', text: `Error getting swap quote: ${e.message}` }],
                        isError: true,
                    };
                }
            }

            case 'check_token_approval': {
                if (!UNISWAP_API_KEY) {
                    return {
                        content: [{ type: 'text', text: 'Error: UNISWAP_API_KEY environment variable is not set. Get your API key at https://developers.uniswap.org' }],
                        isError: true,
                    };
                }

                const { token: tokenArg, amount: approveAmount, walletAddress: approveWallet, chainId: approveChain } = args as any;
                const appChainId = approveChain || 8453;
                const appWallet = approveWallet || CONFIGURED_KEY;

                if (!appWallet) {
                    return {
                        content: [{ type: 'text', text: 'Error: Wallet address required. Set W3SHIP_PUBLIC_KEY or provide walletAddress.' }],
                        isError: true,
                    };
                }

                const resolveTokenAddr = (t: string) => {
                    const upper = t.toUpperCase();
                    return TOKENS[upper]?.address || t;
                };
                const resolveTokenDec = (t: string) => {
                    const upper = t.toUpperCase();
                    return TOKENS[upper]?.decimals || 18;
                };

                const tokenAddr = resolveTokenAddr(tokenArg);
                const tokenDec = resolveTokenDec(tokenArg);
                const approveAmountRaw = BigInt(Math.floor(parseFloat(approveAmount) * (10 ** tokenDec))).toString();

                try {
                    const approvalRes = await fetch(`${UNISWAP_API}/check_approval`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': UNISWAP_API_KEY,
                        },
                        body: JSON.stringify({
                            token: tokenAddr,
                            amount: approveAmountRaw,
                            walletAddress: appWallet,
                            chainId: appChainId,
                        }),
                    });

                    const approvalData = await approvalRes.json() as any;

                    if (!approvalRes.ok) {
                        return {
                            content: [{ type: 'text', text: `Uniswap API error: ${approvalData.errorCode || JSON.stringify(approvalData)}` }],
                            isError: true,
                        };
                    }

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                token: tokenArg.toUpperCase(),
                                amount: approveAmount,
                                chainId: appChainId,
                                approved: approvalData.approved || false,
                                approvalNeeded: !approvalData.approved,
                                approvalTransaction: approvalData.approvalTransaction || null,
                                message: approvalData.approved
                                    ? `${tokenArg.toUpperCase()} is already approved for swapping`
                                    : `${tokenArg.toUpperCase()} needs approval before swapping. Transaction data provided.`,
                            }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return {
                        content: [{ type: 'text', text: `Error checking approval: ${e.message}` }],
                        isError: true,
                    };
                }
            }

            case 'create_listing': {
                const {
                    title, description: desc, price, currency: cur,
                    category: cat, sellerAddress: seller, sellerName,
                    condition: cond, quantity: qty, shipsTo, expiresInDays,
                    isPromo, shippingCost, promoQuantity,
                    fulfillmentType, pickupLocations
                } = args as any;

                const sellerAddr = seller || CONFIGURED_KEY;
                if (!sellerAddr) {
                    return {
                        content: [{ type: 'text', text: 'Error: Seller wallet address required. Set W3SHIP_PUBLIC_KEY or provide sellerAddress.' }],
                        isError: true,
                    };
                }

                // Seller verification — check if wallet has a registered identity
                try {
                    const verifyRes = await fetch(`${W3SHIP_API}/api/listing/verify-seller?publicKey=${encodeURIComponent(sellerAddr)}`);
                    const verifyData = await verifyRes.json() as any;
                    if (!verifyRes.ok || !verifyData.verified) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    error: 'Seller not verified',
                                    message: 'Your wallet address is not registered in the W3Ship identity ledger. To sell on the marketplace, register your identity first at w3ship.com or link your address via Dah.mx.',
                                    publicKey: sellerAddr.substring(0, 20) + '...',
                                    registerUrl: 'https://w3ship.com/setup-mcp',
                                }, null, 2)
                            }],
                            isError: true,
                        };
                    }
                } catch (e: any) {
                    // If verification service is down, log warning but allow (fail-open for demo)
                    console.warn(`[Listing] Seller verification failed (allowing): ${e.message}`);
                }

                const listingId = `LST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                const expDays = expiresInDays || 30;
                const expiresAt = new Date(Date.now() + expDays * 24 * 60 * 60 * 1000).toISOString();
                const currency = (cur || 'USDC').toUpperCase();
                const category = (cat || 'other').toLowerCase();
                const condition = cond || 'new';
                const quantity = qty || 1;
                const ships = shipsTo || ['US'];

                try {
                    const createRes = await fetch(`${W3SHIP_API}/api/listing`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: listingId, title, description: desc,
                            price: isPromo ? 0 : price,
                            currency, category: isPromo ? 'promotional' : category,
                            sellerAddress: sellerAddr,
                            sellerName, condition, quantity: isPromo ? (promoQuantity || quantity) : quantity,
                            shipsTo: ships, expiresAt,
                            isPromo: isPromo || undefined,
                            shippingCost: isPromo ? (shippingCost || 0) : undefined,
                            promoQuantity: isPromo ? (promoQuantity || quantity || 100) : undefined,
                            fulfillmentType: fulfillmentType || undefined,
                            pickupLocations: pickupLocations || undefined,
                        }),
                    });
                    const createData = await createRes.json() as any;
                    if (!createRes.ok) {
                        return { content: [{ type: 'text', text: `Error creating listing: ${createData.error || 'Unknown error'}` }], isError: true };
                    }

                    if (isPromo) {
                        const ft = fulfillmentType || (pickupLocations?.length ? 'pickup' : 'ship');
                        const pickupMsg = ft !== 'ship' && pickupLocations?.length
                            ? ` Pickup available at: ${pickupLocations.map((l: any) => l.name).join(', ')}.`
                            : '';
                        const shipMsg = ft !== 'pickup'
                            ? ` Shipping: ${shippingCost || 0} ${currency}.`
                            : '';
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    listing: {
                                        id: listingId, title, type: 'PROMOTIONAL',
                                        fulfillment: ft,
                                        ...(ft !== 'pickup' ? { shippingCost: `${shippingCost || 0} ${currency}` } : {}),
                                        ...(pickupLocations?.length ? { pickupLocations: pickupLocations.map((l: any) => ({ id: l.id, name: l.name, address: l.address })) } : {}),
                                        totalAvailable: promoQuantity || quantity || 100, expiresAt,
                                    },
                                    message: `🎁 Promotional listing created! "${title}" is FREE.${shipMsg}${pickupMsg} ${promoQuantity || quantity || 100} available. One per wallet.`,
                                    claimWith: `Customers use claim_promo(listingId: "${listingId}"${ft !== 'ship' ? ', fulfillmentChoice: "pickup"' : ''}) to claim.`,
                                }, null, 2)
                            }]
                        };
                    }

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                listing: { id: listingId, title, price: `${price} ${currency}`, category, condition, quantity, shipsTo: ships, expiresAt, payTo: sellerAddr },
                                message: `Listing created! Share listing ID "${listingId}" with buyers. Payment goes to ${sellerAddr}. Stored persistently in DynamoDB.`,
                                addToCart: `Buyers can use add_item with productOffering.id = "${listingId}" to add this to their cart.`,
                            }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error creating listing: ${e.message}` }], isError: true };
                }
            }

            case 'search_listings': {
                const { category: searchCat, keyword: searchKw, limit: searchLimit } = args as any;

                try {
                    const params = new URLSearchParams();
                    if (searchCat) params.set('category', searchCat.toLowerCase());
                    if (searchKw) params.set('keyword', searchKw);
                    if (searchLimit) params.set('limit', searchLimit.toString());

                    const searchRes = await fetch(`${W3SHIP_API}/api/listing?${params.toString()}`);
                    const searchData = await searchRes.json() as any;
                    if (!searchRes.ok) {
                        return { content: [{ type: 'text', text: `Error searching: ${searchData.error}` }], isError: true };
                    }

                    const listings = searchData.listings || [];
                    if (listings.length === 0) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    results: [],
                                    message: searchCat
                                        ? `No active listings in category "${searchCat}". Try: electronics, clothing, collectibles, home, sports, gifts, books, other.`
                                        : searchKw
                                            ? `No listings matching "${searchKw}".`
                                            : 'No active listings yet. Be the first — use create_listing to sell something!',
                                }, null, 2)
                            }]
                        };
                    }

                    const results = listings.map((l: any) => ({
                        id: l.id, title: l.title,
                        price: l.isPromo ? `FREE (shipping: ${l.shippingCost || 0} ${l.currency})` : `${l.price} ${l.currency}`,
                        category: l.category, condition: l.condition,
                        seller: l.sellerName || (l.sellerAddress?.substring(0, 10) + '...'),
                        shipsTo: l.shipsTo, quantity: l.quantity,
                        ...(l.isPromo ? { promo: true, remaining: l.promoQuantity ? l.promoQuantity - (l.promoClaimed || 0) : undefined } : {}),
                    }));

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                results, total: results.length,
                                message: `Found ${results.length} listing(s). Use get_listing with the ID for full details, or add_item with productOffering.id to add to cart.`,
                            }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error searching listings: ${e.message}` }], isError: true };
                }
            }

            case 'get_listing': {
                const { listingId } = args as any;
                try {
                    const getRes = await fetch(`${W3SHIP_API}/api/listing?id=${encodeURIComponent(listingId)}`);
                    const getData = await getRes.json() as any;
                    if (!getRes.ok || !getData.listing) {
                        return { content: [{ type: 'text', text: `Listing "${listingId}" not found.` }], isError: true };
                    }
                    const listing = getData.listing;
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                listing: {
                                    id: listing.id, title: listing.title, description: listing.description,
                                    price: `${listing.price} ${listing.currency}`, category: listing.category,
                                    condition: listing.condition, seller: listing.sellerName || listing.sellerAddress,
                                    paymentAddress: listing.sellerAddress, quantity: listing.quantity,
                                    shipsTo: listing.shipsTo, status: listing.status,
                                    createdAt: listing.createdAt, expiresAt: listing.expiresAt,
                                },
                                actions: {
                                    addToCart: `Use add_item with productOffering.id = "${listing.id}" and productOffering.name = "${listing.title}"`,
                                    payWith: `Send ${listing.price} ${listing.currency} to ${listing.sellerAddress}`,
                                },
                            }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error getting listing: ${e.message}` }], isError: true };
                }
            }

            case 'remove_listing': {
                const { listingId: removeId, sellerAddress: removeSeller } = args as any;
                const rmSeller = removeSeller || CONFIGURED_KEY;
                try {
                    const params = new URLSearchParams({ id: removeId });
                    if (rmSeller) params.set('seller', rmSeller);
                    const delRes = await fetch(`${W3SHIP_API}/api/listing?${params.toString()}`, { method: 'DELETE' });
                    const delData = await delRes.json() as any;
                    if (!delRes.ok) {
                        return { content: [{ type: 'text', text: `Error: ${delData.error || 'Failed to remove listing'}` }], isError: true };
                    }
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({ removed: removeId, message: delData.message || 'Listing removed.' }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error removing listing: ${e.message}` }], isError: true };
                }
            }

            case 'confirm_payment': {
                const { orderId: payOrderId, txHash, chainId: payChainId } = args as any;
                try {
                    const payRes = await fetch(`${W3SHIP_API}/api/order/pay`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            orderId: payOrderId,
                            txHash,
                            chainId: payChainId || 8453,
                        }),
                    });
                    const payData = await payRes.json() as any;

                    if (!payRes.ok) {
                        return {
                            content: [{ type: 'text', text: `Payment verification failed: ${payData.error || 'Unknown error'}` }],
                            isError: true,
                        };
                    }

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                verified: payData.verified,
                                orderId: payOrderId,
                                txHash,
                                status: payData.order?.paymentStatus || 'paid',
                                message: payData.verified
                                    ? `Payment verified! Order ${payOrderId} is confirmed. The seller will be notified to ship your item.`
                                    : `Payment could not be verified. Please check the transaction hash.`,
                            }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error verifying payment: ${e.message}` }], isError: true };
                }
            }

            case 'add_tracking': {
                const { orderId: trackOrderId, carrier: trackCarrier, trackingNumber: trackNum, sellerAddress: trackSeller } = args as any;
                try {
                    const trackRes = await fetch(`${W3SHIP_API}/api/shipment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            orderId: trackOrderId,
                            carrier: trackCarrier,
                            trackingNumber: trackNum,
                            sellerAddress: trackSeller || CONFIGURED_KEY,
                        }),
                    });
                    const trackData = await trackRes.json() as any;

                    if (!trackRes.ok) {
                        return {
                            content: [{ type: 'text', text: `Error adding tracking: ${trackData.error || 'Unknown error'}` }],
                            isError: true,
                        };
                    }

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                orderId: trackOrderId,
                                carrier: trackCarrier,
                                trackingNumber: trackNum,
                                shipmentId: trackData.shipment?.id || trackData.shipmentId,
                                message: `Tracking added! Buyer can now track their shipment via ${trackCarrier}: ${trackNum}`,
                            }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error adding tracking: ${e.message}` }], isError: true };
                }
            }

            case 'claim_promo': {
                const { listingId: claimListingId, publicKey: claimPK, fulfillmentChoice: claimFulfillment, pickupLocationId: claimPickupId } = args as any;
                const claimKey = claimPK || CONFIGURED_KEY;

                if (!claimKey) {
                    return {
                        content: [{ type: 'text', text: 'Error: Public key required to claim. Set W3SHIP_PUBLIC_KEY or provide publicKey.' }],
                        isError: true,
                    };
                }

                try {
                    const claimRes = await fetch(`${W3SHIP_API}/api/listing/claim`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            listingId: claimListingId,
                            publicKey: claimKey,
                            ...(claimFulfillment ? { fulfillmentChoice: claimFulfillment } : {}),
                            ...(claimPickupId ? { pickupLocationId: claimPickupId } : {}),
                        }),
                    });
                    const claimData = await claimRes.json() as any;

                    if (!claimRes.ok) {
                        return {
                            content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    claimed: false,
                                    error: claimData.error || 'Claim failed',
                                    alreadyClaimed: claimData.alreadyClaimed || false,
                                    ...(claimData.registerUrl ? { registerUrl: claimData.registerUrl } : {}),
                                    ...(claimData.pickupLocations ? { availablePickupLocations: claimData.pickupLocations } : {}),
                                }, null, 2)
                            }],
                            isError: true,
                        };
                    }

                    // Build response based on fulfillment type
                    const isPickup = claimData.fulfillment === 'pickup';
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                claimed: true,
                                claimId: claimData.claimId,
                                fulfillment: claimData.fulfillment || 'ship',
                                item: claimData.listing?.title,
                                ...(isPickup ? {
                                    pickupLocation: claimData.pickupLocation,
                                    instructions: claimData.instructions,
                                    cost: 'FREE',
                                } : {
                                    shippingCost: claimData.listing?.shippingCost
                                        ? `${claimData.listing.shippingCost} ${claimData.listing.currency}`
                                        : 'FREE',
                                }),
                                remaining: claimData.listing?.remaining,
                                message: claimData.message,
                                nextStep: isPickup
                                    ? `Show your claim ID "${claimData.claimId}" at ${claimData.pickupLocation?.name || 'the pickup location'} to collect your item.`
                                    : `Add listing "${claimListingId}" to your cart and create an order. ${claimData.listing?.shippingCost ? `You'll pay ${claimData.listing.shippingCost} ${claimData.listing.currency} for shipping.` : ''}`,
                            }, null, 2)
                        }]
                    };
                } catch (e: any) {
                    return { content: [{ type: 'text', text: `Error claiming promo: ${e.message}` }], isError: true };
                }
            }

            default:
                throw new Error("Unknown tool");
        }
    } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
});

/**
 * Main entry point.
 */
async function main() {
    const args = process.argv.slice(2);

    // --list-tools: Print available tools and exit (no Redis needed)
    if (args.includes('--list-tools')) {
        const toolNames = [
            'ship_address', 'create_cart', 'get_cart', 'add_item', 'delete_cart',
            'create_order', 'get_order', 'track_shipment',
            'get_available_slots', 'hold_slot', 'list_bookings',
            'generate_demo_key', 'get_identity',
            'get_swap_quote', 'check_token_approval',
            'create_listing', 'search_listings', 'get_listing', 'remove_listing',
            'confirm_payment', 'add_tracking', 'claim_promo',
        ];
        console.log(`\n📋 W3Ship Commerce MCP Server — Available Tools\n`);
        console.log('============================================================\n');
        for (const t of toolNames) {
            console.log(`  🟢 ${t}`);
        }
        console.log('\n============================================================\n');
        console.log(`  Total: ${toolNames.length} tools\n`);
        process.exit(0);
    }

    // --help
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
W3Ship Commerce MCP Server v1.6.0

Usage:
  w3ship-mcp-server              Start MCP server (stdio transport)
  w3ship-mcp-server --list-tools List all available tools and exit
  w3ship-mcp-server --help       Show this help message

Environment variables:
  W3SHIP_PUBLIC_KEY   Pre-configured public key (hex)
  W3SHIP_API_URL      API base URL (default: https://w3ship.com)
  UNISWAP_API_KEY     Uniswap Trading API key
  VALKEY_HOST          Redis/Valkey host (default: localhost)
  VALKEY_PORT          Redis/Valkey port (default: 6379)
  VALKEY_PASSWORD      Redis/Valkey password (optional)
`);
        process.exit(0);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("W3Ship Commerce MCP server running on stdio");
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});

