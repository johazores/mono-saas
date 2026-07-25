import { settingService } from "@/services/setting-service";
import type { StorageProviderInterface } from "@/types";
import { createS3CompatibleStorageProvider } from "./s3-compatible-provider";

export async function getStorageProvider(): Promise<StorageProviderInterface> {
  const config = await settingService.getStorageConfig();
  if (!config) {
    throw new Error("Object storage is not configured.");
  }

  switch (config.provider) {
    case "s3-compatible":
      return createS3CompatibleStorageProvider(config.s3);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unsupported storage provider: ${exhaustive}`);
    }
  }
}
