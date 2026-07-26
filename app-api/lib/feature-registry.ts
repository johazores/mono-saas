import { getAppEnv } from "@/lib/env";
import { getTenantId } from "@/lib/request-scope";
import { featureRepository } from "@/repositories/feature-repository";
import type { FeatureDefinition } from "@/types";

const CACHE_TTL = 60_000;
const cache = new Map<
  string,
  { value: FeatureDefinition[]; expiresAt: number }
>();

async function featureCacheKey(): Promise<string> {
  const tenantId = getTenantId();
  return tenantId ? `tenant:${tenantId}` : `env:${await getAppEnv()}`;
}

export async function getAllFeatures(): Promise<FeatureDefinition[]> {
  const key = await featureCacheKey();
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now < cached.expiresAt) return cached.value;

  const rows = await featureRepository.list();
  const value = rows.map((r) => ({
    key: r.key,
    description: r.description,
    category: r.category,
  }));
  cache.set(key, { value, expiresAt: now + CACHE_TTL });
  return value;
}

export function invalidateFeatureCache(): void {
  cache.clear();
}

export async function getFeatureDefinition(
  key: string,
): Promise<FeatureDefinition | undefined> {
  const features = await getAllFeatures();
  return features.find((f) => f.key === key);
}

export function isFeatureEnabled(planFeatures: string[], key: string): boolean {
  return planFeatures.includes(key);
}

export async function getEnabledFeatures(
  planFeatures: string[],
): Promise<FeatureDefinition[]> {
  const all = await getAllFeatures();
  const set = new Set(planFeatures);
  return all.filter((f) => set.has(f.key));
}
