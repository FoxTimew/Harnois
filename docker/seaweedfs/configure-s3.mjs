import { chown, writeFile } from "node:fs/promises";

const accessKey = process.env.S3_ACCESS_KEY;
const secretKey = process.env.S3_SECRET_KEY;
if (!accessKey || !secretKey)
  throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY are required.");

// SeaweedFS logs the access key when using its AWS_* environment fallback.
// Its credential file avoids that path and never enters an image or the repository.
await writeFile(
  "/configuration/s3.json",
  JSON.stringify({
    identities: [
      {
        name: "harnois-development",
        credentials: [{ accessKey, secretKey }],
        actions: ["Admin"],
      },
    ],
  }),
  { mode: 0o600 },
);
// The official entrypoint drops privileges to seaweed (uid/gid 1000).
await chown("/configuration/s3.json", 1000, 1000);
console.info("Development S3 credentials configured.");
