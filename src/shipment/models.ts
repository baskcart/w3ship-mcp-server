import { z } from "zod";

export const ShipmentSchema = z.object({
    id: z.string(),
    orderId: z.string(), // Link back to the order
    trackingNumber: z.string(),
    carrier: z.string(),
    status: z.enum(["Label Created", "Picked Up", "In Transit", "Out for Delivery", "Delivered", "Exception"]),
    estimatedDelivery: z.string().datetime().optional(),
    origin: z.object({
        address: z.string(),
        city: z.string(),
        country: z.string(),
    }).optional(),
    destination: z.object({
        address: z.string(),
        city: z.string(),
        country: z.string(),
    }),
    events: z.array(z.object({
        timestamp: z.string().datetime(),
        status: z.string(),
        location: z.string().optional(),
        description: z.string().optional(),
    })).default([]),
});

export type Shipment = z.infer<typeof ShipmentSchema>;
