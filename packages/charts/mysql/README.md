# MySQL Helm Chart

A lightweight Helm chart that deploys **MySQL 8.0** on Kubernetes using a `hostPath` volume for persistent data storage. Designed for single-node or MicroK8s clusters where node-local storage is preferred over cloud-based PVCs.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.x
- The target node must have the host directory available (created automatically with `DirectoryOrCreate`)

## Quick Start

```bash
# Install with a release name
helm install my-mysql ./packages/charts/mysql \
  --set auth.rootPassword=my-secret-pw

# Install into a specific namespace
helm install my-mysql ./packages/charts/mysql \
  --namespace databases --create-namespace \
  --set auth.rootPassword=my-secret-pw
```

## Storage (hostPathVolume)

This chart uses Kubernetes `hostPath` volumes to persist data directly on the node filesystem, following the same pattern as the `video-downloader` chart.

| Value                            | Default          | Description                     |
| -------------------------------- | ---------------- | ------------------------------- |
| `hostPathVolume.enabled`         | `true`           | Enable hostPath-based storage   |
| `hostPathVolume.volumeMountPath` | `/shared-master` | Base directory on the host node |
| `hostPathVolume.mountPath`       | `/var/lib/mysql` | Mount path inside the container |

The resulting host path is:

```
/<volumeMountPath>/<chart-name>/data
# Default: /shared-master/mysql/data
```

> **Warning:** `hostPath` volumes tie your pod to a specific node. If you need multi-node scheduling, consider using a `PersistentVolumeClaim` instead.

## Configuration

### Image

| Value              | Default        | Description             |
| ------------------ | -------------- | ----------------------- |
| `image.repository` | `mysql`        | Docker image repository |
| `image.tag`        | `8.0`          | Image tag               |
| `image.pullPolicy` | `IfNotPresent` | Pull policy             |

### Authentication

| Value               | Default | Description                        |
| ------------------- | ------- | ---------------------------------- |
| `auth.rootPassword` | `""`    | MySQL root password (**required**) |
| `auth.database`     | `""`    | Default database to create on init |
| `auth.user`         | `""`    | Non-root user to create            |
| `auth.password`     | `""`    | Password for the non-root user     |

### Service

| Value                | Default     | Description             |
| -------------------- | ----------- | ----------------------- |
| `service.type`       | `ClusterIP` | Kubernetes Service type |
| `service.port`       | `3306`      | Service port            |
| `service.targetPort` | `3306`      | Container port          |

### Resources

| Value                       | Default | Description    |
| --------------------------- | ------- | -------------- |
| `resources.requests.cpu`    | `100m`  | CPU request    |
| `resources.requests.memory` | `256Mi` | Memory request |
| `resources.limits.cpu`      | `500m`  | CPU limit      |
| `resources.limits.memory`   | `1Gi`   | Memory limit   |

### Custom MySQL Configuration

Inject additional `my.cnf` settings through the `customConfig` value:

```yaml
customConfig: |
  [mysqld]
  default-authentication-plugin=mysql_native_password
  max_connections=200
  character-set-server=utf8mb4
  collation-server=utf8mb4_unicode_ci
```

This is mounted as `/etc/mysql/conf.d/custom.cnf` via a ConfigMap.

### Node Affinity

Pin pods to specific nodes:

```yaml
nodeAffinity:
  enabled: true
  nodeNames:
    - my-db-node
```

### Environment Variables

```yaml
# Plain env vars
env:
  MYSQL_ROOT_HOST: '%'

# From Kubernetes Secrets
envFromSecret:
  - name: MYSQL_ROOT_PASSWORD
    secretName: mysql-secrets
    secretKey: root-password
```

## Connecting

### From within the cluster

```
mysql -h <release-name>-mysql.<namespace>.svc.cluster.local -P 3306 -u root -p
```

### Via port-forward

```bash
kubectl port-forward svc/<release-name>-mysql 3306:3306
mysql -h 127.0.0.1 -P 3306 -u root -p
```

## Uninstalling

```bash
helm uninstall my-mysql
```

> **Note:** The `hostPath` data directory is **not** removed when uninstalling the chart. Delete it manually if needed:
>
> ```bash
> sudo rm -rf /shared-master/mysql/data
> ```
