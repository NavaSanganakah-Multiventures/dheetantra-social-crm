const fs = require('fs');
const file = 'next.config.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace("webpack: (config, {dev}) => {", "turbopack: {},\n  webpack: (config, {dev}) => {");
code = code.replace("eslint: {", "// eslint: {");
code = code.replace("ignoreDuringBuilds: true,", "// ignoreDuringBuilds: true,");
code = code.replace("},", "// },");

fs.writeFileSync(file, code);
