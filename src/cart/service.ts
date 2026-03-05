import { Redis } from 'ioredis';
import type { ShoppingCart } from './models.js';

const VALKEY_HOST = process.env.VALKEY_HOST || 'localhost';
const VALKEY_PORT = parseInt(process.env.VALKEY_PORT || '6379');
const VALKEY_PASSWORD = process.env.VALKEY_PASSWORD;

export interface Listing {
    id: string;
    title: string;
    description: string;
    price: number;
    currency: string;
    category: string;
    sellerAddress: string;    // wallet address for payment
    sellerName?: string;
    imageUrl?: string;
    condition?: 'new' | 'like_new' | 'used' | 'refurbished';
    quantity: number;
    shipsTo?: string[];       // e.g. ['US', 'CA', 'EU']
    status: 'active' | 'sold' | 'expired';
    createdAt: string;
    expiresAt?: string;       // optional expiry
}

class ValkeyService {
    private client: Redis;

    constructor() {
        const options: any = {
            host: VALKEY_HOST,
            port: VALKEY_PORT,
        };
        if (VALKEY_PASSWORD) options.password = VALKEY_PASSWORD;

        this.client = new Redis(options);

        this.client.on('error', (err: Error) => console.error('Valkey Client Error', err));
    }

    // ── Cart Methods ──

    async getCart(cartId: string): Promise<ShoppingCart | null> {
        const data = await this.client.get(`cart:${cartId}`);
        if (!data) return null;
        return JSON.parse(data);
    }

    async saveCart(cart: ShoppingCart): Promise<void> {
        await this.client.set(`cart:${cart.id}`, JSON.stringify(cart));
    }

    async deleteCart(cartId: string): Promise<void> {
        await this.client.del(`cart:${cartId}`);
    }

    // ── Listing Methods ──

    async saveListing(listing: Listing): Promise<void> {
        await this.client.set(`listing:${listing.id}`, JSON.stringify(listing));
        // Index in active listings sorted set (score = timestamp for ordering)
        if (listing.status === 'active') {
            await this.client.zadd('listings:active', Date.now(), listing.id);
            // Index by category
            if (listing.category) {
                await this.client.sadd(`listings:cat:${listing.category.toLowerCase()}`, listing.id);
            }
        }
    }

    async getListing(listingId: string): Promise<Listing | null> {
        const data = await this.client.get(`listing:${listingId}`);
        if (!data) return null;
        return JSON.parse(data);
    }

    async deleteListing(listingId: string): Promise<void> {
        const listing = await this.getListing(listingId);
        await this.client.del(`listing:${listingId}`);
        await this.client.zrem('listings:active', listingId);
        if (listing?.category) {
            await this.client.srem(`listings:cat:${listing.category.toLowerCase()}`, listingId);
        }
    }

    async searchListings(opts: { category?: string; keyword?: string; limit?: number }): Promise<Listing[]> {
        const limit = opts.limit || 20;
        let listingIds: string[];

        if (opts.category) {
            // Get IDs from category index
            listingIds = await this.client.smembers(`listings:cat:${opts.category.toLowerCase()}`);
        } else {
            // Get most recent active listings
            listingIds = await this.client.zrevrange('listings:active', 0, limit - 1);
        }

        const listings: Listing[] = [];
        for (const id of listingIds.slice(0, limit)) {
            const listing = await this.getListing(id);
            if (listing && listing.status === 'active') {
                // Keyword filter
                if (opts.keyword) {
                    const kw = opts.keyword.toLowerCase();
                    const text = `${listing.title} ${listing.description} ${listing.category}`.toLowerCase();
                    if (!text.includes(kw)) continue;
                }
                listings.push(listing);
            }
        }

        return listings;
    }
}

export const valkeyService = new ValkeyService();

