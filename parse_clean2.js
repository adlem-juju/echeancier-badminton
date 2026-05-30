const XLSX = require('/tmp/badm-parse/node_modules/xlsx');
const wb = XLSX.readFile('data/joueurs_49232.xlsx');
const sn = wb.SheetNames[0];
// Use header: 1 to get Array of Arrays
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
console.log("Row 1:", rows[0].slice(0, 5));
console.log("Row 2:", rows[1].slice(0, 5));
console.log("Row 3:", rows[2].slice(0, 5));
