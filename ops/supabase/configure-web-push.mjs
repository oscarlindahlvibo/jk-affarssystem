import { createECDH } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("Usage: node configure-web-push.mjs /path/to/supabase/.env");
const source = readFileSync(path, "utf8");
const present = (name) => source.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1];
if (present("WEB_PUSH_PUBLIC_KEY") && present("WEB_PUSH_PRIVATE_KEY")) {
  console.log("Existing Web Push keys preserved.");
} else {
  if (present("WEB_PUSH_PUBLIC_KEY") || present("WEB_PUSH_PRIVATE_KEY")) throw new Error("Incomplete existing Web Push key pair; refusing to replace it.");
  const key = createECDH("prime256v1");
  key.generateKeys();
  const values = {
    WEB_PUSH_PUBLIC_KEY: key.getPublicKey().toString("base64url"),
    WEB_PUSH_PRIVATE_KEY: key.getPrivateKey().toString("base64url"),
  };
  copyFileSync(path, `${path}.backup-push-${Date.now()}`);
  let result = source;
  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${name}=.*$`, "m");
    result = pattern.test(result) ? result.replace(pattern, `${name}=${value}`) : `${result.trimEnd()}\n${name}=${value}\n`;
  }
  writeFileSync(path, result, { mode: 0o600 });
  console.log("Web Push keys generated and saved server-side.");
}
