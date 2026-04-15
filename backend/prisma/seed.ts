import { PrismaClient, LifeArea } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create demo user
  const passwordHash = await bcrypt.hash('demo1234', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@plm.app' },
    update: {},
    create: {
      email: 'demo@plm.app',
      passwordHash,
      displayName: 'Demo User',
    },
  });

  console.log(`Created user: ${user.email}`);

  // Create finance categories
  const categories = [
    { name: 'Salaire', lifeArea: LifeArea.CARRIERE, type: 'INCOME' as const, budgetMonthly: null },
    { name: 'Courses', lifeArea: LifeArea.SANTE, type: 'EXPENSE' as const, budgetMonthly: 400 },
    { name: 'Restaurant', lifeArea: LifeArea.LOISIRS, type: 'EXPENSE' as const, budgetMonthly: 150 },
    { name: 'Transport', lifeArea: LifeArea.ORGANISATION, type: 'EXPENSE' as const, budgetMonthly: 80 },
    { name: 'Sport', lifeArea: LifeArea.SANTE, type: 'EXPENSE' as const, budgetMonthly: 50 },
    { name: 'Formation', lifeArea: LifeArea.DEVELOPPEMENT_PERSONNEL, type: 'EXPENSE' as const, budgetMonthly: 100 },
    { name: 'Loyer', lifeArea: LifeArea.ENVIRONNEMENT, type: 'EXPENSE' as const, budgetMonthly: 900 },
    { name: 'Sortie couple', lifeArea: LifeArea.AMOUR_ET_COUPLE, type: 'EXPENSE' as const, budgetMonthly: 100 },
  ];

  for (const cat of categories) {
    await prisma.financeCategory.create({
      data: { ...cat, userId: user.id },
    });
  }
  console.log(`Created ${categories.length} finance categories`);

  // Create time allocations
  const allocations = [
    { lifeArea: LifeArea.SANTE, percentage: 10 },
    { lifeArea: LifeArea.AMOUR_ET_COUPLE, percentage: 10 },
    { lifeArea: LifeArea.CARRIERE, percentage: 25 },
    { lifeArea: LifeArea.FINANCES, percentage: 5 },
    { lifeArea: LifeArea.LOISIRS, percentage: 10 },
    { lifeArea: LifeArea.DEVELOPPEMENT_PERSONNEL, percentage: 10 },
    { lifeArea: LifeArea.FAMILLE_ET_AMIS, percentage: 10 },
    { lifeArea: LifeArea.ENVIRONNEMENT, percentage: 5 },
    { lifeArea: LifeArea.ORGANISATION, percentage: 10 },
    { lifeArea: LifeArea.ADMINISTRATIF, percentage: 5 },
  ];

  for (const alloc of allocations) {
    await prisma.timeAllocation.create({
      data: { ...alloc, userId: user.id },
    });
  }
  console.log('Created time allocations');

  // Routines are created from presets in the UI — no sample data here.
  // Users can click "+ Add to my routines" on the Miracle Morning (SAVERS)
  // preset on the Routines page to get the only template we ship.

  // Create sample objectives
  const objectives = [
    { lifeArea: LifeArea.SANTE, title: 'Run 5km in under 25 minutes', progressPct: 40 },
    { lifeArea: LifeArea.CARRIERE, title: 'Launch PLM app MVP', progressPct: 15 },
    { lifeArea: LifeArea.FINANCES, title: 'Save 6 months emergency fund', progressPct: 60 },
    { lifeArea: LifeArea.DEVELOPPEMENT_PERSONNEL, title: 'Read 24 books this year', progressPct: 25 },
  ];

  for (const obj of objectives) {
    await prisma.lifeAreaObjective.create({
      data: { ...obj, userId: user.id, status: 'ACTIVE' },
    });
  }
  console.log(`Created ${objectives.length} objectives`);

  // Create sample ingredients
  const ingredients = [
    { name: 'Tomates', defaultUnit: 'kg', defaultPrice: 3.50, purchaseLocation: 'Carrefour', isOnline: false },
    { name: 'Poulet', defaultUnit: 'kg', defaultPrice: 8.99, purchaseLocation: 'Carrefour', isOnline: false },
    { name: 'Riz basmati', defaultUnit: 'kg', defaultPrice: 2.50, purchaseLocation: 'Carrefour', isOnline: false },
    { name: 'Huile olive', defaultUnit: 'L', defaultPrice: 6.99, purchaseLocation: 'Carrefour', isOnline: false },
    { name: 'Proteine whey', defaultUnit: 'kg', defaultPrice: 29.99, purchaseLocation: 'Amazon', isOnline: true },
  ];

  for (const ing of ingredients) {
    await prisma.ingredient.create({
      data: { ...ing, userId: user.id },
    });
  }
  console.log(`Created ${ingredients.length} ingredients`);

  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
