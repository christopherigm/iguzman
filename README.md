# Turborepo starter

This Turborepo starter is maintained by the Turborepo core team.

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev
yarn exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev --filter=web

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev --filter=web
yarn exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

---

## Deploying `web` to MicroK8s with Helm

The Helm chart lives in `apps/web/helm/web/`.

### Prerequisites

1. **MicroK8s** installed on every node ([snap install guide](https://microk8s.io/docs/getting-started)):

   ```bash
   sudo snap install microk8s --classic --channel=1.31/stable
   sudo microk8s status --wait-ready
   ```

2. **Enable required addons** (run on the control-plane node):

   ```bash
   microk8s enable dns
   microk8s enable ingress          # NGINX Ingress controller
   microk8s enable cert-manager     # cert-manager for TLS
   microk8s enable helm3            # Helm 3
   microk8s enable hostpath-storage # default StorageClass
   ```

   > For **shared storage across multiple nodes** (ReadWriteMany), enable an
   > NFS-based storage class or OpenEBS:
   >
   > ```bash
   > # Option A – NFS CSI driver (recommended for multi-node RWX)
   > microk8s enable nfs
   >
   > # Option B – Community NFS provisioner
   > microk8s helm3 repo add nfs-subdir https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
   > microk8s helm3 install nfs-provisioner nfs-subdir/nfs-subdir-external-provisioner \
   >   --set nfs.server=<NFS_SERVER_IP> \
   >   --set nfs.path=<NFS_EXPORT_PATH>
   > ```

3. **Create a ClusterIssuer** for Let's Encrypt (one-time setup):

   ```yaml
   # letsencrypt-prod.yaml
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt-prod
   spec:
     acme:
       server: https://acme-v02.api.letsencrypt.org/directory
       email: you@example.com
       privateKeySecretRef:
         name: letsencrypt-prod
       solvers:
         - http01:
             ingress:
               class: nginx
   ```

   ```bash
   microk8s kubectl apply -f letsencrypt-prod.yaml
   ```

4. **Join worker nodes** to the cluster:

   ```bash
   # On the control-plane node, generate a join token:
   microk8s add-node

   # On each worker node, run the join command printed above:
   microk8s join <control-plane-ip>:<port>/<token>
   ```

### Build & push the Docker image

```bash
# From the repository root
docker build -f apps/web/Dockerfile -t <REGISTRY>/web:latest .
docker push <REGISTRY>/web:latest
```

### Configure the chart

Edit `apps/web/helm/web/values.yaml` (or pass overrides via `--set` / `-f`):

| Key                          | Description                         | Default           |
| ---------------------------- | ----------------------------------- | ----------------- |
| `replicaCount`               | Number of pod replicas              | `2`               |
| `image.repository`           | Container image (no tag)            | `docker/web`      |
| `image.tag`                  | Image tag                           | `latest`          |
| `ingress.enabled`            | Create an Ingress resource          | `true`            |
| `ingress.hosts[0].host`      | Public hostname                     | `web.example.com` |
| `env`                        | Plain environment variables (map)   | see values.yaml   |
| `envFromSecret`              | Env vars from existing Secrets      | `[]`              |
| `sharedStorage.enabled`      | Create a ReadWriteMany PVC          | `true`            |
| `sharedStorage.storageClass` | StorageClass name (empty = default) | `""`              |
| `sharedStorage.size`         | PVC size                            | `1Gi`             |
| `nodeAffinity.enabled`       | Restrict pods to specific nodes     | `false`           |
| `nodeAffinity.nodeNames`     | List of allowed node names          | `[]`              |

### Deploy

```bash
# Alias for convenience (optional)
alias helm='microk8s helm3'
alias kubectl='microk8s kubectl'

# Install (first time)
helm -n web install web ./apps/web/helm \
  --set image.repository=<REGISTRY>/web \
  --set image.tag=latest \
  --set ingress.hosts[0].host=web.example.com \
  --set ingress.tls[0].hosts[0]=web.example.com

# Upgrade (subsequent deploys)
helm -n web upgrade web ./apps/web/helm \
  --set image.tag=<NEW_TAG>
```

### Create the health file

The startup and liveness probes check for a file in the shared volume.
After the application starts, create it so probes pass:

```bash
# From any pod in the deployment
kubectl exec deploy/web -n web -- touch /app/media/.healthy
```

Or include the health-file creation in your application startup script.

### Useful commands

```bash
# Check release status
helm -n web list

# View rendered templates without deploying
helm template web ./apps/web/helm -n web

# Uninstall the release
helm -n web uninstall web

# View pod logs
kubectl logs -n web -l app.kubernetes.io/name=web --tail=50 -f
```
