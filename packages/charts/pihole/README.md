# Pi-hole Helm Chart (Wrapper)

This is a wrapper chart that references the community [MoJo2600/pihole](https://github.com/MoJo2600/pihole-kubernetes) chart. It is pre-configured for MicroK8s with MetalLB.

## Prerequisites

- MicroK8s cluster
- MetalLB installed and configured
- Helm 3

## Interactive CLI

Everything below is also available from one interactive menu:

```bash
pnpm pihole    # or: bash cli/pihole/pihole.sh
```

It prompts for release + namespace, then loops over: deployment status,
upstream chart repo/dependency update, set/rotate the admin password (writes
the Secret and offers the required pod restart), redeploy, rollout restart or
scale 0/1, logs + describe + events + DNS test, Pi-hole maintenance (gravity
rebuild, log flush, domain/list counts, status, versions), and uninstall
(deleting the PVC, the password Secret and the namespace are separate opt-in
prompts). The raw commands are documented below for reference.

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

| Parameter                           | Description                        | Default             |
| ----------------------------------- | ---------------------------------- | ------------------- |
| `pihole.admin.existingSecret`       | Secret holding the Web UI password | `pihole-admin`      |
| `pihole.DNS1` / `pihole.DNS2`       | Upstream resolvers                 | `1.1.1.1`/`8.8.8.8` |
| `pihole.serviceDns.loadBalancerIP`  | DNS service IP                     | `192.168.0.200`     |
| `pihole.serviceWeb.loadBalancerIP`  | Web UI IP                          | `192.168.0.200`     |
| `pihole.persistentVolumeClaim.size` | PVC size                           | `2Gi`               |

### Update Admin Password

The password lives in a Secret created **outside Helm**, so it is never
committed. `values.yaml` only names it:

```yaml
pihole:
  admin:
    enabled: true
    existingSecret: "pihole-admin"
    passwordKey: "password"
```

Create or rotate it with:

```bash
kubectl create secret generic pihole-admin -n pihole \
  --from-literal=password="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)" \
  --dry-run=client -o yaml | kubectl apply -f -

# read it back when you need to log in
kubectl get secret pihole-admin -n pihole -o jsonpath='{.data.password}' | base64 -d; echo

# rotating requires a pod restart to re-read the env var
kubectl rollout restart deploy/pihole -n pihole
```

Pi-hole v6 takes a **plaintext** password — it is passed as
`FTLCONF_webserver_api_password`. Do not hash it; older docs suggesting
`md5sum` describe Pi-hole v5 and do not apply.

Notes:

- With `existingSecret` set, the chart does **not** render its own Secret and
  `adminPassword` is ignored. Do not set both.
- The Secret is not owned by the release, so `helm uninstall` leaves it in
  place. Delete it explicitly if you are tearing the namespace down.
- If `admin.enabled` is true with neither `existingSecret` nor `adminPassword`,
  the chart generates `randAlphaNum 40` **at render time** — meaning a new
  password on every `helm upgrade`. Always set one of the two.

> ⚠️ `admin.password` is not a chart value. The `admin` map accepts only
> `enabled`, `existingSecret`, `passwordKey` and `annotations`; anything else
> there is silently discarded and the chart falls back to its default of
> `admin`.

### Upstream DNS

`DNS1`/`DNS2` must be **top-level** values under `pihole:`. The deployment
template reads them to build `FTLCONF_dns_upstreams`. Putting them under
`extraEnvVars` instead only sets literal `DNS1`/`DNS2` container env vars,
which Pi-hole v6 ignores (those are v5 names), silently leaving the subchart
defaults `8.8.8.8;8.8.4.4` in place.

### Blocklists

`pihole.adlists` is imported **only on first start against an empty PVC**. On a
running instance, add lists through the web UI or the API and then rebuild
gravity — but keep `values.yaml` in sync so a rebuild from scratch reproduces
the same blocking.

Current stack (~640k unique domains):

| List                          | Domains | Purpose                               |
| ----------------------------- | ------- | ------------------------------------- |
| StevenBlack `hosts`           | 99,276  | Base ads + malware                    |
| Hagezi `adblock/pro.txt`      | 218,748 | Main ad/tracker list (ABP format)     |
| Hagezi `tif.medium.txt`       | 387,953 | Threat intel: malware, phishing, scam |
| Hagezi `popupads.txt`         | 54,245  | Pop-up / interstitial ad networks     |
| Hagezi `native.samsung.txt`   | 201     | Samsung TV ACR + ad telemetry         |
| Hagezi `native.amazon.txt`    | 360     | Amazon device/voice telemetry         |
| Hagezi `native.apple.txt`     | 107     | Apple telemetry                       |
| Hagezi `native.winoffice.txt` | 390     | Windows/Office telemetry              |

Plus `native.tiktok.txt` (427). Exact deny rules for single-endpoint telemetry:
`ichnaea.netflix.com`, `telemetry.vercel.com`, `aet.spotify.com`.

Two further regex rules:

```
(\.|^)logs\.[a-z0-9]+\.datadoghq\.com$     # Datadog log intake (all regions)
\.(zip|mov|cfd|sbs|rest|bond|cyou|icu|quest|buzz|monster|lol|cam|gq|ml|cf|tk|
   ga|work|fit|beauty|hair|skin|makeup|mom|autos|boats|yachts|motorcycles|
   homes|christmas|top|kim|stream|download|gdn|racing|win|bid|loan|date|faith|
   science|party|review|trade|accountant|cricket|men)$
```

The TLD rule replaces the unusable `spam-tlds.txt`. It is a **curated** set of
49 high-abuse TLDs, verified to match zero of the 300 domains this network
actually resolves. `.xyz`, `.link`, `.live`, `.app`, `.dev` and `.io` are
deliberately excluded — they have substantial legitimate use.

### DNSSEC

Enabled (`dns.dnssec = true`). Verified: signed responses carry the `ad` flag,
and `dnssec-failed.org` correctly returns `SERVFAIL`. If a domain ever fails to
resolve with `SERVFAIL` while working on another resolver, a broken DNSSEC
chain at that domain is the first thing to check.

**Rejected after testing against real traffic:**

| List                       | Why not                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pro.plus.txt`             | Blocks `graph.instagram.com` — breaks Instagram                                                                                 |
| `spam-tlds.txt`            | uBlock/AdGuard syntax (`\|\|*.tld^$denyallow=`) — Pi-hole parses **0** entries from it. TLD blocking needs a regex rule instead |
| `urlshortener.txt`         | No impact on current traffic, but breaks bit.ly / t.co links later                                                              |
| `doh-vpn-proxy-bypass.txt` | Also blocks commercial VPN endpoints                                                                                            |
| OISD Big                   | Missed the Samsung/Amazon trackers `pro.txt` caught, despite being 2× the size                                                  |

Hagezi serves these in ABP (`||domain^`) format under `adblock/`, which Pi-hole
v6 parses natively. The old `hosts/` paths in that repo now 404.

Regex deny rules are held only in the running config (not in `values.yaml`),
covering Samsung ad/ACR endpoints that no public list includes:

```
(\.|^)samsungqbe\.com$      (\.|^)samsungacr\.com$
(\.|^)samsungnyc\.com$      (\.|^)samsungads\.com$
(\.|^)samsungosp\.com$      ^web\.diagnostic\.networking\.aws\.dev$
```

Deliberately **not** blocked globally: `api.amazonalexa.com` (breaks Alexa) and
`spectrum.s3.amazonaws.com` (Spectrum TV app).

### Client groups

> ⚠️ Groups, client assignments and domain rules live in the **database on the
> PVC**, not in `values.yaml`. A rebuild from an empty PVC loses them — only
> `adlists` is reproduced from the chart. Re-create the following by hand.

| Group            | id  | Members         | Purpose                         |
| ---------------- | --- | --------------- | ------------------------------- |
| Default          | 0   | everything else | All adlists + global rules      |
| Samsung Soundbar | 3   | `192.168.0.23`  | Group 0 **plus** the rule below |

Group-scoped rule (group 3 only — the soundbar polls this ~2,300×/hour):

```
(\.|^)samsungcloudsolution\.(com|net)$
```

Earlier `Work` (1) and `Chris` (2) groups were removed deliberately. Their
clients `192.168.0.25` and `192.168.0.28` now fall into Default and are filtered
like everything else — intended, not a regression.

### Amazon Echo

Echo telemetry is largely handled by `native.amazon.txt`. Verified blocked:
`device-metrics-us{,-2}.amazon.com`, `*.minerva.devices.a2z.com`,
`unagi-na.amazon.com`, `cdn.prod.adskit.juno.alexa.amazon.dev`,
`trck.ahs.*.advertising.amazon.dev`, plus this regex for the Echo's network
diagnostics telemetry (`v6.`/`https.`/`aga.`/`cloudfront.` variants):

```
(\.|^)diagnostic\.networking\.aws\.dev$
```

**Never block these** — they carry the "Alexa…" voice path and device state.
Blocking the captive-portal names in particular makes an Echo believe it is
offline:

```
api.amazonalexa.com          alexa.na.gateway.devices.a2z.com
api.eu.amazonalexa.com       arcus-uswest.amazon.com
api.fe.amazonalexa.com       msh.amazon.com
acsechocaptiveportal.com     dss-na.amazon.com
mmechocaptiveportal.com      prod.amcs-tachyon.com
api.amazon.com               dcape-na.amazon.com
```

Voice recordings travel over the _same_ endpoints as voice commands, so DNS
cannot separate them. Control that in the Alexa app under **Alexa Privacy**
(disable recording retention and human review), not here.

**A client listed only in a non-default group gets no filtering at all**, because
every adlist is attached to group 0. That is why the soundbar is assigned to
`[0, 3]` and not `[3]` — assigning it to `[3]` alone would silently exempt it
from all ~640k domains. Any new group needs either its own lists or membership
in group 0 alongside it.

DNS blocking stops a device _reaching_ a host; it does not stop it _asking_. The
soundbar's query rate is unchanged (~0.7/sec) — Pi-hole now answers `0.0.0.0`
instead of the real address. To actually silence the traffic, take the device
off Wi-Fi (fine if it is used over HDMI/optical).

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
    version: "2.35.0" # specific version
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
2. **Password**: stored in the `pihole-admin` Secret, not in `values.yaml`:

   ```bash
   kubectl get secret pihole-admin -n pihole -o jsonpath='{.data.password}' | base64 -d; echo
   ```

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
