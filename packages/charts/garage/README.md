# garage

A distributed, S3-compatible object store ([Garage](https://garagehq.deuxfleurs.fr/))
that pools the local disks of your Kubernetes nodes into a single S3 endpoint and
replicates objects across them.

Unlike MinIO erasure coding — which caps every drive to the size of the smallest
one — Garage supports **heterogeneous disks**: you give each node a capacity
weight and Garage places data proportionally. With disks of 80 GB / 200 GB /
2 TB / 900 GB, that is the difference between ~160 GB usable (MinIO) and roughly
`sum(capacities) / replicationFactor` usable here.

## How the physical storage works

- Each node runs one Garage pod (StatefulSet + `podAntiAffinity`, one per node),
  owning that node's disk through a PVC (or an explicit `hostPath`).
- From an S3 client there is **one endpoint and one flat bucket namespace** — the
  node/disk topology is invisible. S3 itself has no "free space" concept.
- Objects are split into blocks and stored on `replicationFactor` distinct nodes.
  Losing one node (e.g. a `NotReady` box) keeps the store readable and, with
  `replicationFactor: 3` over 4 nodes, writable.
- **Capacity per node is a weight, set in the layout** (see below) — not the PVC
  `size`. On `microk8s-hostpath` the PVC size is advisory and not enforced.

> ⚠️ **Which physical disk?** `microk8s-hostpath` provisions PVCs under the
> kubelet's storage directory, which sits on each node's **root disk**. If your
> 2 TB / 900 GB volumes are separate mounts, either repoint microk8s
> hostpath-storage at the big disk on each node, or set
> `persistence.hostPath` to a directory on that disk.

## Install

The easiest path is the interactive helper, which runs the Helm
`upgrade --install` and then offers to apply the one-time layout bootstrap for
you:

```bash
pnpm deploy-garage   # prompts for release name + namespace (default: garage)
```

Or do it by hand:

```bash
helm install garage packages/charts/garage -n garage --create-namespace
```

Either way, **apply the layout once** (first install is not complete until you
do — `pnpm deploy-garage` offers to run this step automatically):

```bash
kubectl get pods -n garage -o wide          # wait for all pods Running
./packages/charts/garage/scripts/bootstrap-layout.sh garage garage
```

## Bootstrapping the layout

The script maps Garage node IDs → pod IP → k8s node → capacity and runs
`garage layout assign`/`apply`. To do it by hand instead:

```bash
P=garage-0; C=/run/garage/garage.toml
kubectl exec -n garage $P -- /garage -c $C status          # note each node's ID
kubectl exec -n garage $P -- /garage -c $C layout assign <id-node1> -z default -c 80G
kubectl exec -n garage $P -- /garage -c $C layout assign <id-node4> -z default -c 200G
kubectl exec -n garage $P -- /garage -c $C layout assign <id-node5> -z default -c 2T
kubectl exec -n garage $P -- /garage -c $C layout assign <id-node6> -z default -c 900G
kubectl exec -n garage $P -- /garage -c $C layout apply --version 1
```

The layout persists in Garage's metadata; you do **not** repeat it on every
`helm upgrade`.

**Changing capacities later is just a re-run.** Edit `layout.capacities` in
`values.yaml` and run `bootstrap-layout.sh` again — it re-assigns every node's
weight and auto-detects the next layout version to apply (Garage requires the
version to increment on each change), so you no longer bump `--version` by hand.
It's a no-op if nothing changed. Adding a node works the same way once it's in
`nodeAffinity.nodeNames` (and `replicaCount`): re-run the script and it assigns
the newcomer alongside the rest. The manual `--version 1` above only applies to
a first-ever, by-hand bootstrap.

## Wiring credentials into an app

`scripts/provision-app-secret.sh` mints a bucket + access key in Garage and
writes the credentials into an app's `<app>-secrets` Secret — the same Secret
that `pnpm helm` → "Reveal secrets" reads and `pnpm secrets` manages. It is
idempotent and only touches the `S3_*` keys (other keys are preserved).

```bash
# ./provision-app-secret.sh [APP] [APP_NAMESPACE] [BUCKET] [KEY_NAME]
./packages/charts/garage/scripts/provision-app-secret.sh video-downloader video-downloader-2
```

It sets these keys in `video-downloader-secrets`:

| Key                    | Value                                            |
| ---------------------- | ------------------------------------------------ |
| `S3_ENDPOINT`          | `http://garage-s3.garage.svc.cluster.local:3900` |
| `S3_REGION`            | `garage`                                         |
| `S3_ACCESS_KEY_ID`     | minted by Garage                                 |
| `S3_SECRET_ACCESS_KEY` | minted by Garage                                 |
| `S3_BUCKET`            | `video-downloader`                               |

The same keys are declared in `apps/video-downloader/env.example`, so you can
alternatively set/rotate them interactively with `pnpm secrets` (pick
`video-downloader`). Read them back afterwards with either:

```bash
pnpm helm video-downloader   # choose "Reveal secrets"
pnpm secrets                 # choose video-downloader
```

## Exposing the S3 endpoint (Ingress)

By default the S3 API is only reachable inside the cluster. To expose it, enable
the Ingress (routes to the `-s3` Service on port 3900):

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "0" # allow large uploads
  hosts:
    - host: s3.iguzman.com.mx
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts: [s3.iguzman.com.mx]
      secretName: garage-s3-tls
```

For **virtual-hosted-style** access (`bucket.s3.iguzman.com.mx`), add a `*.s3.iguzman.com.mx`
host and a matching wildcard TLS cert; otherwise use **path-style** addressing
(`forcePathStyle: true` in the AWS SDK), which needs only the single host above.

## Connecting from your PC (rclone / aws-cli / s3cmd)

To use Garage from an S3 client on your own machine, mint a **personal**
bucket-scoped key with `scripts/provision-user-key.sh`. Unlike
`provision-app-secret.sh`, it writes nothing to Kubernetes Secrets — it prints
ready-to-paste client config using an externally reachable endpoint:

```bash
# ./provision-user-key.sh [KEY_NAME] [BUCKET]
./packages/charts/garage/scripts/provision-user-key.sh            # key "$USER-laptop"
./packages/charts/garage/scripts/provision-user-key.sh chris my-files
```

It resolves the endpoint automatically:

- If the **Ingress** above is deployed, it uses that host (`https://` when the
  Ingress terminates TLS, else `http://`).
- Otherwise the `-s3` Service is `ClusterIP`-only, so it falls back to
  `http://localhost:3900` and prints the `kubectl port-forward` command to run
  first:

  ```bash
  kubectl port-forward -n garage svc/garage-s3 3900:3900
  ```

Override with `S3_ENDPOINT=…` if you expose Garage another way. The generated
snippets all force **path-style** addressing (required unless you set up the
wildcard DNS + cert above) and use region **`garage`**.

### Uploading large files past the CloudFlare / nginx caps

When the S3 endpoint is behind CloudFlare (~90 MB request-body cap) and the
nginx Ingress (80 MB cap), a plain `PUT` of a big video fails. Use the
interactive **chunked** uploader, which drives rclone with a small multipart
part size (50 MB) so every request stays under both limits:

```bash
pnpm upload-s3        # manage credential profiles, pick a bucket, upload a folder
```

See `cli/upload-s3/README.md` for details.

## Consumed vs available storage

Since S3 has no free-space API, capacity comes from Garage's admin tooling:

```bash
kubectl exec -n garage garage-0 -- /garage -c /run/garage/garage.toml status  # per-node capacity
kubectl exec -n garage garage-0 -- /garage -c /run/garage/garage.toml stats   # usage
```

Prometheus metrics are exposed on the admin port (`3903`, `/metrics`, guarded by
`GARAGE_METRICS_TOKEN`). Node filesystem usage: `kubectl exec <pod> -- df -h /mnt/garage`.

## Values

| Key                                   | Description                                              | Default                |
| ------------------------------------- | -------------------------------------------------------- | ---------------------- |
| `replicaCount`                        | Number of Garage pods (set = number of nodes)            | `4`                    |
| `image.repository` / `image.tag`      | Garage image                                             | `dxflrs/garage:v1.0.1` |
| `garage.replicationFactor`            | Copies of each object across the cluster                 | `3`                    |
| `garage.s3Region`                     | S3 region name clients must use                          | `garage`               |
| `garage.rpcSecret`                    | Cluster RPC secret (blank = generated, persisted)        | `''`                   |
| `garage.adminToken` / `metricsToken`  | Admin/metrics API tokens (blank = generated)             | `''`                   |
| `garage.existingSecret`               | Use an existing Secret with the `GARAGE_*` keys instead  | `''`                   |
| `garage.kubernetesDiscovery.skipCrd`  | Skip CRD creation (set true if CRD already installed)    | `false`                |
| `layout.capacities`                   | Per-node capacity weights (used by the bootstrap script) | see values             |
| `persistence.size`                    | PVC size (advisory on hostpath)                          | `50Gi`                 |
| `persistence.storageClass`            | StorageClass (empty = cluster default)                   | `''`                   |
| `persistence.hostPath`                | Bind-mount an explicit node path instead of a PVC        | `''`                   |
| `nodeAffinity.nodeNames`              | Nodes Garage is pinned to (one pod each)                 | see values             |
| `service.type`                        | Type of the S3 Service                                   | `ClusterIP`            |
| `ingress.enabled`                     | Expose the S3 API via an Ingress                         | `false`                |
| `ingress.className` / `hosts` / `tls` | Ingress class, host rules, and TLS for the S3 endpoint   | see values             |
| `rbac.create`                         | Create the ClusterRole for Kubernetes peer discovery     | `true`                 |

## Note on your cluster

`kubectl get nodes` shows `master / node1 / node2 / node4 / node6`, with `node2`
`NotReady` and **no `node5`**. The defaults here list `node5` as the 2 TB box —
reconcile that with the real node name in both `nodeAffinity.nodeNames` and
`layout.capacities` before installing (the bootstrap script reads both straight
from `values.yaml`, so there is nothing else to edit — and it warns if a node
appears in one list but not the other).
