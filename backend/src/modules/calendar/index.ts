import { AppModule } from '../../module-registry';
import { router } from './calendar.routes';

export const calendarModule: AppModule = {
  name: 'calendar',
  basePath: '/api/calendar',
  router,
};
