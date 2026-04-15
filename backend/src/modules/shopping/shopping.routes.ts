import { Router } from 'express';
import { shoppingController } from './shopping.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import {
  createMenuSchema,
  updateMenuSchema,
  upsertMenuEntrySchema,
  createRecipeSchema,
  updateRecipeSchema,
  createIngredientSchema,
  generateListSchema,
  createListSchema,
  finalizeListSchema,
} from './shopping.validator';

export const router = Router();
router.use(authenticate);

// Menus
router.post('/menus', validate({ body: createMenuSchema }), (req, res, next) => shoppingController.createMenu(req, res, next));
router.get('/menus', (req, res, next) => shoppingController.getMenus(req, res, next));
router.get('/menus/:id', (req, res, next) => shoppingController.getMenu(req, res, next));
router.put('/menus/:id', validate({ body: updateMenuSchema }), (req, res, next) => shoppingController.updateMenu(req, res, next));
router.delete('/menus/:id', (req, res, next) => shoppingController.deleteMenu(req, res, next));

// Menu entries
router.post('/menus/:menuId/entries', validate({ body: upsertMenuEntrySchema }), (req, res, next) => shoppingController.addMenuEntry(req, res, next));
router.delete('/menus/:menuId/entries/:entryId', (req, res, next) => shoppingController.removeMenuEntry(req, res, next));

// Recipes library
router.post('/recipes', validate({ body: createRecipeSchema }), (req, res, next) => shoppingController.createRecipe(req, res, next));
router.get('/recipes', (req, res, next) => shoppingController.getRecipes(req, res, next));
router.get('/recipes/:id', (req, res, next) => shoppingController.getRecipe(req, res, next));
router.put('/recipes/:id', validate({ body: updateRecipeSchema }), (req, res, next) => shoppingController.updateRecipe(req, res, next));
router.delete('/recipes/:id', (req, res, next) => shoppingController.deleteRecipe(req, res, next));

// Ingredients
router.post('/ingredients', validate({ body: createIngredientSchema }), (req, res, next) => shoppingController.createIngredient(req, res, next));
router.get('/ingredients', (req, res, next) => shoppingController.getIngredients(req, res, next));
router.put('/ingredients/:id', (req, res, next) => shoppingController.updateIngredient(req, res, next));
router.delete('/ingredients/:id', (req, res, next) => shoppingController.deleteIngredient(req, res, next));

// Shopping lists
router.post('/lists', validate({ body: createListSchema }), (req, res, next) => shoppingController.createList(req, res, next));
router.post('/lists/generate', validate({ body: generateListSchema }), (req, res, next) => shoppingController.generateList(req, res, next));
router.get('/lists', (req, res, next) => shoppingController.getShoppingLists(req, res, next));
router.delete('/lists/:id', (req, res, next) => shoppingController.deleteList(req, res, next));
router.patch('/lists/:id/status', (req, res, next) => shoppingController.updateListStatus(req, res, next));
router.post('/lists/:id/finalize', validate({ body: finalizeListSchema }), (req, res, next) => shoppingController.finalizeList(req, res, next));
router.patch('/lists/items/:itemId/toggle', (req, res, next) => shoppingController.toggleItem(req, res, next));
