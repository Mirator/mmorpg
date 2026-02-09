import 'dotenv/config';
import { createServer } from './createServer.js';

const { server, config, start, stop } = createServer({ env: process.env });

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down...`);
  try {
    await stop();
  } catch (err) {
    console.error('Shutdown error:', err);
  }
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.on('error', (err) => {
  if (err?.code === 'EACCES' || err?.code === 'EPERM') {
    console.error(
      `Failed to bind http://${config.host}:${config.port}. ` +
        'Permission denied; try a different HOST/PORT or check sandbox restrictions.'
    );
    return;
  }
  console.error('Server error:', err);
});

start();
server.listen(config.port, config.host, () => {
  console.log(`Server running at http://${config.host}:${config.port}`);
});
