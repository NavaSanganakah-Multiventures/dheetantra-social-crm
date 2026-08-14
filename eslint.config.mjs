import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import next from "eslint-config-next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  {
    ignores: [
      ".wrangler/**",
      "out/**",
      ".next/**",
      "dist/**",
      "node_modules/**",
      "flutter/**",
      ".kilo/**",
      "db_migrations/**",
    ],
  },
  ...next,
];
