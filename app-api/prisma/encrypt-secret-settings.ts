import { basePrisma } from "../lib/base-prisma";
import {
  encryptSettingValue,
  isEncryptedSettingValue,
} from "../lib/secret-crypto";
import { listSecretSettingKeys } from "../lib/setting-definitions";

async function main() {
  const secretKeys = listSecretSettingKeys();
  const settings = await basePrisma.siteSetting.findMany({
    where: { key: { in: secretKeys } },
  });

  let migrated = 0;
  let skipped = 0;

  for (const setting of settings) {
    if (isEncryptedSettingValue(setting.value)) {
      skipped += 1;
      continue;
    }

    await basePrisma.siteSetting.update({
      where: { id: setting.id },
      data: { value: encryptSettingValue(setting.value) as never },
    });
    migrated += 1;
  }

  console.log(
    `Secret settings migration complete: ${migrated} encrypted, ${skipped} already encrypted.`,
  );
}

main()
  .catch((error) => {
    console.error("Secret settings migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await basePrisma.$disconnect();
  });
