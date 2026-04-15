import { ShoppingService } from '../shopping.service';
import { prisma } from '../../../config/database';

jest.mock('../../../config/database', () => ({
  prisma: {
    menu: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
      delete: jest.fn(),
    },
    menuRecipe: {
      create: jest.fn(),
      delete: jest.fn(),
    },
    recipe: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    recipeIngredient: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    ingredient: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shoppingList: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shoppingListItem: {
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
    },
    financeTransaction: {
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn) =>
      fn({
        recipe: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'r-1' }), update: jest.fn() },
        recipeIngredient: { deleteMany: jest.fn(), createMany: jest.fn() },
        shoppingList: { update: jest.fn().mockResolvedValue({ id: 'list-1' }) },
        financeTransaction: { create: jest.fn().mockResolvedValue({ id: 'ftx-1' }), update: jest.fn() },
      }),
    ),
  },
}));

describe('ShoppingService', () => {
  let service: ShoppingService;
  const userId = 'user-1';

  beforeEach(() => {
    service = new ShoppingService();
    jest.clearAllMocks();
  });

  describe('createIngredient', () => {
    it('creates an ingredient', async () => {
      const input = { name: 'Tomatoes', defaultUnit: 'kg', isOnline: false };
      (prisma.ingredient.create as jest.Mock).mockResolvedValue({ id: 'ing-1', ...input, userId });
      const result = await service.createIngredient(userId, input);
      expect(result.name).toBe('Tomatoes');
    });
  });

  describe('generateListFromMenu', () => {
    it('aggregates ingredients across recipes scaled by servings and computes an estimated total', async () => {
      (prisma.menu.findFirstOrThrow as jest.Mock).mockResolvedValue({
        id: 'menu-1',
        dateFrom: new Date('2026-04-01'),
        recipes: [
          {
            servings: 4,
            recipe: {
              defaultServings: 2,
              ingredients: [
                {
                  ingredientId: 'ing-1',
                  quantity: 0.5,
                  unit: 'kg',
                  ingredient: { name: 'Tomato', defaultPrice: 3, purchaseLocation: 'Carrefour' },
                },
                {
                  ingredientId: 'ing-2',
                  quantity: 0.3,
                  unit: 'kg',
                  ingredient: { name: 'Pasta', defaultPrice: 2, purchaseLocation: 'Carrefour' },
                },
              ],
            },
          },
          {
            servings: 2,
            recipe: {
              defaultServings: 2,
              ingredients: [
                {
                  ingredientId: 'ing-1',
                  quantity: 0.3,
                  unit: 'kg',
                  ingredient: { name: 'Tomato', defaultPrice: 3, purchaseLocation: 'Carrefour' },
                },
              ],
            },
          },
        ],
      });
      (prisma.shoppingList.create as jest.Mock).mockImplementation(({ data }) => ({ id: 'list-1', ...data, items: [] }));

      await service.generateListFromMenu(userId, 'menu-1', 'Weekly list');

      const call = (prisma.shoppingList.create as jest.Mock).mock.calls[0]![0];
      // ing-1: 0.5 * (4/2) + 0.3 * (2/2) = 1.0 + 0.3 = 1.3
      // ing-2: 0.3 * (4/2) = 0.6
      const items = call.data.items.create;
      const ing1 = items.find((i: any) => i.ingredientId === 'ing-1');
      const ing2 = items.find((i: any) => i.ingredientId === 'ing-2');
      expect(ing1.quantity).toBeCloseTo(1.3, 5);
      expect(ing2.quantity).toBeCloseTo(0.6, 5);
      // Estimated total = 1.3*3 + 0.6*2 = 3.9 + 1.2 = 5.10
      expect(Number(call.data.totalEstimatedCost)).toBeCloseTo(5.1, 2);
    });
  });
});
