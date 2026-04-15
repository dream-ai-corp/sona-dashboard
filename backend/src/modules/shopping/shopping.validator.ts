import { z } from 'zod';

// Menus
export const createMenuSchema = z.object({
  name: z.string().min(1).max(255),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});

export const updateMenuSchema = createMenuSchema.partial();

// Menu entries (recipe slotted into day × meal)
export const upsertMenuEntrySchema = z.object({
  recipeId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  servings: z.number().int().positive().default(1),
});

// Recipes
export const recipeIngredientSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(50),
});

export const createRecipeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  instructions: z.string().max(5000).optional(),
  defaultServings: z.number().int().positive().default(1),
  imageUrl: z.string().url().optional(),
  ingredients: z.array(recipeIngredientSchema).default([]),
});

export const updateRecipeSchema = createRecipeSchema.partial();

// Ingredients
export const createIngredientSchema = z.object({
  name: z.string().min(1).max(255),
  defaultUnit: z.string().min(1).max(50),
  defaultPrice: z.number().positive().optional(),
  purchaseLocation: z.string().max(255).optional(),
  isOnline: z.boolean().default(false),
});

// Shopping lists
export const generateListSchema = z.object({
  menuId: z.string().uuid(),
  name: z.string().min(1).max(255),
  plannedDate: z.coerce.date().optional(),
});

export const createListSchema = z.object({
  name: z.string().min(1).max(255),
});

export const finalizeListSchema = z.object({
  categoryId: z.string().uuid(),
  accountId: z.string().uuid().optional().nullable(),
  lifeArea: z.enum([
    'SANTE', 'AMOUR_ET_COUPLE', 'CARRIERE', 'FINANCES', 'LOISIRS',
    'DEVELOPPEMENT_PERSONNEL', 'FAMILLE_ET_AMIS', 'ENVIRONNEMENT',
    'ORGANISATION', 'ADMINISTRATIF',
  ]).default('SANTE'),
  actualCost: z.number().optional(),
  date: z.coerce.date().optional(),
});

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
export type UpsertMenuEntryInput = z.infer<typeof upsertMenuEntrySchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type FinalizeListInput = z.infer<typeof finalizeListSchema>;
