# ivory-passport-certificates

Worker que recupera **Master Lists públicas** de certificados CSCA gubernamentales, extrae y normaliza los certificados a `.pem`, y los sube a S3. Estos certificados los consumen los clientes iOS para la **Passive Authentication** en la lectura NFC del pasaporte (ICAO 9303).

No apunta nunca a servidores ICAO. Usa fuentes públicas institucionales, empezando por la Master List del **BSI alemán** (que agrega los CSCA de decenas de naciones).

## Stack

- **TypeScript** (Node 20+)
- **Crawlee** (`CheerioCrawler`) — orquestación, retry, queue
- **openssl + pkijs** — parsing CMS / ASN.1 de las Master Lists
- **`@aws-sdk/client-s3`** — storage
- Deploy: **k8s CronJob** semanal

## Estado

Ver [CHECKLIST.md](./CHECKLIST.md) para el proceso y el avance.

## Ramas

- `main` — rama principal
- feature branches para cada fase / cambio
