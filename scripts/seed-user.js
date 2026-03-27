require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'ti@prolinepet.com.br';
  const plain = 'Proli123';
  const name = 'TI Prolinepet';

  const passwordHash = await bcrypt.hash(plain, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { password: passwordHash, name },
    create: { email, password: passwordHash, name }
  });

  console.log('Usuario criado/atualizado:', { id: user.id, email: user.email });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
