import { prisma } from '../../config/database';

/**
 * Export / import of a user's full application state as a single JSON
 * document. The backup is scoped to the current user — no cross-user data
 * ever leaves or enters through this module.
 *
 * Import strategy: wipe-and-replace (transactional). The user row itself is
 * preserved — we only rewrite its owned data.
 */

export const BACKUP_VERSION = 1;

export interface BackupDocument {
  version: number;
  exportedAt: string;
  user: {
    email: string;
    displayName: string;
  };
  data: {
    settings: unknown | null;
    lifeAreaPreferences: unknown[];
    timeAllocations: unknown[];
    objectives: unknown[];

    financeCategories: unknown[];
    capitalAccounts: unknown[];
    financeRecurringSeries: unknown[];
    financeTransactions: unknown[];

    calendarEvents: unknown[];

    ingredients: unknown[];
    recipes: unknown[];
    recipeIngredients: unknown[];
    menus: unknown[];
    menuRecipes: unknown[];
    shoppingLists: unknown[];
    shoppingListItems: unknown[];

    routines: unknown[];
    routineSteps: unknown[];
    recurringRules: unknown[];
  };
}

export class BackupService {
  async exportAll(userId: string): Promise<BackupDocument> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, displayName: true },
    });

    const [
      settings,
      lifeAreaPreferences,
      timeAllocations,
      objectives,
      financeCategories,
      capitalAccounts,
      financeRecurringSeries,
      financeTransactions,
      calendarEvents,
      ingredients,
      recipes,
      menus,
      shoppingLists,
      routines,
      recurringRules,
    ] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.lifeAreaPreference.findMany({ where: { userId } }),
      prisma.timeAllocation.findMany({ where: { userId } }),
      prisma.lifeAreaObjective.findMany({ where: { userId } }),
      prisma.financeCategory.findMany({ where: { userId } }),
      prisma.capitalAccount.findMany({ where: { userId } }),
      prisma.financeRecurringSeries.findMany({ where: { userId } }),
      prisma.financeTransaction.findMany({ where: { userId } }),
      prisma.calendarEvent.findMany({ where: { userId } }),
      prisma.ingredient.findMany({ where: { userId } }),
      prisma.recipe.findMany({
        where: { userId },
        include: { ingredients: true },
      }),
      prisma.menu.findMany({
        where: { userId },
        include: { recipes: true },
      }),
      prisma.shoppingList.findMany({
        where: { userId },
        include: { items: true },
      }),
      prisma.routine.findMany({ where: { userId }, include: { steps: true } }),
      prisma.recurringRule.findMany({ where: { userId } }),
    ]);

    const routineSteps: unknown[] = [];
    for (const r of routines as any[]) {
      for (const step of r.steps ?? []) routineSteps.push(step);
    }
    const routinesFlat = (routines as any[]).map(({ steps: _s, ...rest }) => rest);

    const recipeIngredients: unknown[] = [];
    for (const r of recipes as any[]) {
      for (const ri of r.ingredients ?? []) recipeIngredients.push(ri);
    }
    const recipesFlat = (recipes as any[]).map(({ ingredients: _i, ...rest }) => rest);

    const menuRecipes: unknown[] = [];
    for (const menu of menus as any[]) {
      for (const entry of menu.recipes ?? []) menuRecipes.push(entry);
    }
    const menusFlat = (menus as any[]).map(({ recipes: _r, ...rest }) => rest);

    const shoppingListItems: unknown[] = [];
    for (const list of shoppingLists as any[]) {
      for (const item of list.items ?? []) shoppingListItems.push(item);
    }
    const shoppingListsFlat = (shoppingLists as any[]).map(({ items: _i, ...rest }) => rest);

    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      user,
      data: {
        settings: settings as unknown,
        lifeAreaPreferences,
        timeAllocations,
        objectives,
        financeCategories,
        capitalAccounts,
        financeRecurringSeries,
        financeTransactions,
        calendarEvents,
        ingredients,
        recipes: recipesFlat,
        recipeIngredients,
        menus: menusFlat,
        menuRecipes,
        shoppingLists: shoppingListsFlat,
        shoppingListItems,
        routines: routinesFlat,
        routineSteps,
        recurringRules,
      },
    };
  }

  async importAll(userId: string, doc: BackupDocument): Promise<{ restored: Record<string, number> }> {
    if (!doc || typeof doc !== 'object' || doc.version == null) {
      throw new Error('Invalid backup document');
    }
    if (doc.version > BACKUP_VERSION) {
      throw new Error(`Backup version ${doc.version} is newer than supported (${BACKUP_VERSION})`);
    }

    const d = doc.data;
    const restored: Record<string, number> = {};

    await prisma.$transaction(
      async (tx) => {
        // Wipe in FK-safe order
        await tx.shoppingListItem.deleteMany({ where: { list: { userId } } });
        await tx.shoppingList.deleteMany({ where: { userId } });
        await tx.menuRecipe.deleteMany({ where: { menu: { userId } } });
        await tx.menu.deleteMany({ where: { userId } });
        await tx.recipeIngredient.deleteMany({ where: { recipe: { userId } } });
        await tx.recipe.deleteMany({ where: { userId } });
        await tx.ingredient.deleteMany({ where: { userId } });

        await tx.routineStep.deleteMany({ where: { routine: { userId } } });
        await tx.routine.deleteMany({ where: { userId } });

        await tx.financeTransaction.deleteMany({ where: { userId } });
        await tx.financeRecurringSeries.deleteMany({ where: { userId } });
        await tx.capitalAccount.deleteMany({ where: { userId } });
        await tx.financeCategory.deleteMany({ where: { userId } });

        await tx.calendarEvent.deleteMany({ where: { userId } });
        await tx.recurringRule.deleteMany({ where: { userId } });

        await tx.lifeAreaObjective.deleteMany({ where: { userId } });
        await tx.timeAllocation.deleteMany({ where: { userId } });
        await tx.lifeAreaPreference.deleteMany({ where: { userId } });
        await tx.userSettings.deleteMany({ where: { userId } });

        // Restore in dependency order. `withUser` replaces the id-less fields
        // we need, keeping the rest of the row verbatim when possible.
        const withUser = <T extends object>(row: T): T & { userId: string } => ({
          ...row,
          userId,
        });

        if (d.settings) {
          const { id: _id, userId: _u, createdAt: _c, updatedAt: _up, ...rest } = d.settings as any;
          await tx.userSettings.create({ data: { ...rest, userId } });
        }

        restored.lifeAreaPreferences = (await tx.lifeAreaPreference.createMany({
          data: (d.lifeAreaPreferences as any[]).map(withUser),
          skipDuplicates: true,
        })).count;

        restored.timeAllocations = (await tx.timeAllocation.createMany({
          data: (d.timeAllocations as any[]).map(withUser),
          skipDuplicates: true,
        })).count;

        restored.objectives = (await tx.lifeAreaObjective.createMany({
          data: (d.objectives as any[]).map(withUser),
        })).count;

        restored.recurringRules = (await tx.recurringRule.createMany({
          data: (d.recurringRules as any[]).map(withUser),
        })).count;

        restored.financeCategories = (await tx.financeCategory.createMany({
          data: (d.financeCategories as any[]).map(withUser),
        })).count;

        restored.capitalAccounts = (await tx.capitalAccount.createMany({
          data: (d.capitalAccounts as any[]).map(withUser),
        })).count;

        restored.financeRecurringSeries = (await tx.financeRecurringSeries.createMany({
          data: (d.financeRecurringSeries as any[]).map(withUser),
        })).count;

        restored.financeTransactions = (await tx.financeTransaction.createMany({
          data: (d.financeTransactions as any[]).map(withUser),
        })).count;

        restored.calendarEvents = (await tx.calendarEvent.createMany({
          data: (d.calendarEvents as any[]).map(withUser),
        })).count;

        restored.ingredients = (await tx.ingredient.createMany({
          data: (d.ingredients as any[]).map(withUser),
        })).count;

        restored.recipes = (await tx.recipe.createMany({
          data: ((d.recipes as any[]) ?? []).map(withUser),
        })).count;

        restored.recipeIngredients = (await tx.recipeIngredient.createMany({
          data: d.recipeIngredients as any[],
        })).count;

        restored.menus = (await tx.menu.createMany({
          data: (d.menus as any[]).map(withUser),
        })).count;

        restored.menuRecipes = (await tx.menuRecipe.createMany({
          data: d.menuRecipes as any[],
        })).count;

        restored.shoppingLists = (await tx.shoppingList.createMany({
          data: (d.shoppingLists as any[]).map(withUser),
        })).count;

        restored.shoppingListItems = (await tx.shoppingListItem.createMany({
          data: d.shoppingListItems as any[],
        })).count;

        restored.routines = (await tx.routine.createMany({
          data: (d.routines as any[]).map(withUser),
        })).count;

        restored.routineSteps = (await tx.routineStep.createMany({
          data: ((d.routineSteps as any[]) ?? []) as never,
        })).count;
      },
      { timeout: 30_000 },
    );

    return { restored };
  }
}

export const backupService = new BackupService();
