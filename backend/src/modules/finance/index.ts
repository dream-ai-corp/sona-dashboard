import { AppModule } from '../../module-registry';
import { router } from './finance.routes';

export const financeModule: AppModule = {
  name: 'finance',
  basePath: '/api/finance',
  router,
};
