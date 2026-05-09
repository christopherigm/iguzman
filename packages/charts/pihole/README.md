# Pi-hole Helm Chart (Wrapper)

This is a wrapper chart that references the community [MoJo2600/pihole](https://github.com/MoJo2600/pihole-kubernetes) chart. It is pre-configured for MicroK8s with MetalLB.

## Prerequisites

- MicroK8s cluster
- MetalLB installed and configured
- Helm 3

## Quick Install

```bash
# Navigate to charts directory
cd packages/charts

# Update dependencies to fetch latest MoJo2600 chart
helm dependency update pihole

# Install Pi-hole
helm install pihole pihole/ -n pihole --create-namespace -f pihole/values.yaml
```

## Configuration

Edit `values.yaml` before installing:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `pihole.admin.password` | Web UI password | `changeme` |
| `pihole.serviceDns.loadBalancerIP` | DNS service IP | `192.168.0.200` |
| `pihole.serviceWeb.loadBalancerIP` | Web UI IP | `192.168.0.200` |
| `pihole.persistentVolumeClaim.size` | PVC size | `2Gi` |

### Update Admin Password

Before install, generate a secure password hash:

```bash
echo -n "YourPassword" | md5sum
```

Then update `values.yaml`:

```yaml
pihole:
  admin:
    password: "YOUR_PASSWORD_HASH"
```

## Pull Latest MoJo2600 Updates

The wrapper uses the MoJo2600 chart as a dependency. To get updates:

```bash
# Update dependencies (fetches latest chart version)
helm dependency update pihole

# See available versions
helm search repo mojo2600/pihole

# Upgrade to newer version
helm upgrade pihole pihole/ -n pihole -f pihole/values.yaml
```

To pin a specific version instead of using `>=2.35.0`, edit `Chart.yaml`:

```yaml
dependencies:
  - name: pihole
    version: "2.35.0"  # specific version
    repository: "https://mojo2600.github.io/pihole-kubernetes/"
```

## Disable Pi-hole

### Option 1: Uninstall (removes all resources)

```bash
helm uninstall pihole -n pihole
kubectl delete pvc -n pihole pihole-pihole  # optional: delete data
```

### Option 2: Scale to Zero (preserves data)

```bash
kubectl scale deployment pihole-pihole -n pihole --replicas=0
```

To re-enable:

```bash
kubectl scale deployment pihole-pihole -n pihole --replicas=1
```

## Access Web UI

After installation:

1. **URL**: `http://192.168.0.200/admin` or `https://192.168.0.200/admin`
2. **Password**: Set in `values.yaml` (default: `changeme`)

## Router DNS Configuration

### Arris SBG10 Setup

1. Open router admin page: `http://192.168.0.1`
2. Navigate to: **Gateway > Connection > LAN Settings**
3. Find DHCP settings or DNS configuration
4. Set DNS server to: `192.168.0.200` (Pi-hole IP)
5. Save and reboot router if needed

### What This Does

- All DHCP clients will automatically use Pi-hole for DNS
- Ads and trackers will be blocked network-wide
- You can view query logs at `http://192.168.0.200/admin`

### Preserving Existing Virtual Server

The router's DHCP DNS change **does not affect** your existing virtual server that forwards ports 80/443 to the master node. That forwarding is handled at the router's port-forwarding level and is independent of DNS settings.

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n pihole
kubectl logs -n pihole -l app.kubernetes.io/name=pihole
```

### Check Services

```bash
kubectl get svc -n pihole
```

Expected output:
```
NAME          TYPE           CLUSTER-IP      EXTERNAL-IP     PORT(S)
pihole-dns    LoadBalancer   10.152.183.x    192.168.0.200   53/UDP,53/TCP
pihole-web    LoadBalancer   10.152.183.x    192.168.0.200   80/TCP,443/TCP
```

### MetalLB Not Assigning IP

Check MetalLB controller logs:

```bash
kubectl logs -n metallb-system -l app.kubernetes.io/name=metallb
```

Ensure the IP is in MetalLB's address pool (check `metallb` configmap).

### DNS Not Resolving

- Verify Pi-hole pod is running
- Check upstream DNS in Pi-hole web UI (Settings > DNS)
- Test: `kubectl exec -n pihole -- nc -zv 1.1.1.1 53`

## Uninstall

```bash
# Remove Helm release
helm uninstall pihole -n pihole

# Delete namespace (includes all resources)
kubectl delete namespace pihole

# Optional: delete persistent volume data
kubectl delete pvc -n pihole --all
```