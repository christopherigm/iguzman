# Redis Helm Chart

A lightweight Helm chart that deploys **Redis 7.2** on Kubernetes using a `hostPath` volume for persistent data storage. Designed for single-node or MicroK8s clusters where node-local storage is preferred over cloud-based PVCs.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.x
- The target node must have the host directory available (created automatically with `DirectoryOrCreate`)

## Quick Start

```bash
# Install with a release name (no auth)
helm install my-redis ./packages/charts/redis

# Install with password authentication
helm install my-redis ./packages/charts/redis \
  --set auth.password=my-secret-pw

# Install into a specific namespace
helm install my-redis ./packages/charts/redis \
  --namespace cache --create-namespace \
  --set auth.password=my-secret-pw
```

## Storage (hostPathVolume)

This chart uses Kubernetes `hostPath` volumes to persist data directly on the node filesystem, following the same pattern as the `video-downloader` chart.

| Value                            | Default          | Description                     |
| -------------------------------- | ---------------- | ------------------------------- |
| `hostPathVolume.enabled`         | `true`           | Enable hostPath-based storage   |
| `hostPathVolume.volumeMountPath` | `/shared-master` | Base directory on the host node |
| `hostPathVolume.mountPath`       | `/data`          | Mount path inside the container |

The resulting host path is:

```
/<volumeMountPath>/<chart-name>/data
# Default: /shared-master/redis/data
```

> **Warning:** `hostPath` volumes tie your pod to a specific node. If you need multi-node scheduling, consider using a `PersistentVolumeClaim` instead.

## Configuration

### Image

| Value              | Default        | Description                              |
| ------------------ | -------------- | ---------------------------------------- |
| `image.repository` | `redis`        | Docker image repository                  |
| `image.tag`        | `7.2-alpine`   | Image tag (Alpine for smaller footprint) |
| `image.pullPolicy` | `IfNotPresent` | Pull policy                              |

### Authentication

| Value           | Default | Description                                |
| --------------- | ------- | ------------------------------------------ |
| `auth.password` | `""`    | Redis password (optional, empty = no auth) |

### Service

| Value                | Default     | Description             |
| -------------------- | ----------- | ----------------------- |
| `service.type`       | `ClusterIP` | Kubernetes Service type |
| `service.port`       | `6379`      | Service port            |
| `service.targetPort` | `6379`      | Container port          |

### Resources

| Value                       | Default | Description    |
| --------------------------- | ------- | -------------- |
| `resources.requests.cpu`    | `50m`   | CPU request    |
| `resources.requests.memory` | `64Mi`  | Memory request |
| `resources.limits.cpu`      | `250m`  | CPU limit      |
| `resources.limits.memory`   | `512Mi` | Memory limit   |

### Custom Redis Configuration

Inject additional `redis.conf` settings through the `customConfig` value:

```yaml
customConfig: |
  maxmemory 256mb
  maxmemory-policy allkeys-lru
  appendonly yes
  appendfsync everysec
```

This is mounted as `/etc/redis/redis.conf` via a ConfigMap.

### Node Affinity

Pin pods to specific nodes:

```yaml
nodeAffinity:
  enabled: true
  nodeNames:
    - my-cache-node
```

### Environment Variables

```yaml
# From Kubernetes Secrets
envFromSecret:
  - name: REDIS_PASSWORD
    secretName: redis-secrets
    secretKey: password
```

## Connecting

### From within the cluster

```
redis-cli -h <release-name>-redis.<namespace>.svc.cluster.local -p 6379
```

### Via port-forward

```bash
kubectl port-forward svc/<release-name>-redis 6379:6379
redis-cli -h 127.0.0.1 -p 6379
```

If authentication is enabled:

```bash
redis-cli -h 127.0.0.1 -p 6379 -a <password>
```

## Uninstalling

```bash
helm uninstall my-redis
```

> **Note:** The `hostPath` data directory is **not** removed when uninstalling the chart. Delete it manually if needed:
>
> ```bash
> sudo rm -rf /shared-master/redis/data
> ```
