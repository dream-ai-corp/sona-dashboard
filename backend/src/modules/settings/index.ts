import { AppModule } from '../../module-registry';
import { router } from './settings.routes';

export const settingsModule: AppModule = {
  name: 'settings',
  basePath: '/api/settings',
  router,
};
