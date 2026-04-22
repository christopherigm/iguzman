import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { listClients, findClientByUuid, createJob, updateJob } from './db.js';
import * as registry from './client-registry.js';
import type { WsOp, WsJobParams } from './types.js';
import logger from './logger.js';

export function createRouter(): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.json({ ok: true, connectedClients: registry.getAll().length });
  });

  router.get('/api/clients', async (_req, res) => {
    try {
      const docs = await listClients();
      res.json(docs.map((d) => ({ ...d, connected: registry.isConnected(d.uuid) })));
    } catch (err) {
      logger.error({ err }, 'GET /api/clients failed');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/api/clients/:uuid', async (req, res) => {
    try {
      const doc = await findClientByUuid(req.params['uuid']!);
      if (!doc) { res.status(404).json({ error: 'Not found' }); return; }
      res.json({ ...doc, connected: registry.isConnected(doc.uuid) });
    } catch (err) {
      logger.error({ err }, 'GET /api/clients/:uuid failed');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/api/jobs', async (req, res) => {
    const { clientUuid, op, params } = req.body as {
      clientUuid: string;
      op: WsOp;
      params: WsJobParams;
    };

    if (!clientUuid || !op || !params) {
      res.status(400).json({ error: 'Missing clientUuid, op, or params' });
      return;
    }

    const client = await findClientByUuid(clientUuid);
    if (!client) { res.status(404).json({ error: 'Client not registered' }); return; }
    if (!registry.isConnected(clientUuid)) {
      res.status(409).json({ error: 'Client not connected' });
      return;
    }

    const jobId = randomUUID();
    const now = new Date();
    await createJob({
      jobId,
      clientUuid,
      op,
      params,
      status: 'pending',
      progress: 0,
      outputFile: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });

    const sent = registry.send(clientUuid, { type: 'job', jobId, op, params });
    if (!sent) {
      res.status(409).json({ error: 'Failed to deliver to client' });
      return;
    }

    await updateJob(jobId, { status: 'dispatched' });
    logger.info({ jobId, clientUuid, op }, 'Job dispatched');
    res.status(201).json({ jobId });
  });

  return router;
}
