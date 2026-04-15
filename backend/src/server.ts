import { createApp } from './app';
import { config } from './config';

async function main() {
  const app = await createApp();
  const port = config.apiPort;

  app.listen(port, () => {
    console.log(`PLM API server running on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
