import { Express, Router } from 'express';
import { prisma } from './config/database';

export interface AppModule {
  name: string;
  basePath: string;
  router: Router;
  initialize?: (deps: ModuleDeps) => Promise<void>;
}

export interface ModuleDeps {
  prisma: typeof prisma;
}

// Import modules
import { authModule } from './modules/auth';
import { financeModule } from './modules/finance';
import { calendarModule } from './modules/calendar';
import { shoppingModule } from './modules/shopping';
import { routinesModule } from './modules/routines';
import { voiceModule } from './modules/voice';
import { settingsModule } from './modules/settings';
import { lifeAreasModule } from './modules/life-areas';
import { backupModule } from './modules/backup';
import { projectsModule } from './modules/projects';

const modules: AppModule[] = [
  authModule,
  settingsModule,
  lifeAreasModule,
  financeModule,
  calendarModule,
  shoppingModule,
  routinesModule,
  voiceModule,
  backupModule,
  projectsModule,
];

export async function registerModules(app: Express): Promise<void> {
  const deps: ModuleDeps = { prisma };

  for (const mod of modules) {
    if (mod.initialize) {
      await mod.initialize(deps);
    }
    app.use(mod.basePath, mod.router);
    console.log(`Module registered: ${mod.name} at ${mod.basePath}`);
  }
}
