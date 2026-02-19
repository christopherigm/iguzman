# MongoDB Helm Chart

A lightweight Helm chart that deploys **MongoDB 7.0** on Kubernetes using a `hostPath` volume for persistent data storage. Designed for single-node or MicroK8s clusters where node-local storage is preferred over cloud-based PVCs.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.x
- The target node must have the host directory available (created automatically with `DirectoryOrCreate`)

## Quick Start

```bash
# Install with a release name
helm install my-mongodb ./packages/charts/mongodb \
  --set auth.rootPassword=my-secret-pw

# Install into a specific namespace
helm install my-mongodb ./packages/charts/mongodb \
  --namespace databases --create-namespace \
  --set auth.rootPassword=my-secret-pw
```

## Storage (hostPathVolume)

This chart uses Kubernetes `hostPath` volumes to persist data directly on the node filesystem, following the same pattern as the `video-downloader` chart.

| Value                            | Default          | Description                     |
| -------------------------------- | ---------------- | ------------------------------- |
| `hostPathVolume.enabled`         | `true`           | Enable hostPath-based storage   |
| `hostPathVolume.volumeMountPath` | `/shared-master` | Base directory on the host node |
| `hostPathVolume.mountPath`       | `/data/db`       | Mount path inside the container |

The resulting host path is:

```
/<volumeMountPath>/<chart-name>/data
# Default: /shared-master/mongodb/data
```

> **Warning:** `hostPath` volumes tie your pod to a specific node. If you need multi-node scheduling, consider using a `PersistentVolumeClaim` instead.

## Configuration

### Image

| Value              | Default        | Description             |
| ------------------ | -------------- | ----------------------- |
| `image.repository` | `mongo`        | Docker image repository |
| `image.tag`        | `7.0`          | Image tag               |
| `image.pullPolicy` | `IfNotPresent` | Pull policy             |

### Authentication

| Value               | Default | Description                        |
| ------------------- | ------- | ---------------------------------- |
| `auth.rootUsername` | `root`  | Root admin username                |
| `auth.rootPassword` | `""`    | Root admin password (**required**) |
| `auth.database`     | `""`    | Default database to create on init |

### Service

| Value                | Default     | Description             |
| -------------------- | ----------- | ----------------------- |
| `service.type`       | `ClusterIP` | Kubernetes Service type |
| `service.port`       | `27017`     | Service port            |
| `service.targetPort` | `27017`     | Container port          |

### Resources

| Value                       | Default | Description    |
| --------------------------- | ------- | -------------- |
| `resources.requests.cpu`    | `100m`  | CPU request    |
| `resources.requests.memory` | `256Mi` | Memory request |
| `resources.limits.cpu`      | `500m`  | CPU limit      |
| `resources.limits.memory`   | `1Gi`   | Memory limit   |

### Custom MongoDB Configuration

Inject additional `mongod.conf` settings through the `customConfig` value:

```yaml
customConfig: |
  storage:
    directoryPerDB: true
  net:
    maxIncomingConnections: 200
```

This is mounted as `/etc/mongo/mongod.conf` via a ConfigMap. When `customConfig` is set, the container starts with `mongod --config /etc/mongo/mongod.conf --bind_ip_all`.

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
  MONGO_INITDB_DATABASE: mydb

# From Kubernetes Secrets
envFromSecret:
  - name: MONGO_INITDB_ROOT_PASSWORD
    secretName: mongodb-secrets
    secretKey: root-password
```

## Kubernetes Secrets

### Creating a Secret

**Imperative** (quickest for dev/one-off use):

```bash
kubectl create secret generic mongodb-secrets \
  --from-literal=root-password=my-secure-password \
  --namespace databases
```

**Declarative** (YAML — base64-encode the value first):

```bash
echo -n 'my-secure-password' | base64
# → bXktc2VjdXJlLXBhc3N3b3Jk
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mongodb-secrets
  namespace: databases
type: Opaque
data:
  root-password: bXktc2VjdXJlLXBhc3N3b3Jk
```

```bash
kubectl apply -f secret.yaml
```

### Updating a Secret

**Option A — patch a single key in-place:**

```bash
NEW_VALUE=$(echo -n 'new-secure-password' | base64)
kubectl patch secret mongodb-secrets \
  --namespace databases \
  --type='json' \
  -p="[{\"op\":\"replace\",\"path\":\"/data/root-password\",\"value\":\"${NEW_VALUE}\"}]"
```

**Option B — delete and recreate (simpler):**

```bash
kubectl delete secret mongodb-secrets -n databases
kubectl create secret generic mongodb-secrets \
  --from-literal=root-password=new-secure-password \
  --namespace databases
```

After updating, restart the pod to pick up the new value:

```bash
kubectl rollout restart statefulset/<release-name>-mongodb -n databases
```

### Using the Secret with this chart

Via `--set` flags at install/upgrade time:

```bash
helm install my-mongodb ./packages/charts/mongodb \
  --namespace databases --create-namespace \
  --set envFromSecret[0].name=MONGO_INITDB_ROOT_PASSWORD \
  --set envFromSecret[0].secretName=mongodb-secrets \
  --set envFromSecret[0].secretKey=root-password
```

Or in a values file:

```yaml
envFromSecret:
  - name: MONGO_INITDB_ROOT_PASSWORD
    secretName: mongodb-secrets
    secretKey: root-password
```

> **Note:** When using `envFromSecret` for the root password, leave `auth.rootPassword` empty (the default). If both are set, the plain `auth.rootPassword` value will override the secret in the container's env block.

## Connecting

### From within the cluster

```
mongosh "mongodb://root:<password>@<release-name>-mongodb.<namespace>.svc.cluster.local:27017"
```

### Via port-forward

```bash
kubectl port-forward svc/<release-name>-mongodb 27017:27017
mongosh "mongodb://root:<password>@127.0.0.1:27017"
```

## Uninstalling

```bash
helm uninstall my-mongodb
```

> **Note:** The `hostPath` data directory is **not** removed when uninstalling the chart. Delete it manually if needed:
>
> ```bash
> sudo rm -rf /shared-master/mongodb/data
> ```
