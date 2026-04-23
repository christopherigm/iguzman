import { Router } from 'express';
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
      res.json(
        docs.map((d) => ({ ...d, connected: registry.isConnected(d.uuid) })),
      );
    } catch (err) {
      logger.error({ err }, 'GET /api/clients failed');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/api/clients/:uuid', async (req, res) => {
    try {
      const doc = await findClientByUuid(req.params['uuid']!);
      if (!doc) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ ...doc, connected: registry.isConnected(doc.uuid) });
    } catch (err) {
      logger.error({ err }, 'GET /api/clients/:uuid failed');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/api/jobs', async (req, res) => {
    const { clientUuid, op, params, taskId, jobId } = req.body as {
      clientUuid: string;
      op: WsOp;
      params: WsJobParams;
      taskId?: string;
      jobId?: string;
    };

    if (!clientUuid || !op || !params) {
      res.status(400).json({ error: 'Missing clientUuid, op, or params' });
      return;
    }

    const client = await findClientByUuid(clientUuid);
    if (!client) {
      res.status(404).json({ error: 'Client not registered' });
      return;
    }
    if (!registry.isConnected(clientUuid)) {
      res.status(409).json({ error: 'Client not connected' });
      return;
    }

    const resolvedTaskId =
      typeof taskId === 'string'
        ? taskId
        : typeof params?.taskId === 'string'
          ? params.taskId
          : null;
    const resolvedJobId =
      typeof jobId === 'string' && jobId.length > 0 ? jobId : resolvedTaskId;

    if (!resolvedTaskId || !resolvedJobId) {
      res.status(400).json({ error: 'Missing taskId/jobId' });
      return;
    }

    const now = new Date();
    try {
      await createJob({
        jobId: resolvedJobId,
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
    } catch {
      // Same task can run multiple server operations over time.
      await updateJob(resolvedJobId, {
        clientUuid,
        op,
        params,
        status: 'pending',
        progress: 0,
        outputFile: null,
        error: null,
        completedAt: null,
      });
    }

    const sent = registry.send(clientUuid, {
      type: 'job',
      jobId: resolvedJobId,
      op,
      params,
    });
    if (!sent) {
      res.status(409).json({ error: 'Failed to deliver to client' });
      return;
    }

    await updateJob(resolvedJobId, { status: 'dispatched' });
    logger.info(
      { jobId: resolvedJobId, taskId: resolvedTaskId, clientUuid, op },
      'Job dispatched',
    );
    res.status(201).json({ jobId: resolvedJobId });
  });

  return router;
}
