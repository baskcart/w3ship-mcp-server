import { z } from 'zod';

export const QuantitySchema = z.object({
    amount: z.number(),
    units: z.string().optional(),
});

export const MoneySchema = z.object({
    unit: z.string(),
    value: z.number(),
});

export const PriceSchema = z.object({
    priceType: z.string().optional(),
    recurringChargePeriod: z.string().optional(),
    unitOfMeasure: z.string().optional(),
    dutyFreeAmount: MoneySchema.optional(),
    taxIncludedAmount: MoneySchema.optional(),
    taxRate: z.number().optional(),
});

export const ProductOfferingRefSchema = z.object({
    id: z.string(),
    href: z.string().optional(),
    name: z.string().optional(),
});

export const CartItemSchema = z.object({
    id: z.string().optional(),
    quantity: QuantitySchema.optional(),
    unitPrice: PriceSchema.optional(),
    productOffering: ProductOfferingRefSchema,
    itemTerm: z.array(z.any()).optional(),
    itemPrice: z.array(PriceSchema).optional(),
});

export const ShoppingCartSchema = z.object({
    id: z.string(), // SLH-DSA Public Key (Hex strings)
    href: z.string().optional(),
    validFor: z.object({
        startDateTime: z.string().optional(),
        endDateTime: z.string().optional(),
    }).optional(),
    cartItem: z.array(CartItemSchema).optional(),
    cartTotalPrice: z.array(PriceSchema).optional(),
    customer: z.object({
        id: z.string(),
        href: z.string().optional(),
        name: z.string().optional(),
    }).optional(),
});

export type ShoppingCart = z.infer<typeof ShoppingCartSchema>;
export type CartItem = z.infer<typeof CartItemSchema>;
