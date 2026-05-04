import type { ComponentType } from "react";
import type { ContentFieldDefinition } from "@/types";

/**
 * Block Template Registry
 *
 * Maps block template slugs to custom React components.
 * When a page is rendered, BlockRenderer checks this registry first.
 * If a custom component is found for the template slug, it renders that.
 * Otherwise, it falls back to the generic field-type renderer.
 *
 * To add a custom template renderer:
 * 1. Create a component file in this directory (e.g., `hero-banner.tsx`)
 * 2. Import and register it in this file
 *
 * Example:
 *   import { HeroBanner } from "./hero-banner";
 *   templateRegistry["hero-banner"] = HeroBanner;
 */

export type BlockTemplateProps = {
  data: Record<string, unknown>;
  fields: ContentFieldDefinition[];
};

/**
 * Registry mapping template slugs to custom renderer components.
 * Components receive the block data and field definitions.
 */
export const templateRegistry: Record<string, ComponentType<BlockTemplateProps>> = {
  // Register custom template renderers here:
  // "hero-banner": HeroBanner,
  // "feature-grid": FeatureGrid,
  // "testimonial-slider": TestimonialSlider,
};
