import { AppModule } from '../../module-registry';
import { router } from './voice.routes';

export const voiceModule: AppModule = {
  name: 'voice',
  basePath: '/api/voice',
  router,
};
