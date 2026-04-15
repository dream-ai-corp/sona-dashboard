import { prisma } from '../../config/database';
import { Prisma, LifeArea, TransactionStatus } from '@prisma/client';
import {
  CreateMenuInput,
  UpdateMenuInput,
  UpsertMenuEntryInput,
  CreateRecipeInput,
  UpdateRecipeInput,
  CreateIngredientInput,
  FinalizeListInput,
} from './shopping.validator';

const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);

export class ShoppingService {
  // ==================== Menus ====================
  async createMenu(userId: string, input: CreateMenuInput) {
    return prisma.menu.create({ data: { ...input, userId } });
  }

  async getMenus(userId: string) {
    return prisma.menu.findMany({
      where: { userId },
      include: {
        recipes: {
          include: {
            recipe: {
              include: { ingredients: { include: { ingredient: true } } },
            },
          },
        },
      },
      orderBy: { dateFrom: 'desc' },
    });
  }

  async getMenu(userId: string, id: string) {
    return prisma.menu.findFirstOrThrow({
      where: { id, userId },
      include: {
        recipes: {
          include: {
            recipe: {
              include: { ingredients: { include: { ingredient: true } } },
            },
          },
        },
      },
    });
  }

  async updateMenu(userId: string, id: string, input: UpdateMenuInput) {
    await prisma.menu.findFirstOrThrow({ where: { id, userId } });
    return prisma.menu.update({ where: { id }, data: input });
  }

  async deleteMenu(userId: string, id: string) {
    return prisma.menu.delete({ where: { id, userId } });
  }

  // ==================== Menu entries ====================
  async addMenuEntry(userId: string, menuId: string, input: UpsertMenuEntryInput) {
    await prisma.menu.findFirstOrThrow({ where: { id: menuId, userId } });
    return prisma.menuRecipe.create({
      data: {
        menuId,
        recipeId: input.recipeId,
        dayOfWeek: input.dayOfWeek,
        mealType: input.mealType,
        servings: input.servings,
      },
      include: { recipe: true },
    });
  }

  async removeMenuEntry(userId: string, menuId: string, entryId: string) {
    await prisma.menu.findFirstOrThrow({ where: { id: menuId, userId } });
    return prisma.menuRecipe.delete({ where: { id: entryId } });
  }

