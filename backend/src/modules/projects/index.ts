import { AppModule } from '../../module-registry';
import { router } from './projects.routes';

export const projectsModule: AppModule = {
  name: 'projects',
  basePath: '/api/projects',
  router,
};
