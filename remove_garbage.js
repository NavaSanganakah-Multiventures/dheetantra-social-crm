const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    for (const [regex, replacement] of replacements) {
        content = content.replace(regex, replacement);
    }
    fs.writeFileSync(filePath, content, 'utf8');
}

// 1. Web Frontend replacements
replaceInFile('app/dashboard/page.tsx', [
    [/^[ \t]*console\.log\('\[WS\] Global WebSocket connected'\);\r?\n/gm, '']
]);

replaceInFile('app/dashboard/components/TwilioVoiceProvider.tsx', [
    [/^[ \t]*console\.log\("\[TwilioWeb\].*\);\r?\n/gm, '']
]);

replaceInFile('app/dashboard/components/PlivoVoiceProvider.tsx', [
    [/^[ \t]*console\.log\("\[PlivoWeb\].*\);\r?\n/gm, '']
]);

replaceInFile('app/dashboard/components/SettingsView.tsx', [
    [/^[ \t]*console\.log\("FB login popup successful.*\);\r?\n/gm, '']
]);

// 2. Flutter replacements
// replace print with debugPrint, but we need to import foundation if it's not there,
// so it's easier to just comment them out or change to debugPrint if foundation is imported.
// Actually, `debugPrint` requires `import 'package:flutter/foundation.dart';`. Let's just remove the prints or use `debugPrint`.
// The user complained about garbage, so removing them is safest.
replaceInFile('flutter/user/lib/main.dart', [
    [/^[ \t]*print\('.*'\);\r?\n/gm, '']
]);

replaceInFile('flutter/admin/lib/services/api_service.dart', [
    [/^[ \t]*print\('.*'\);\r?\n/gm, '']
]);

replaceInFile('flutter/admin/lib/services/notification_service.dart', [
    [/^[ \t]*print\(.*\);\r?\n/gm, '']
]);

// 3. Remove TODOs in gradle files
replaceInFile('flutter/user/android/app/build.gradle.kts', [
    [/^[ \t]*\/\/ TODO: Specify your own unique Application ID.*\r?\n/gm, ''],
    [/^[ \t]*\/\/ TODO: Add your own signing config.*\r?\n/gm, '']
]);

replaceInFile('flutter/admin/android/app/build.gradle.kts', [
    [/^[ \t]*\/\/ TODO: Specify your own unique Application ID.*\r?\n/gm, ''],
    [/^[ \t]*\/\/ TODO: Add your own signing config.*\r?\n/gm, '']
]);

console.log("Cleanup script completed!");
