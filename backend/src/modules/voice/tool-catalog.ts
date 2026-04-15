import { z } from 'zod';
import { AgentTool } from './zod-to-tool';
import { financeService } from '../finance/finance.service';
import { shoppingService } from '../shopping/shopping.service';
import {
  createCategorySchema,
  createTransactionSchema,
  createAccountSchema,
  createSeriesSchema,
  projectionQuerySchema,
} from '../finance/finance.validator';
import {
  createMenuSchema,
  upsertMenuEntrySchema,
  createRecipeSchema,
  createIngredientSchema,
  generateListSchema,
  finalizeListSchema,
} from '../shopping/shopping.validator';

/**
 * Agent tool catalog — every entry is a typed, user-scoped service call.
 *
 * Design rules:
 *   - Read-only tools come first and should always be safe to call without
 *     confirmation.
 *   - Mutating tools use the same Zod validators as the HTTP routes so we
 *     never drift from the validated API surface.
 *   - Descriptions include WHEN to call the tool, not just WHAT it does. The
 *     agent uses these as its decision signal.
 */

const EMPTY = z.object({});

export const tools: AgentTool[] = [
  // ==================== FINANCE — read ====================
  {
    name: 'finance_list_categories',
    description:
      'List all finance categories (income + expense) owned by the user. Call this FIRST whenever '
      + 'you need a categoryId — never guess one.',
    schema: EMPTY,
    handler: (userId) => financeService.getCategories(userId),
  },
  {
    name: 'finance_list_accounts',
    description:
      'List all capital accounts (checking, savings, cash). Call this when the user references '
      + '"my account", "my main account", "my savings", etc., or when you need an accountId.',
    schema: EMPTY,
    handler: (userId) => financeService.getAccounts(userId),
  },
  {
    name: 'finance_list_recent_transactions',
    description:
      'List the most recent transactions (default: last 20). Use this when the user references '
      + '"my last expense", "that expense I added", or wants to see recent activity.',
    schema: z.object({
      limit: z.number().int().min(1).max(50).optional(),
    }),
    handler: async (userId, args) => {
      const a = args as { limit?: number };
      const res = await financeService.getTransactions(userId, {
        page: 1,
        limit: a.limit ?? 20,
        sortOrder: 'desc',
      } as Parameters<typeof financeService.getTransactions>[1]);
      return res.items;
    },
  },
  {
    name: 'finance_get_monthly_summary',
    description:
      'Get spending by category + totals for a given month. Use when the user asks "how much did '
      + 'I spend on X last month?" or wants a monthly review.',
    schema: z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
    }),
    handler: (userId, args) => {
      const a = args as { year: number; month: number };
      return financeService.getMonthlySummary(userId, a.year, a.month);
    },
  },
  {
    name: 'finance_get_projection',
    description:
      'Get the capital projection curve over a time range. Mixes realized transactions, scheduled '
      + 'ones, and recurring series. Use when the user asks "how much will I have in 6 months?", '
      + '"show me my cashflow", or wants to see the capital curve.',
    schema: projectionQuerySchema,
    handler: (userId, args) =>
      financeService.getProjection(userId, args as Parameters<typeof financeService.getProjection>[1]),
  },

  // ==================== FINANCE — write ====================
  {
    name: 'finance_create_category',
    description:
      'Create a new finance category. `type` is INCOME or EXPENSE. `isFixedCharge=true` for '
      + 'recurring bills (rent, subscriptions). Only call when no existing category fits.',
    schema: createCategorySchema,
    handler: (userId, args) =>
      financeService.createCategory(userId, args as Parameters<typeof financeService.createCategory>[1]),
  },
  {
    name: 'finance_create_account',
    description:
      'Create a new capital account with a starting balance at a reference date. Use when the user '
      + 'says "add my checking account with 1500€", etc.',
    schema: createAccountSchema,
    handler: (userId, args) =>
      financeService.createAccount(userId, args as Parameters<typeof financeService.createAccount>[1]),
  },
  {
    name: 'finance_create_transaction',
    description:
      'Log a transaction. Use NEGATIVE amount for expenses, POSITIVE for income. `categoryId` '
      + 'must come from finance_list_categories. If the date is in the future, also set '
      + 'status="SCHEDULED" so the projection picks it up as an upcoming cashflow.',
    schema: createTransactionSchema,
    handler: (userId, args) =>
      financeService.createTransaction(userId, args as Parameters<typeof financeService.createTransaction>[1]),
  },
  {
    name: 'finance_update_transaction',
    description:
      'Patch an existing transaction by id. Use for "add 5€ to that expense I just added", or '
      + 'to correct a typo. Only include fields you want to change.',
    schema: z.object({
      id: z.string().uuid(),
      amount: z.number().optional(),
      description: z.string().optional(),
      date: z.coerce.date().optional(),
      categoryId: z.string().uuid().optional(),
    }),
    handler: (userId, args) => {
      const a = args as { id: string } & Record<string, unknown>;
      const { id, ...patch } = a;
      return financeService.updateTransaction(userId, id, patch as never);
    },
  },
  {
    name: 'finance_delete_transaction',
    description: 'Delete a transaction by id. Irreversible — only call after explicit user confirmation.',
    schema: z.object({ id: z.string().uuid() }),
    handler: (userId, args) => financeService.deleteTransaction(userId, (args as { id: string }).id),
  },
  {
    name: 'finance_create_recurring_series',
    description:
      'Define a recurring income or expense (salary, rent, subscription). Materializes into the '
      + 'projection automatically. Use for "my rent is 800€ on the 5th of every month".',
    schema: createSeriesSchema,
    handler: (userId, args) =>
      financeService.createSeries(userId, args as Parameters<typeof financeService.createSeries>[1]),
  },

  // ==================== SHOPPING — read ====================
  {
    name: 'shopping_list_recipes',
    description:
      'List recipes in the user\'s recipe library. ALWAYS call this before creating a new recipe '
      + '— the user may already have one with the same name.',
    schema: EMPTY,
    handler: (userId) => shoppingService.getRecipes(userId),
  },
  {
    name: 'shopping_list_ingredients',
    description:
      'List all ingredients in the user\'s library with their default unit, price, and store. '
      + 'Call this before creating a new ingredient to avoid duplicates.',
    schema: EMPTY,
    handler: (userId) => shoppingService.getIngredients(userId),
  },
  {
    name: 'shopping_list_menus',
    description:
      'List all meal-plan menus. Each menu has date range and slotted recipes. Use when the user '
      + 'says "this week\'s menu" or "my meal plan".',
    schema: EMPTY,
    handler: (userId) => shoppingService.getMenus(userId),
  },
  {
    name: 'shopping_list_shopping_lists',
    description: 'List all shopping lists with their items and status (DRAFT / ACTIVE / COMPLETED).',
    schema: EMPTY,
    handler: (userId) => shoppingService.getShoppingLists(userId),
  },

  // ==================== SHOPPING — write ====================
  {
    name: 'shopping_create_ingredient',
    description:
      'Create a new ingredient in the library. Always set defaultPrice when you know it — it '
      + 'feeds the shopping list cost estimation.',
    schema: createIngredientSchema,
    handler: (userId, args) =>
      shoppingService.createIngredient(userId, args as Parameters<typeof shoppingService.createIngredient>[1]),
  },
  {
    name: 'shopping_create_recipe',
    description:
      'Create a new recipe with its ingredients. `ingredients[].ingredientId` MUST come from '
      + 'shopping_list_ingredients — if an ingredient is missing, call shopping_create_ingredient '
      + 'first, then use the returned id here.',
    schema: createRecipeSchema,
    handler: (userId, args) =>
      shoppingService.createRecipe(userId, args as Parameters<typeof shoppingService.createRecipe>[1]),
  },
  {
    name: 'shopping_create_menu',
    description:
      'Create an empty meal-plan menu with a date range. Follow up with shopping_add_menu_entry '
      + 'calls to drop recipes into day/meal slots.',
    schema: createMenuSchema,
    handler: (userId, args) =>
      shoppingService.createMenu(userId, args as Parameters<typeof shoppingService.createMenu>[1]),
  },
  {
    name: 'shopping_add_menu_entry',
    description:
      'Slot a recipe into a menu at a specific day (0=Mon..6=Sun) and meal type. Call this after '
      + 'shopping_create_menu. recipeId must come from shopping_list_recipes.',
    schema: upsertMenuEntrySchema.extend({ menuId: z.string().uuid() }),
    handler: (userId, args) => {
      const a = args as { menuId: string } & Parameters<typeof shoppingService.addMenuEntry>[2];
      return shoppingService.addMenuEntry(userId, a.menuId, a);
    },
  },
  {
    name: 'shopping_generate_list_from_menu',
    description:
      'Aggregate every recipe in a menu into a consolidated shopping list with cost estimate. '
      + 'Items are grouped by ingredient and unit, scaled by servings, and priced from each '
      + 'ingredient\'s default price. Use when the user says "generate the shopping list", '
      + '"make the list for this week\'s menu", etc.',
    schema: generateListSchema,
    handler: (userId, args) => {
      const a = args as { menuId: string; name: string; plannedDate?: Date };
      return shoppingService.generateListFromMenu(userId, a.menuId, a.name, a.plannedDate);
    },
  },
  {
    name: 'shopping_finalize_list',
    description:
      'Mark a shopping list as COMPLETED and create the corresponding expense transaction in '
      + 'finances. Use when the user says "I paid X€, validate the list", "finalize this list", '
      + 'etc. The expense immediately reflects in the capital projection.',
    schema: finalizeListSchema.extend({ listId: z.string().uuid() }),
    handler: (userId, args) => {
      const a = args as { listId: string } & Parameters<typeof shoppingService.finalizeList>[2];
      return shoppingService.finalizeList(userId, a.listId, a);
    },
  },
];

export function findTool(name: string): AgentTool | undefined {
  return tools.find((t) => t.name === name);
}
