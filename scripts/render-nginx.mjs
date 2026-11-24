import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

try {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      upstream: { type: "string" },
      cert: { type: "string" },
      key: { type: "string" },
    },
    strict: true,
  });
  const url = new URL(values.url);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  )
    throw new Error();
  if (!/^[a-z0-9.-]+:[0-9]{1,5}$/i.test(values.upstream ?? ""))
    throw new Error();
  const port = Number(values.upstream.split(":").at(-1));
  if (port < 1 || port > 65535) throw new Error();
  for (const path of [values.cert, values.key])
    if (!/^\/[a-z0-9_./-]+$/i.test(path ?? "")) throw new Error();
  let template = readFileSync(
    new URL("../docker/nginx/harnois.conf.template", import.meta.url),
    "utf8",
  );
  for (const [name, value] of Object.entries({
    HOST: url.hostname,
    UPSTREAM: values.upstream,
    CERT: values.cert,
    KEY: values.key,
  }))
    template = template.replaceAll(`@@${name}@@`, value);
  process.stdout.write(template);
} catch {
  process.stderr.write(
    "Usage : node scripts/render-nginx.mjs --url https://inventory.atlasv.io --upstream 127.0.0.1:3000 --cert /chemin/fullchain.pem --key /chemin/privkey.pem\n",
  );
  process.exitCode = 1;
}
