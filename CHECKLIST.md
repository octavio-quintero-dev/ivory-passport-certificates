# CSCA Master List Scraper — Checklist del proceso

Worker batch en TypeScript: descarga Master Lists públicas → extrae certificados CSCA → normaliza a `.pem` → sube a S3. Corre semanal vía CronJob.

**Regla base:** la estructura crece cuando aparece el segundo caso real, no antes. Empezamos con 1 fuente (BSI).

---

## Fase 0 — Setup

- [x] Repo enlazado a GitHub (`main` = rama principal)
- [ ] `package.json` + TypeScript + `tsx` (dev) configurados
- [ ] Deps núcleo: `crawlee`, `pkijs`, `@peculiar/asn1-x509`, `@aws-sdk/client-s3`, `unzipper`, `zod`
- [ ] `vitest` para el test del parser
- [ ] `.gitignore` (node_modules, dist, tmp, .env)
- [ ] `.env.example` (S3 bucket, region, credenciales)

## Fase 1 — Spike BSI (el núcleo, sin Crawlee todavía)

> Objetivo: probar que openssl + pkijs alcanza ANTES de decidir framework. ~50 líneas cubren el ~80% de países.

- [ ] `fetch.ts` — GET del `.ml` del BSI a carpeta temporal (`os.tmpdir()`)
- [ ] `parse.ts` — desenvolver CMS SignedData (openssl `cms -verify -noverify -inform DER`)
- [ ] `parse.ts` — parsear el `SET OF Certificate` interno (pkijs) → un `.pem` por certificado
- [ ] **Test:** `.ml` de fixture → N certificados esperados (vitest)
- [ ] Verificar cuántos países/emisores distintos salen del archivo BSI

## Fase 2 — Storage

- [ ] `upload.ts` — subir los `.pem` a S3 de forma estructurada (ej. `csca/<pais>/<fingerprint>.pem`)
- [ ] Definir convención de nombres y layout del bucket
- [ ] Idempotencia: no re-subir lo que no cambió (dedupe por fingerprint)

## Fase 3 — Orquestación + resiliencia

- [ ] `main.ts` — encadena fetch → parse → upload
- [ ] Envolver en Crawlee (`CheerioCrawler`) para retry/backoff/queue
- [ ] Que una fuente caída NO tumbe el proceso entero (aislar errores por fuente)
- [ ] Logging de resumen: fuentes OK / fallidas, certificados nuevos / actualizados

## Fase 4 — Expansión de fuentes (recién cuando Fase 1-3 andan)

- [ ] Nace `src/sources/` con un archivo por ministerio (`bsi.ts` primero)
- [ ] Identificar qué países NO cubre el BSI
- [ ] Sumar 2-4 master lists nacionales que agreguen (tapan casi todo el resto)
- [ ] Un puñado suelto para los que falten hasta llegar a ~100

## Fase 5 — Automatización / deploy

- [ ] Build de prod (`tsc` o `tsup`)
- [ ] Dockerfile (incluir `openssl` en la imagen)
- [ ] k8s CronJob semanal (el scheduler es infra, NO node-cron adentro del proceso)
- [ ] Alertas si el run falla o si una fuente clave queda offline N semanas

---

## Decisiones tomadas

- **Lenguaje:** TypeScript (matchea stack de ivory)
- **Scraping:** Crawlee / `CheerioCrawler` — Playwright solo si un sitio lo exige
- **Sin NestJS:** es un worker batch, no una app que escucha
- **Parsing:** openssl (desenvolver CMS) + pkijs (SET OF Certificate). Es la parte difícil real
- **Scheduling:** k8s CronJob, no `node-cron`

## Fuera de alcance (NO hacer)

- ❌ Apuntar a servidores ICAO (CAPTCHA + licencia)
- ❌ NestJS, Playwright preventivo, axios, ORM, node-cron
- ❌ Mapear 100 sitios el día 1
