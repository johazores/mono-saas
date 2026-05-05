import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@admin.com";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.ADMIN_NAME || "Admin";

  const passwordHash = hashPassword(password);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      name,
      email,
      passwordHash,
      role: "admin",
      status: "active",
    },
  });

  console.log(`Admin seeded: ${admin.email} (role: ${admin.role})`);
}

main()
  .catch((e) => {
    console.error("Seed admin failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
