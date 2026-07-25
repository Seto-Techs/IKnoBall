import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import bcrypt from "bcrypt";
import { DEFAULT_CATEGORIES } from "../src/finance/default-categories";

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {

  await clearDB();
  // 1. User
  const user = await prisma.users.upsert({
    where: { email: "demo@duitrapi.dev" },
    update: {},
    create: {
      email: "demo@duitrapi.dev",
      name: "Demo User",
      passwordHash: bcrypt.hashSync("password", 10),
      isVerified: true,
      verifiedAt: new Date(),
    },
  });

  await prisma.categories.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      userId: user.id,
      name: category.name,
      type: category.type,
      colorHex: category.colorHex,
      icon: category.icon,
    })),
  });

  const salaryCategory = await prisma.categories.findFirstOrThrow({
    where: { userId: user.id, name: "Salary", type: "income", deletedAt: null },
  });

  const snacksCategory = await prisma.categories.findFirstOrThrow({
    where: { userId: user.id, name: "Snacks", type: "expense", deletedAt: null },
  });

  const billsCategory = await prisma.categories.findFirstOrThrow({
    where: { userId: user.id, name: "Bills", type: "expense", deletedAt: null },
  });

  // 2. Wallets
  const cashWallet = await prisma.wallets.create({
    data: {
      userId: user.id,
      name: "Cash",
    },
  });

  const bankWallet = await prisma.wallets.create({
    data: {
      userId: user.id,
      name: "Bank",
    },
  });

  // 3. Income
  await prisma.incomes.create({
    data: {
      userId: user.id,
      walletId: bankWallet.id,
      categoryId: salaryCategory.id,
      amount: 5_000_000,
      occurredAt: new Date("2025-01-01"),
    },
  });

  // 4. Expenses
  await prisma.expenses.createMany({
    data: [
      {
        userId: user.id,
        walletId: cashWallet.id,
        categoryId: snacksCategory.id,
        amount: 50_000,
        note: "Lunch",
        occurredAt: new Date("2025-01-02"),
      },
      {
        userId: user.id,
        walletId: bankWallet.id,
        categoryId: billsCategory.id,
        amount: 1_500_000,
        occurredAt: new Date("2025-01-03"),
      },
    ],
  });

  console.log("🌱 Seeder done");
}

async function clearDB() {
  await prisma.incomes.deleteMany();
  await prisma.expenses.deleteMany();
  await prisma.categories.deleteMany();
  await prisma.wallets.deleteMany();
  await prisma.users.deleteMany();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
