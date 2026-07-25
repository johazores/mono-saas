import * as z from "zod";

const priceLabelSchema = z
  .string({ error: "Label is required." })
  .trim()
  .min(1, { error: "Label is required." })
  .max(100, { error: "Label is too long." });

const stripePriceIdSchema = z
  .string({ error: "Stripe price ID is required." })
  .trim()
  .min(1, { error: "Stripe price ID is required." })
  .max(255, { error: "Stripe price ID is too long." });

const currencySchema = z
  .string({ error: "Currency is required." })
  .trim()
  .min(1, { error: "Currency is required." })
  .max(12, { error: "Currency is too long." });

const amountSchema = z
  .number({ error: "Amount must be a number." })
  .min(0, { error: "Amount cannot be negative." });

const dateSchema = z
  .string()
  .trim()
  .min(1, { error: "Date cannot be empty." })
  .max(100, { error: "Date is too long." })
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    error: "Enter a valid date.",
  });

const nullableEndDateSchema = z
  .string()
  .trim()
  .max(100, { error: "Date is too long." })
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), {
    error: "Enter a valid date.",
  });

const intervalSchema = z
  .union([z.enum(["month", "year"]), z.literal("")])
  .optional();

export const productPriceCreateRequestSchema = z.object({
  label: priceLabelSchema,
  stripePriceId: stripePriceIdSchema,
  mode: z.enum(["test", "live"]).optional().default("test"),
  amount: amountSchema,
  currency: currencySchema,
  interval: intervalSchema,
  startDate: dateSchema.optional(),
  endDate: nullableEndDateSchema.optional(),
  isDefault: z.boolean().optional().default(false),
  stripeProductId: z.string().trim().max(255).optional(),
});

export const productPriceUpdateRequestSchema = z.object({
  label: priceLabelSchema.optional(),
  stripePriceId: stripePriceIdSchema.optional(),
  mode: z.enum(["test", "live"]).optional(),
  amount: amountSchema.optional(),
  currency: currencySchema.optional(),
  interval: intervalSchema,
  startDate: dateSchema.optional(),
  endDate: nullableEndDateSchema.optional(),
  isDefault: z.boolean().optional(),
});
