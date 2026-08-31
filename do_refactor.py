
import re

with open('src/routes/plivoVoice.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add getBaseUrl and Context import if not present
if 'import { Context }' not in content:
    content = content.replace('import { Hono } from \'hono\';', 'import { Hono, Context } from \'hono\';')

base_url_func = '''
function getBaseUrl(c: Context): string {
  const env = c.env as any;
  return (env.APP_URL as string | undefined) || ('https://' + (c.req.header('host') || 'dheetantra.navasanganakah.com'));
}
'''
if 'function getBaseUrl' not in content:
    content = content.replace('function plivoXmlResponse', base_url_func + '\nfunction plivoXmlResponse')

# Replace inline baseUrls
content = re.sub(r'const baseUrl = \(\(c\.env as any\)\.APP_URL as string \| undefined\) \|\| \(\'https://\' \+ \(c\.req\.header\(\'host\'\) \|\| \'dheetantra\.navasanganakah\.com\'\)\);', 'const baseUrl = getBaseUrl(c);', content)

# Remove console.logs except errors
content = re.sub(r'[ \t]*console\.log\(\'\[Plivo[^\)]+\);\r?\n', '', content)

# Fix empty catch blocks
content = re.sub(r'\.catch\(\(\) => \(\{\}\)\)', '.catch((err) => { console.error(\'[Plivo] fetch error:\', err); return {}; })', content)

with open('src/routes/plivoVoice.ts', 'w', encoding='utf-8') as f:
    f.write(content)

# Flutter
with open('flutter/user/lib/services/plivo_voice_service.dart', 'r', encoding='utf-8') as f:
    f_content = f.read()

f_content = f_content.replace('await _ensureMicrophonePermission();', 'await _ensureMicrophonePermissionGranted();')
f_content = re.sub(r'/// Deprecated compatibility method:[^}]*?Future<void> _ensureMicrophonePermission\(\) async \{\s*await _ensureMicrophonePermissionGranted\(\);\s*\}\s*', '', f_content)

with open('flutter/user/lib/services/plivo_voice_service.dart', 'w', encoding='utf-8') as f:
    f.write(f_content)

# Web Dashboard
web_file = 'app/dashboard/components/PlivoSettingsSection.tsx'
with open(web_file, 'r', encoding='utf-8') as f:
    w_content = f.read()

interfaces = '''
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
'''

if 'interface Agent' not in w_content:
    w_content = w_content.replace('export function PlivoSettingsSection', interfaces + '\nexport function PlivoSettingsSection')

w_content = w_content.replace('useState<any[]>([])', 'useState<Agent[]>([])', 1) # first is agents
w_content = w_content.replace('useState<any[]>([])', 'useState<PlivoConfig[]>([])', 1) # second is configs

with open(web_file, 'w', encoding='utf-8') as f:
    f.write(w_content)

