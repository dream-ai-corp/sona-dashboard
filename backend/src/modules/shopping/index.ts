import { AppModule } from '../../module-registry';
import { router } from './shopping.routes';

export const shoppingModule: AppModule = {
  name: 'shopping',
  basePath: '/api/shopping',
  router,
};
