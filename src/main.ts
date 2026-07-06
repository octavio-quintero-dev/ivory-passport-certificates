// Worker entry point. Chains fetch -> parse -> upload.
// Implemented in Phase 1+. See CHECKLIST.md.

async function main(): Promise<void> {
  console.log("ivory-passport-certificates: worker not implemented yet (Phase 0)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
