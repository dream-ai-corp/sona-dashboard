import { AppModule } from '../../module-registry';
import { router } from './backup.routes';

export const backupModule: AppModule = {
  name: 'backup',
  basePath: '/api/backup',
  router,
};
