const fs = require('fs');
const content = fs.readFileSync('app/admin/page.tsx', 'utf8');

const regexes = [
  /setUserForm\(\(prev: any\)/,
  /setWorkspaceForm\(\(prev: any\)/,
  /setKvForm\(\(prev: any\)/,
  /setPlanForm\(\(prev: any\)/
];

let hasError = false;
regexes.forEach(regex => {
  if (regex.test(content)) {
    console.log("Found match for", regex);
    hasError = true;
  }
});

if (!hasError) {
  console.log("No explicit '(prev: any)' found. Code is clean.");
}
