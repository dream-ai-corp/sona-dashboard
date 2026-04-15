import { AppModule } from '../../module-registry';
import { router } from './routines.routes';

export const routinesModule: AppModule = {
  name: 'routines',
  basePath: '/api/routines',
  router,
};
