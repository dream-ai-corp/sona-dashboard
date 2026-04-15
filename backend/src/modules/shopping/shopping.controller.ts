import { Request, Response, NextFunction } from 'express';
import { shoppingService } from './shopping.service';

export class ShoppingController {
  // Menus
  async createMenu(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.createMenu(req.user!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getMenus(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.getMenus(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getMenu(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.getMenu(req.user!.userId, req.params.id as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async updateMenu(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.updateMenu(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async deleteMenu(req: Request, res: Response, next: NextFunction) {
    try {
      await shoppingService.deleteMenu(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Menu entries
  async addMenuEntry(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.addMenuEntry(req.user!.userId, req.params.menuId as string, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async removeMenuEntry(req: Request, res: Response, next: NextFunction) {
    try {
      await shoppingService.removeMenuEntry(
        req.user!.userId,
        req.params.menuId as string,
        req.params.entryId as string,
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Recipes
  async createRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.createRecipe(req.user!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getRecipes(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.getRecipes(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.getRecipe(req.user!.userId, req.params.id as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async updateRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.updateRecipe(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async deleteRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      await shoppingService.deleteRecipe(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Ingredients
  async createIngredient(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.createIngredient(req.user!.userId, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getIngredients(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.getIngredients(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async updateIngredient(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.updateIngredient(req.user!.userId, req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async deleteIngredient(req: Request, res: Response, next: NextFunction) {
    try {
      await shoppingService.deleteIngredient(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  // Shopping lists
  async createList(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.createEmptyList(req.user!.userId, req.body.name);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async generateList(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.generateListFromMenu(
        req.user!.userId,
        req.body.menuId,
        req.body.name,
        req.body.plannedDate ? new Date(req.body.plannedDate) : undefined,
      );
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }
  async getShoppingLists(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.getShoppingLists(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async toggleItem(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.toggleItem(
        req.user!.userId,
        req.params.itemId as string,
        req.body.checked,
      );
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async updateListStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.updateListStatus(
        req.user!.userId,
        req.params.id as string,
        req.body.status,
      );
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
  async deleteList(req: Request, res: Response, next: NextFunction) {
    try {
      await shoppingService.deleteList(req.user!.userId, req.params.id as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
  async finalizeList(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await shoppingService.finalizeList(
        req.user!.userId,
        req.params.id as string,
        req.body,
      );
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}

export const shoppingController = new ShoppingController();
