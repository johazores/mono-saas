import { productRepository } from "@/repositories/product-repository";
import { productPriceService } from "@/services/product-price-service";
import type {
  CreateProductWithPricesInput,
  UpdateProductInput,
  ProductRecord,
} from "@/types";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_TYPES = ["physical", "digital", "membership"];
const ALLOWED_PAYMENT_MODELS = ["one-time", "recurring"];

function validateSlug(slug: string): string {
  const cleaned = slug.toLowerCase().trim();
  if (!cleaned || !SLUG_REGEX.test(cleaned)) {
    throw new Error("Slug must be lowercase alphanumeric with hyphens only.");
  }
  if (cleaned.length > 50) {
    throw new Error("Slug must be 50 characters or fewer.");
  }
  return cleaned;
}

export const productService = {
  list() {
    return productRepository.list();
  },

  listAll() {
    return productRepository.listAll();
  },

  getById(id: string) {
    return productRepository.findById(id);
  },

  getBySlug(slug: string) {
    return productRepository.findBySlug(slug);
  },

  async create(input: CreateProductWithPricesInput): Promise<ProductRecord> {
    const name = (input.name || "").trim();
    if (name.length < 2 || name.length > 100) {
      throw new Error("Name must be between 2 and 100 characters.");
    }

    const slug = validateSlug(input.slug);
    const existing = await productRepository.findBySlug(slug);
    if (existing) throw new Error("A product with this slug already exists.");

    const price = input.price ?? 0;
    if (price < 0) throw new Error("Price must be zero or positive.");

    const type = ALLOWED_TYPES.includes(input.type ?? "physical")
      ? (input.type ?? "physical")
      : "physical";

    const paymentModel = ALLOWED_PAYMENT_MODELS.includes(
      input.paymentModel ?? "one-time",
    )
      ? (input.paymentModel ?? "one-time")
      : "one-time";

    const product = (await productRepository.create({
      name,
      slug,
      description: input.description || null,
      type,
      price,
      currency: (input.currency || "USD").toUpperCase().trim(),
      paymentModel,
      maxSubUsers: input.maxSubUsers ?? 0,
      accessKeys: input.accessKeys ?? [],
      sortOrder: input.sortOrder ?? 0,
      metadata: (input.metadata ?? null) as never,
    })) as ProductRecord;

    // Create embedded prices if provided. Controller validation guarantees
    // every price already has typed values and defaults.
    if (input.prices?.length) {
      for (const p of input.prices) {
        await productPriceService.create({
          productId: product.id,
          label: p.label,
          stripePriceId: p.stripePriceId,
          mode: p.mode,
          amount: p.amount,
          currency: p.currency,
          interval: p.interval,
          startDate: p.startDate,
          endDate: p.endDate,
          isDefault: p.isDefault,
          stripeProductId: p.stripeProductId,
        });
      }
    }

    return product;
  },

  async update(
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductRecord | null> {
    const current = await productRepository.findById(id);
    if (!current) throw new Error("Product not found.");

    const data: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 2 || name.length > 100) {
        throw new Error("Name must be between 2 and 100 characters.");
      }
      data.name = name;
    }

    if (input.slug !== undefined) {
      const slug = validateSlug(input.slug);
      if (slug !== current.slug) {
        const existing = await productRepository.findBySlug(slug);
        if (existing)
          throw new Error("A product with this slug already exists.");
      }
      data.slug = slug;
    }

    if (input.description !== undefined)
      data.description = input.description || null;
    if (input.price !== undefined) {
      if (input.price < 0) throw new Error("Price must be zero or positive.");
      data.price = input.price;
    }
    if (input.currency !== undefined)
      data.currency = input.currency.toUpperCase().trim();
    if (input.type !== undefined) {
      if (!ALLOWED_TYPES.includes(input.type))
        throw new Error("Invalid product type.");
      data.type = input.type;
    }
    if (input.paymentModel !== undefined) {
      if (!ALLOWED_PAYMENT_MODELS.includes(input.paymentModel))
        throw new Error("Invalid payment model.");
      data.paymentModel = input.paymentModel;
    }
    if (input.accessKeys !== undefined) data.accessKeys = input.accessKeys;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.maxSubUsers !== undefined) data.maxSubUsers = input.maxSubUsers;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.metadata !== undefined)
      data.metadata = (input.metadata ?? null) as never;

    if (Object.keys(data).length === 0) throw new Error("No fields to update.");

    return productRepository.update(id, data) as Promise<ProductRecord>;
  },

  async deactivate(id: string): Promise<ProductRecord | null> {
    const current = await productRepository.findById(id);
    if (!current) throw new Error("Product not found.");

    const activeCount = await productRepository.countActivePurchases(id);
    if (activeCount > 0) {
      throw new Error(
        "Cannot deactivate a product with active purchases. Reassign users first.",
      );
    }

    return productRepository.update(id, {
      isActive: false,
    }) as Promise<ProductRecord>;
  },
};
