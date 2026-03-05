import { Redis } from 'ioredis';
import type { Shipment } from './models.js';

const VALKEY_HOST = process.env.VALKEY_HOST || 'localhost';
const VALKEY_PORT = parseInt(process.env.VALKEY_PORT || '6379');
const VALKEY_PASSWORD = process.env.VALKEY_PASSWORD;

class ShipmentService {
    private client: Redis;

    constructor() {
        const options: any = {
            host: VALKEY_HOST,
            port: VALKEY_PORT,
        };
        if (VALKEY_PASSWORD) options.password = VALKEY_PASSWORD;

        this.client = new Redis(options);
        this.client.on('error', (err: Error) => console.error('ShipmentService Valkey Error', err));
    }

    async createShipment(shipment: Shipment): Promise<void> {
        await this.client.set(`shipment:${shipment.id}`, JSON.stringify(shipment));
        // Index by Order ID for easy lookup
        await this.client.set(`shipment:by_order:${shipment.orderId}`, shipment.id);
    }

    async getShipment(shipmentId: string): Promise<Shipment | null> {
        const data = await this.client.get(`shipment:${shipmentId}`);
        if (!data) return null;
        return JSON.parse(data);
    }

    async getShipmentByOrderId(orderId: string): Promise<Shipment | null> {
        const shipmentId = await this.client.get(`shipment:by_order:${orderId}`);
        if (!shipmentId) return null;
        return this.getShipment(shipmentId);
    }

    async updateShipment(shipment: Shipment): Promise<void> {
        await this.createShipment(shipment);
    }
}

export const shipmentService = new ShipmentService();
