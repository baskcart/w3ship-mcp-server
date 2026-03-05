import { Redis } from 'ioredis';
import type { Shipment } from './models.js';

const VALKEY_HOST = process.env.VALKEY_HOST || 'localhost';
const VALKEY_PORT = parseInt(process.env.VALKEY_PORT || '6379');
const VALKEY_PASSWORD = process.env.VALKEY_PASSWORD;

class ShipmentService {
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
                    console.error('ShipmentService Valkey Error:', err.message);
                    this._errorLogged = true;
                }
            });
        }
        return this._client;
    }

    async createShipment(shipment: Shipment): Promise<void> {
        const client = this.getClient();
        await client.set(`shipment:${shipment.id}`, JSON.stringify(shipment));
        // Index by Order ID for easy lookup
        await client.set(`shipment:by_order:${shipment.orderId}`, shipment.id);
    }

    async getShipment(shipmentId: string): Promise<Shipment | null> {
        const data = await this.getClient().get(`shipment:${shipmentId}`);
        if (!data) return null;
        return JSON.parse(data);
    }

    async getShipmentByOrderId(orderId: string): Promise<Shipment | null> {
        const shipmentId = await this.getClient().get(`shipment:by_order:${orderId}`);
        if (!shipmentId) return null;
        return this.getShipment(shipmentId);
    }

    async updateShipment(shipment: Shipment): Promise<void> {
        await this.createShipment(shipment);
    }
}

export const shipmentService = new ShipmentService();

