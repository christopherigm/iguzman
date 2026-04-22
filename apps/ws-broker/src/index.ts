import http from 'node:http';
import express from 'express';
import { createRouter } from './rest-routes.js';
import { attachWsServer } from './ws-handler.js';
import logger from './logger.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app = express();
app.use(express.json());
app.use(createRouter());

const server = http.createServer(app);
attachWsServer(server);

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'ws-broker started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