  // ==================== Recipes (library) ====================
  async createRecipe(userId: string, input: CreateRecipeInput) {
    const { ingredients, ...rest } = input;
    return prisma.recipe.create({
      data: {
        ...rest,
        userId,
        ingredients: {
          create: ingredients.map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unit: i.unit,
          })),
        },
      },
      include: { ingredients: { include: { ingredient: true } } },
    });
  }

  async getRecipes(userId: string) {
    return prisma.recipe.findMany({
      where: { userId },
      include: { ingredients: { include: { ingredient: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getRecipe(userId: string, id: string) {
    return prisma.recipe.findFirstOrThrow({
      where: { id, userId },
      include: { ingredients: { include: { ingredient: true } } },
    });
  }

  async updateRecipe(userId: string, id: string, input: UpdateRecipeInput) {
    const { ingredients, ...rest } = input;
    return prisma.$transaction(async (tx) => {
      await tx.recipe.findFirstOrThrow({ where: { id, userId } });
      if (ingredients !== undefined) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
        await tx.recipeIngredient.createMany({
          data: ingredients.map((i) => ({
            recipeId: id,
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unit: i.unit,
          })),
        });
      }
      return tx.recipe.update({
        where: { id },
        data: rest,
        include: { ingredients: { include: { ingredient: true } } },
      });
    });
  }

  async deleteRecipe(userId: string, id: string) {
    await prisma.recipe.findFirstOrThrow({ where: { id, userId } });
    return prisma.recipe.delete({ where: { id } });
  }

  // ==================== Ingredients ====================
  async createIngredient(userId: string, input: CreateIngredientInput) {
    return prisma.ingredient.create({ data: { ...input, userId } });
  }

  async getIngredients(userId: string) {
    return prisma.ingredient.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }

  async updateIngredient(userId: string, id: string, input: Partial<CreateIngredientInput>) {
    return prisma.ingredient.update({ where: { id, userId }, data: input });
  }

  async deleteIngredient(userId: string, id: string) {
    return prisma.ingredient.delete({ where: { id, userId } });
  }

  // ==================== Shopping lists ====================
  /**
   * Walk every recipe instance in a menu, scale ingredient quantities by the
   * slot's `servings / defaultServings`, aggregate by (ingredient, unit), and
   * compute an estimated total using each ingredient's default price.
   */
  async generateListFromMenu(userId: string, menuId: string, name: string, plannedDate?: Date) {
    const menu = await prisma.menu.findFirstOrThrow({
      where: { id: menuId, userId },
      include: {
        recipes: {
          include: {
            recipe: {
              include: { ingredients: { include: { ingredient: true } } },
            },
          },
        },
      },
    });

    interface Agg {
      ingredientId: string;
      name: string;
      quantity: number;
      unit: string;
      unitPrice: number | null;
      location: string | null;
    }
    const agg = new Map<string, Agg>();

    for (const entry of menu.recipes) {
      const recipe = entry.recipe;
      const scale = entry.servings / Math.max(1, recipe.defaultServings);
      for (const ri of recipe.ingredients) {
        const key = `${ri.ingredientId}|${ri.unit}`;
        const qty = toNum(ri.quantity) * scale;
        const existing = agg.get(key);
        if (existing) {
          existing.quantity += qty;
        } else {
          agg.set(key, {
            ingredientId: ri.ingredientId,
            name: ri.ingredient.name,
            quantity: qty,
            unit: ri.unit,
            unitPrice: ri.ingredient.defaultPrice ? toNum(ri.ingredient.defaultPrice) : null,
            location: ri.ingredient.purchaseLocation,
          });
        }
      }
    }

    const items = Array.from(agg.values());
    const totalEstimated = items.reduce(
      (sum, it) => sum + (it.unitPrice !== null ? it.unitPrice * it.quantity : 0),
      0,
    );

    return prisma.shoppingList.create({
      data: {
        userId,
        menuId,
        name,
        status: 'DRAFT',
        plannedDate: plannedDate ?? menu.dateFrom,
        totalEstimatedCost: Math.round(totalEstimated * 100) / 100,
        items: {
          create: items.map((it) => ({
            ingredientId: it.ingredientId,
            quantity: Math.round(it.quantity * 1000) / 1000,
            unit: it.unit,
            estimatedPrice:
              it.unitPrice !== null
                ? Math.round(it.unitPrice * it.quantity * 100) / 100
                : null,
            purchaseLocation: it.location,
          })),
        },
      },
      include: { items: { include: { ingredient: true } } },
    });
  }

  async createEmptyList(userId: string, name: string) {
    return prisma.shoppingList.create({
      data: { userId, name, status: 'DRAFT' },
      include: { items: { include: { ingredient: true } } },
    });
  }

  async getShoppingLists(userId: string) {
    return prisma.shoppingList.findMany({
      where: { userId },
      include: {
        items: { include: { ingredient: true } },
        financeTransaction: { select: { id: true, amount: true, status: true, date: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleItem(userId: string, itemId: string, checked: boolean) {
    // Guard: item belongs to a list owned by user
    const item = await prisma.shoppingListItem.findFirstOrThrow({
      where: { id: itemId, list: { userId } },
    });
    return prisma.shoppingListItem.update({
      where: { id: item.id },
      data: { checked },
    });
  }

  async updateListStatus(userId: string, id: string, status: 'DRAFT' | 'ACTIVE' | 'COMPLETED') {
    return prisma.shoppingList.update({
      where: { id, userId },
      data: { status },
    });
  }

  async deleteList(userId: string, id: string) {
    return prisma.shoppingList.delete({ where: { id, userId } });
  }

  /**
   * Finalize a shopping list:
   *   - mark it COMPLETED
   *   - record the actual cost (default: sum of item estimated prices)
   *   - create a REALIZED finance transaction tied to the list, so the
   *     projection and monthly summary pick it up automatically
   *   - if a SCHEDULED preview tx already exists for the list, repurpose it
   */
  async finalizeList(userId: string, id: string, input: FinalizeListInput) {
    const list = await prisma.shoppingList.findFirstOrThrow({
      where: { id, userId },
      include: { items: true, financeTransaction: true },
    });

    const estimated = list.items.reduce(
      (sum, it) => sum + (it.estimatedPrice ? toNum(it.estimatedPrice) : 0),
      0,
    );
    const amount = input.actualCost ?? (list.totalEstimatedCost ? toNum(list.totalEstimatedCost) : estimated);
    const txDate = input.date ?? new Date();

    return prisma.$transaction(async (tx) => {
      let financeTransactionId = list.financeTransactionId;

      if (financeTransactionId) {
        await tx.financeTransaction.update({
          where: { id: financeTransactionId },
          data: {
            amount: -Math.abs(amount),
            date: txDate,
            status: TransactionStatus.REALIZED,
            description: `Shopping: ${list.name}`,
            categoryId: input.categoryId,
            accountId: input.accountId ?? null,
            lifeArea: input.lifeArea as LifeArea,
          },
        });
      } else {
        const created = await tx.financeTransaction.create({
          data: {
            userId,
            categoryId: input.categoryId,
            accountId: input.accountId ?? null,
            amount: -Math.abs(amount),
            description: `Shopping: ${list.name}`,
            date: txDate,
            lifeArea: input.lifeArea as LifeArea,
            status: TransactionStatus.REALIZED,
          },
        });
        financeTransactionId = created.id;
      }

      return tx.shoppingList.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          totalActualCost: Math.round(amount * 100) / 100,
          financeTransactionId,
        },
        include: {
          items: { include: { ingredient: true } },
          financeTransaction: true,
        },
      });
    });
  }
}

export const shoppingService = new ShoppingService();
