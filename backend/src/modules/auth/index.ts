import { AppModule } from '../../module-registry';
import { router } from './auth.routes';

export const authModule: AppModule = {
  name: 'auth',
  basePath: '/api/auth',
  router,
};
