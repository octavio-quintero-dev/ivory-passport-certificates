// Runtime configuration, validated at startup. Fail fast with a clear message
// if a required S3 credential/bucket is missing.

import { z } from "zod";

const schema = z.object({
  AWS_REGION: z.string().default("fsn1"),
  AWS_ACCESS_KEY_ID: z.string().min(1, "required"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "required"),
  // Empty for AWS S3; set to the Hetzner Object Storage endpoint otherwise.
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1, "required"),
  S3_PREFIX: z.string().default("csca"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${details}`);
  }
  return parsed.data;
}
