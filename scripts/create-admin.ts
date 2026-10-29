// Creates (or resets) an admin account from the command line.
// Use it for recovery, e.g. if every admin is locked out:
//
//   npm run create-admin -- --email you@company.com --password "a-strong-pass" \
//     --name "Your Name" --org "Your Company"
//
// If an account with that email exists, it is promoted to ADMIN, re-enabled and
// given the new password. --org is only used when no organization exists yet.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const password = arg("password");
  const name = arg("name")?.trim() || "Administrator";
  const orgName = arg("org")?.trim();

  if (!email || !password) {
    throw new Error("Usage: npm run create-admin -- --email <email> --password <password> [--name <name>] [--org <company>]");
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({
        where: { email },
        data: { passwordHash, role: "ADMIN", active: true },
      });
      console.log(`Updated ${email}: role ADMIN, account enabled, password reset.`);
      return;
    }

    let org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!org) {
      if (!orgName) throw new Error("No organization exists yet; pass --org <company name>.");
      org = await prisma.organization.create({ data: { name: orgName } });
    }
    await prisma.user.create({
      data: { orgId: org.id, email, name, passwordHash, role: "ADMIN" },
    });
    console.log(`Created admin ${email} in "${org.name}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
