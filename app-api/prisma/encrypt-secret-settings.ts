import { basePrisma } from "../lib/base-prisma";
import {
  decryptSettingValue,
  encryptSettingValue,
  getCurrentEncryptionKeyVersion,
  isEncryptedSettingValue,
} from "../lib/secret-crypto";
import { listSecretSettingKeys } from "../lib/setting-definitions";

async function main() {
  const currentVersion = getCurrentEncryptionKeyVersion();
  const settings = await basePrisma.siteSetting.findMany({
    where: { key: { in: listSecretSettingKeys() } },
  });

  let updated = 0;
  let skipped = 0;

  for (const setting of settings) {
    if (
      isEncryptedSettingValue(setting.value) &&
      setting.value.keyVersion === currentVersion
    ) {
      skipped += 1;
      continue;
    }

    const value = decryptSettingValue(setting.value);
    await basePrisma.siteSetting.update({
      where: { id: setting.id },
      data: { value: encryptSettingValue(value) as never },
    });
    updated += 1;
  }

  console.log(
    `Settings encryption migration complete: ${updated} updated, ${skipped} current.`,
  );
}

main()
  .catch((error) => {
    console.error("Settings encryption migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await basePrisma.$disconnect();
  });
