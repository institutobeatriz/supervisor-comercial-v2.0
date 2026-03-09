import fs from 'fs';

const path = 'packages/db/dist/queries.js';
let content = fs.readFileSync(path, 'utf8');

// Remove problematic contatados function
const startMarker = '// ============================================================\n// CONTATADOS';
const startIdx = content.indexOf(startMarker);
if (startIdx > 0) {
  content = content.substring(0, startIdx);
}

// Remove any exports.getContatados line
content = content.replace(/exports\.getContatados\s*=\s*getContatados;?\s*$/gm, '');
content = content.replace(/exports\.getContatados\s*=\s*exports\.getContatados;?\s*$/gm, '');

fs.writeFileSync(path, content, 'utf8');
console.log('✅ queries.js corrigido');
