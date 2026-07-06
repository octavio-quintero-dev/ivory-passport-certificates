# Deployment

The worker is a **batch job**: it runs once, processes every source, and exits.
It holds no state and serves no traffic. Deploy it as a container invoked on a
weekly schedule.

## 1. Build & push the image

```bash
docker build -t <registry>/ivory-csca:latest .
docker push <registry>/ivory-csca:latest
```

The image is `node:22-slim` + prod deps + compiled `dist`. No system packages —
certificate parsing is pure JS (openssl is **not** a runtime dependency).

## 2. Configure environment

Copy `.env.example` and fill it in. For **Hetzner Object Storage** (S3-compatible):

```
AWS_REGION=fsn1
AWS_ACCESS_KEY_ID=<hetzner key>
AWS_SECRET_ACCESS_KEY=<hetzner secret>
S3_ENDPOINT=https://fsn1.your-objectstorage.com
S3_BUCKET=ivory-csca-certificates
S3_PREFIX=csca
```

`S3_ENDPOINT` makes the AWS SDK talk to Hetzner (path-style addressing is set
automatically when an endpoint is present). Leave it empty to target AWS S3.

## 3. Schedule it weekly

On a Hetzner Cloud VM with Docker, a **systemd timer** is the simplest scheduler.

`/etc/systemd/system/csca.service`:
```ini
[Unit]
Description=CSCA Master List sync
[Service]
Type=oneshot
ExecStart=/usr/bin/docker run --rm --env-file /etc/csca.env <registry>/ivory-csca:latest
```

`/etc/systemd/system/csca.timer`:
```ini
[Unit]
Description=Weekly CSCA sync
[Timer]
OnCalendar=Mon *-*-* 03:17:00
Persistent=true
[Install]
WantedBy=timers.target
```

```bash
systemctl enable --now csca.timer
```

`Persistent=true` runs a missed job after the VM was down — important for a
weekly cadence.

### Alternative: Kubernetes

If a cluster is available, a `CronJob` with `schedule: "17 3 * * 1"` and the same
image/env works equally well.

## 4. Access control

Two distinct credentials on the bucket:

- **Worker (this service): write.** The only writer. Keep this locked down — the
  bucket is a trust store, and a forged CSCA would let a fake passport validate.
- **Passport-validation API: read-only.** A separate access key limited to
  `GetObject`/`ListObject` under the prefix. The data is public, but read is
  credentialed to control egress/abuse and keep consumers auditable.

Do **not** make the bucket public-read.

## 5. Exit codes & alerting

- Exit **0** — at least one source succeeded (a partial run is still useful).
- Exit **1** — every source failed, or a fatal error (bad config, etc.).

Wire your monitoring to the job's exit status / logs. The run prints a summary
line (`Sources: N ok, M failed — …`) suitable for log-based alerts.
