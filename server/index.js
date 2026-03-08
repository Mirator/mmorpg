// @ts-check
import 'dotenv/config';
import { createServer } from './createServer.js';
import { logger } from './logger.js';

const { server, config, start, stop } = createServer({ env: process.env });

let shuttingDown = false;
async function shutdown(/** @type {any} */ signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down...`);
  try {
    await stop();
  } catch (err) {
    logger.error('Shutdown error:', err);
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

server.on('error', /** @param {NodeJS.ErrnoException} err */ (err) => {
  if (err?.code === 'EACCES' || err?.code === 'EPERM') {
    logger.error(
      `Failed to bind http://${config.host}:${config.port}. ` +
        'Permission denied; try a different HOST/PORT or check sandbox restrictions.'
    );
    return;
  }
  logger.error('Server error:', err);
});

start();
server.listen(config.port, config.host, () => {
  logger.info(`Server running at http://${config.host}:${config.port}`);
});
