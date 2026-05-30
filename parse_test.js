const XLSX = require('/tmp/badm-parse/node_modules/xlsx');
const wb = XLSX.readFile('data/joueurs_49232.xlsx');
const sn = wb.SheetNames[0];
const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });

// copy-paste parsePlayersFromArray logic exactly
function parsePlayersFromArray(rows) {
  let headerIndex = -1;
  let colMap = { name: -1, sex: -1, points: -1 };

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const strRow = row.map(cell => String(cell).toLowerCase().trim());
    const nameIdx = strRow.findIndex(c => ['nom', 'name', 'joueur'].includes(c));
    const sexIdx = strRow.findIndex(c => ['sexe', 'sex', 'genre', 'm/f'].includes(c));
    let pointsIdx = strRow.findIndex(c => 
      ['points', 'cpph', 'classement', 'score', 'points simple'].includes(c)
    );
    if (nameIdx !== -1 && sexIdx !== -1) {
      headerIndex = i;
      colMap.name = nameIdx;
      colMap.sex = sexIdx;
      colMap.points = pointsIdx;
      break;
    }
  }

  if (headerIndex === -1) return [];

  const players = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const nameStr = String(row[colMap.name] || '').trim();
    if (!nameStr) continue;

    let fullName = nameStr;
    const nextCol = String(row[colMap.name + 1] || '').trim();
    if (nextCol && rows[headerIndex][colMap.name + 1] && String(rows[headerIndex][colMap.name + 1]).toLowerCase().includes('prénom')) {
      fullName = nameStr + ' ' + nextCol;
    }

    let sex = String(row[colMap.sex] || '').trim().toUpperCase();
    if (sex === 'H' || sex === 'M' || sex === 'HOMME' || sex === 'MALE') sex = 'M';
    else if (sex === 'F' || sex === 'D' || sex === 'FEMME' || sex === 'FEMALE' || sex === 'DAME') sex = 'F';
    else continue;

    let points = colMap.points !== -1 ? parseFloat(String(row[colMap.points]).replace(',', '.')) : NaN;
    let isDefault = false;
    if (isNaN(points) || points <= 0 || String(row[colMap.points]).trim() === '') {
      points = 400; // default
      isDefault = true;
    }

    players.push({ name: fullName, sex, points, isDefault, rank: 0 });
  }
  return players;
}

const players = parsePlayersFromArray(rawRows);
console.log("Total players found:", players.length);
console.log("SH:", players.filter(p => p.sex === 'M').length, "SD:", players.filter(p => p.sex === 'F').length);
console.log("First 3 SH:", players.filter(p => p.sex === 'M').slice(0, 3));
console.log("First 3 SD:", players.filter(p => p.sex === 'F').slice(0, 3));
