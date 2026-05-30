const XLSX = require('/tmp/badm-parse/node_modules/xlsx');
const wb = XLSX.readFile('data/joueurs_49232.xlsx');
const sn = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
console.log("Header row:", rows[2].slice(0, 22));
console.log("Data row 1:", rows[3].slice(0, 22));
