import { z } from "zod";

export const ProductOfferingSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
});

export const OrderItemSchema = z.object({
    id: z.string(),
    quantity: z.number().int().positive(),
    productOffering: ProductOfferingSchema,
    state: z.enum(["Pending", "Reserved", "Allocated"]).default("Pending"),
});

export const OrderSchema = z.object({
    id: z.string(),
    href: z.string().optional(),
    orderDate: z.string().datetime(),
    description: z.string().optional(),
    state: z.enum(["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"]).default("Pending"),
    orderItem: z.array(OrderItemSchema),
    totalPrice: z.number().nonnegative().optional(),
    // Link to the customer who placed the order (Public Key)
    relatedParty: z.array(z.object({
        id: z.string(),
        role: z.string(),
        name: z.string().optional(),
    })).optional(),
});

export type Order = z.infer<typeof OrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
