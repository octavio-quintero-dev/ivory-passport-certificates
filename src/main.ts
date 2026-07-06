// Entry point del worker. Encadena fetch -> parse -> upload.
// Se implementa en Fase 1+. Ver CHECKLIST.md.

async function main(): Promise<void> {
  console.log("ivory-passport-certificates: worker no implementado todavía (Fase 0)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
