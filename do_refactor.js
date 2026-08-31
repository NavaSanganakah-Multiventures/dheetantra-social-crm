const fs = require('fs');

let c = fs.readFileSync('src/routes/plivoVoice.ts', 'utf8');

if (!c.includes('import { Context }')) {
    c = c.replace('import { Hono } from \'hono\';', 'import { Hono, Context } from \'hono\';');
}

const baseUrlFunc = `
function getBaseUrl(c: Context): string {
  const env = c.env as any;
  return (env.APP_URL as string | undefined) || ('https://' + (c.req.header('host') || 'dheetantra.navasanganakah.com'));
}
`;

if (!c.includes('function getBaseUrl')) {
    c = c.replace('function plivoXmlResponse', baseUrlFunc + '\nfunction plivoXmlResponse');
}

const targetBaseUrl = `const baseUrl = ((c.env as any).APP_URL as string | undefined) || ('https://' + (c.req.header('host') || 'dheetantra.navasanganakah.com'));`;
c = c.split(targetBaseUrl).join('const baseUrl = getBaseUrl(c as Context);');

c = c.replace(/[ \t]*console\.log\('\[Plivo[^\)]+\);\r?\n/g, '');
c = c.replace(/\.catch\(\(\) => \(\{\}\)\)/g, '.catch((err) => { console.error(\'[Plivo] fetch error:\', err); return {}; })');

fs.writeFileSync('src/routes/plivoVoice.ts', c, 'utf8');

let f_content = fs.readFileSync('flutter/user/lib/services/plivo_voice_service.dart', 'utf8');
f_content = f_content.replace('await _ensureMicrophonePermission();', 'await _ensureMicrophonePermissionGranted();');
f_content = f_content.replace(/\/\/\/ Deprecated compatibility method:[^}]*?Future<void> _ensureMicrophonePermission\(\) async \{\s*await _ensureMicrophonePermissionGranted\(\);\s*\}\s*/g, '');
fs.writeFileSync('flutter/user/lib/services/plivo_voice_service.dart', f_content, 'utf8');

const web_file = 'app/dashboard/components/PlivoSettingsSection.tsx';
let w_content = fs.readFileSync(web_file, 'utf8');

const interfaces = `
interface Agent {
  userId: string;
  name?: string;
  email?: string;
  voiceStatus?: string;
  phoneMasked?: string;
}

interface PlivoConfig {
  id: string;
  name: string;
  authId: string;
  authTokenMasked: string;
  isActive: boolean;
  autoDialAgents: boolean;
  endpointConfigured: boolean;
  endpointUsername?: string;
  endpointPasswordMasked?: string;
  fromNumbers?: any[];
}
`;

if (!w_content.includes('interface Agent')) {
    w_content = w_content.replace('export function PlivoSettingsSection', interfaces + '\nexport function PlivoSettingsSection');
}

w_content = w_content.replace('useState<any[]>([])', 'useState<Agent[]>([])');
w_content = w_content.replace('useState<any[]>([])', 'useState<PlivoConfig[]>([])');
w_content = w_content.replace('useState<any>', 'useState<PlivoConfig | null>');

fs.writeFileSync(web_file, w_content, 'utf8');
console.log("Refactor script complete!");
