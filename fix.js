import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/\\`\\\$\\{value}\\`/g, '`$${value}`');
code = code.replace(/\\`\\\$\\{value.toFixed\\(2\\)}\\`/g, '`$${value.toFixed(2)}`');
code = code.replace(/\\`\\$\\{percentage\\}%\\`/g, '`${percentage}%`');
fs.writeFileSync('src/App.tsx', code);
