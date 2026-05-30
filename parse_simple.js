const XLSX = require('/tmp/badm-parse/node_modules/xlsx');
const wb = XLSX.readFile('data/joueurs_49232.xlsx');
const sn = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });

let headerIndex = -1;
let colMap = { simple: -1 };
for (let i = 0; i < Math.min(rows.length, 20); i++) {
  const row = rows[i];
  if (!row || row.length === 0) continue;
  const strRow = row.map(cell => String(cell).toLowerCase().trim());
  
  const simpleIdx = strRow.findIndex(c => c === 'simple' || c === 'tableau');
  if (simpleIdx !== -1) {
    headerIndex = i;
    colMap.simple = simpleIdx;
    break;
  }
}

const categories = new Set();
for (let i = headerIndex + 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length === 0) continue;
  const val = String(row[colMap.simple] || '').trim();
  if (val) categories.add(val);
}
console.log("Categories found:", Array.from(categories));
