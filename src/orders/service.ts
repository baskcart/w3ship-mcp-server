import { Redis } from 'ioredis';
import type { Order } from './models.js';

const VALKEY_HOST = process.env.VALKEY_HOST || 'localhost';
const VALKEY_PORT = parseInt(process.env.VALKEY_PORT || '6379');
const VALKEY_PASSWORD = process.env.VALKEY_PASSWORD;

class OrderService {
    private client: Redis;

    constructor() {
        const options: any = {
            host: VALKEY_HOST,
            port: VALKEY_PORT,
        };
        if (VALKEY_PASSWORD) options.password = VALKEY_PASSWORD;

        this.client = new Redis(options);
        this.client.on('error', (err: Error) => console.error('OrderService Valkey Error', err));
    }

    async createOrder(order: Order): Promise<void> {
        await this.client.set(`order:${order.id}`, JSON.stringify(order));
    }

    async getOrder(orderId: string): Promise<Order | null> {
        const data = await this.client.get(`order:${orderId}`);
        if (!data) return null;
        return JSON.parse(data);
    }
}

export const orderService = new OrderService();
