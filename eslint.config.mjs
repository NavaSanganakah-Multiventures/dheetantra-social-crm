import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import next from "eslint-config-next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('eslint').Linter.Config[]} */
const config = [
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
      "public/**",
      "hooks/**",
      "assets/**",
    ],
  },
  ...next,
];

export default config;
