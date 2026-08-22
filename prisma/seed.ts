import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Iniciando seed do banco de dados...');

  const passwordHash = await bcrypt.hash('senhaSegura123', 10);

  const users = [
    {
      username: 'mariana',
      name: 'Mariana Souza',
      email: 'mariana@teste.com',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
    {
      username: 'carlos',
      name: 'Carlos Silva',
      email: 'carlos@teste.com',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    },
    {
      username: 'felipe',
      name: 'Felipe Carvalho',
      email: 'felipe@teste.com',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
    },
  ];

  for (const user of users) {
    const created = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl,
        passwordHash: user.passwordHash,
      },
      create: user,
    });
    console.log(`Usuário pronto: ${created.name} (@${created.username}) - ${created.email}`);
  }

  console.log('Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
