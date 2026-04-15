import { AppModule } from '../../module-registry';
import { router } from './life-areas.routes';

export const lifeAreasModule: AppModule = {
  name: 'life-areas',
  basePath: '/api/life-areas',
  router,
};
