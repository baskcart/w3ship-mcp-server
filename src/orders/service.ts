import { Redis } from 'ioredis';
import type { Order } from './models.js';

const VALKEY_HOST = process.env.VALKEY_HOST || 'localhost';
const VALKEY_PORT = parseInt(process.env.VALKEY_PORT || '6379');
const VALKEY_PASSWORD = process.env.VALKEY_PASSWORD;

class OrderService {
    private _client: Redis | null = null;
    private _errorLogged = false;

    private getClient(): Redis {
        if (!this._client) {
            const options: any = {
                host: VALKEY_HOST,
                port: VALKEY_PORT,
                maxRetriesPerRequest: 3,
                retryStrategy: (times: number) => {
                    if (times > 3) return null;
                    return Math.min(times * 200, 2000);
                },
            };
            if (VALKEY_PASSWORD) options.password = VALKEY_PASSWORD;

            this._client = new Redis(options);
            this._client.on('error', (err: Error) => {
                if (!this._errorLogged) {
                    console.error('OrderService Valkey Error:', err.message);
                    this._errorLogged = true;
                }
            });
        }
        return this._client;
    }

    async createOrder(order: Order): Promise<void> {
        await this.getClient().set(`order:${order.id}`, JSON.stringify(order));
    }

    async getOrder(orderId: string): Promise<Order | null> {
        const data = await this.getClient().get(`order:${orderId}`);
        if (!data) return null;
        return JSON.parse(data);
    }

    async updateOrder(order: Order): Promise<void> {
        await this.getClient().set(`order:${order.id}`, JSON.stringify(order));
    }
}

export const orderService = new OrderService();

