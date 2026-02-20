# PostgreSQL Helm Chart

Helm chart for a PostgreSQL database with hostPath-based persistent storage.

## Usage

```bash
helm install my-postgres ./postgres \
  --set auth.password=supersecret \
  --set auth.database=mydb
```

## Values

| Key | Default | Description |
|-----|---------|-------------|
| `image.tag` | `17` | PostgreSQL image tag |
| `service.port` | `5432` | Service port |
| `auth.password` | `""` | `POSTGRES_PASSWORD` |
| `auth.user` | `postgres` | `POSTGRES_USER` |
| `auth.database` | `""` | `POSTGRES_DB` |
| `hostPathVolume.enabled` | `true` | Enable hostPath volume |
| `hostPathVolume.volumeMountPath` | `/shared-master` | Base path on the host node |
| `hostPathVolume.mountPath` | `/var/lib/postgresql/data` | Mount path inside the container |
| `nodeAffinity.enabled` | `true` | Enable node affinity |
| `nodeAffinity.nodeNames` | `[master]` | Target node names |
| `customConfig` | see values.yaml | Extra `postgresql.conf` content |
| `resources.requests.cpu` | `100m` | CPU request |
| `resources.requests.memory` | `256Mi` | Memory request |
| `resources.limits.cpu` | `500m` | CPU limit |
| `resources.limits.memory` | `1Gi` | Memory limit |
