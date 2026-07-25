import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  implements OnModuleInit, OnModuleDestroy 
{
  readonly prisma: PrismaClient;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    this.prisma = new PrismaClient({ adapter });
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  get users() {
    return this.prisma.users;
  }

  get wallets() {
    return this.prisma.wallets;
  }

  get activityLogs() {
    return this.prisma.activityLogs;
  }

  get incomes() {
    return this.prisma.incomes;
  }

  get expenses() {
    return this.prisma.expenses;
  }

  get categories() {
    return this.prisma.categories;
  }


  get sessions() {
    return this.prisma.userSession;
  }
  async testConnection(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
