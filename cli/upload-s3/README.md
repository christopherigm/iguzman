# upload-s3

Interactive, resumable, **chunked** uploader for the custom Garage (S3) store at
`https://s3.iguzman.com.mx`.

```bash
pnpm upload-s3
# or
bash cli/upload-s3/upload-s3.sh
```

## Why this exists

The Garage S3 endpoint sits behind a **CloudFlare** proxy (~90 MB request-body
cap) and an **nginx** Ingress (80 MB cap). A plain `PUT` of a large video blows
past both and fails.

This script drives **rclone** with a small multipart **part size** (default
`50 MB`, safely under both caps). rclone uploads any file larger than the part
size as a multipart upload — one part per HTTP request — so every request over
the wire stays under the limits while the object itself can be arbitrarily large.

## What it does

1. **Checks for `rclone`** before showing any menu. If missing, it offers to
   install it via `apt` (falling back to rclone's official installer). Both use
   `sudo` — you supply the password.
2. **Language** prompt (English / Spanish).
3. **Main menu**
   - **Manage credentials** — add / edit / remove S3 credential profiles.
   - **Upload files**.
4. **Upload flow**
   - Pick a credential profile.
   - Pick a destination **bucket** (listed from the server; falls back to buckets
     remembered in the profile, or manual entry, for bucket-scoped keys).
   - Upload to the **bucket root** or into a **folder (prefix)**.
   - Enter the **local folder path**.
   - **Checkbox** which top-level entries to include (recurses into folders,
     mirroring the tree).
   - Review a summary (files, total size, part size) and confirm.
   - rclone runs with a live **overall progress** display. Interrupted uploads
     **resume** on the next run (already-uploaded files are skipped).

## Credentials

Profiles live in `cli/upload-s3/credentials/*.env` next to the script and are
**git-ignored** (they hold live access keys). Each file looks like:

```bash
S3_ENDPOINT="https://s3.iguzman.com.mx"
S3_REGION="garage"
S3_ACCESS_KEY_ID="GK..."
S3_SECRET_ACCESS_KEY="..."
S3_BUCKETS="video-downloader,my-files"   # optional; helps bucket-scoped keys
```

Mint a personal Garage key/bucket with
`packages/charts/garage/scripts/provision-user-key.sh`, then paste the printed
`access_key_id` / `secret_access_key` into a new profile via **Manage
credentials → Add**.

## Tuning (env vars)

| Var                   | Default | Meaning                                         |
| --------------------- | ------- | ----------------------------------------------- |
| `UPLOAD_S3_CHUNK_MB`  | `50`    | Multipart part size (MB). Keep **< 80**.        |
| `UPLOAD_S3_TRANSFERS` | `4`     | Parallel file transfers (`rclone --transfers`). |

```bash
UPLOAD_S3_CHUNK_MB=40 pnpm upload-s3
```

## Requirements

- `rclone` (auto-installed on first run)
- A Garage access key + bucket (path-style addressing; the script sets
  `force_path_style` automatically, as Garage requires unless you set up
  wildcard DNS + TLS).
