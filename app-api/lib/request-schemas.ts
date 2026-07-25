import * as z from "zod";

const emailInput = z
  .string({ error: "Email is required." })
  .trim()
  .min(1, { error: "Email is required." })
  .max(320, { error: "Email is too long." })
  .pipe(z.email({ error: "Enter a valid email address." }));

const loginPassword = z
  .string({ error: "Password is required." })
  .min(1, { error: "Password is required." })
  .max(1024, { error: "Password is too long." });

const strongPassword = z
  .string({ error: "Password is required." })
  .min(8, { error: "Password must be at least 8 characters." })
  .max(1024, { error: "Password is too long." })
  .regex(/[a-z]/, { error: "Password must contain a lowercase letter." })
  .regex(/[A-Z]/, { error: "Password must contain an uppercase letter." })
  .regex(/[0-9]/, { error: "Password must contain a digit." });

export const loginRequestSchema = z.object({
  email: emailInput,
  password: loginPassword,
});

export const registrationRequestSchema = z.object({
  name: z
    .string({ error: "Name is required." })
    .trim()
    .min(1, { error: "Name is required." })
    .max(200, { error: "Name is too long." }),
  email: emailInput,
  password: strongPassword,
});

const checkoutItemSchema = z.object({
  productId: z
    .string({ error: "Product ID is required." })
    .trim()
    .min(1, { error: "Product ID is required." }),
  quantity: z
    .number({ error: "Quantity must be a number." })
    .min(1, { error: "Quantity must be at least 1." }),
});

export const checkoutRequestSchema = z.object({
  items: z
    .array(checkoutItemSchema, { error: "Items must be an array." })
    .min(1, { error: "At least one item is required." }),
  successUrl: z
    .string({ error: "Success URL is required." })
    .trim()
    .min(1, { error: "Success URL is required." })
    .max(2048, { error: "Success URL is too long." }),
  cancelUrl: z
    .string({ error: "Cancel URL is required." })
    .trim()
    .min(1, { error: "Cancel URL is required." })
    .max(2048, { error: "Cancel URL is too long." }),
});

export const checkoutVerifyRequestSchema = z.object({
  sessionId: z
    .string({ error: "Session ID is required." })
    .trim()
    .min(1, { error: "Session ID is required." })
    .max(255, { error: "Session ID is too long." }),
});

export const mediaCreateRequestSchema = z.object({
  source: z.enum(["upload", "external"]).optional(),
  fileName: z
    .string({ error: "File name is required." })
    .trim()
    .min(1, { error: "File name is required." })
    .max(255, { error: "File name is too long." }),
  originalName: z.string().trim().max(255).optional().default(""),
  url: z.string().trim().max(2048).optional(),
  mimeType: z.string().trim().max(255).optional(),
  size: z
    .number({ error: "Size must be a number." })
    .int({ error: "Size must be an integer." })
    .min(0, { error: "Size cannot be negative." })
    .optional(),
  mediaType: z.enum(["image", "document", "file"]).optional(),
  altText: z.string().trim().max(1_000).optional(),
  base64Data: z
    .string({ error: "File data must be a string." })
    .max(700_000, { error: "File data is too large." })
    .optional(),
});

const metadataSchema = z.record(z.string(), z.unknown());
const productSlugSchema = z
  .string({ error: "Slug is required." })
  .trim()
  .min(1, { error: "Slug is required." })
  .max(50, { error: "Slug must be 50 characters or fewer." })
  .regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/, {
    error: "Slug must be alphanumeric with hyphens only.",
  });
const productNameSchema = z
  .string({ error: "Name is required." })
  .trim()
  .min(2, { error: "Name must be at least 2 characters." })
  .max(100, { error: "Name must be 100 characters or fewer." });
const productDescriptionSchema = z.string().trim().max(10_000).optional();
const productCurrencySchema = z
  .string()
  .trim()
  .min(1, { error: "Currency cannot be empty." })
  .max(12, { error: "Currency is too long." });
const productAccessKeysSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(200, { error: "Too many access keys." });

const embeddedProductPriceSchema = z.object({
  label: z.string().trim().max(100).optional().default(""),
  stripePriceId: z.string().trim().max(255).optional().default(""),
  mode: z.enum(["test", "live"]).optional().default("test"),
  amount: z
    .number({ error: "Price amount must be a number." })
    .min(0, { error: "Price amount cannot be negative." })
    .optional()
    .default(0),
  currency: productCurrencySchema.optional().default("USD"),
  interval: z.string().trim().max(50).optional(),
  startDate: z.string().trim().max(100).optional(),
  endDate: z.string().trim().max(100).optional(),
  isDefault: z.boolean().optional().default(false),
  stripeProductId: z.string().trim().max(255).optional(),
});

const productMutableFields = {
  name: productNameSchema,
  slug: productSlugSchema,
  description: productDescriptionSchema,
  type: z.enum(["physical", "digital", "membership"]).optional(),
  price: z
    .number({ error: "Price must be a number." })
    .min(0, { error: "Price must be zero or positive." })
    .optional(),
  currency: productCurrencySchema.optional(),
  paymentModel: z.enum(["one-time", "recurring"]).optional(),
  maxSubUsers: z
    .number({ error: "Maximum sub-users must be a number." })
    .int({ error: "Maximum sub-users must be an integer." })
    .min(-1, { error: "Maximum sub-users cannot be less than -1." })
    .optional(),
  accessKeys: productAccessKeysSchema.optional(),
  stripeTestProductId: z.string().trim().max(255).optional(),
  stripeLiveProductId: z.string().trim().max(255).optional(),
  sortOrder: z
    .number({ error: "Sort order must be a number." })
    .int({ error: "Sort order must be an integer." })
    .optional(),
  metadata: metadataSchema.optional(),
};

export const productCreateRequestSchema = z.object({
  ...productMutableFields,
  name: productNameSchema,
  slug: productSlugSchema,
  prices: z.array(embeddedProductPriceSchema).max(100).optional(),
});

export const productUpdateRequestSchema = z.object({
  name: productNameSchema.optional(),
  slug: productSlugSchema.optional(),
  description: productDescriptionSchema,
  type: z.enum(["physical", "digital", "membership"]).optional(),
  price: z
    .number({ error: "Price must be a number." })
    .min(0, { error: "Price must be zero or positive." })
    .optional(),
  currency: productCurrencySchema.optional(),
  paymentModel: z.enum(["one-time", "recurring"]).optional(),
  maxSubUsers: z
    .number({ error: "Maximum sub-users must be a number." })
    .int({ error: "Maximum sub-users must be an integer." })
    .min(-1, { error: "Maximum sub-users cannot be less than -1." })
    .optional(),
  accessKeys: productAccessKeysSchema.optional(),
  stripeTestProductId: z.string().trim().max(255).optional(),
  stripeLiveProductId: z.string().trim().max(255).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z
    .number({ error: "Sort order must be a number." })
    .int({ error: "Sort order must be an integer." })
    .optional(),
  metadata: metadataSchema.optional(),
});
