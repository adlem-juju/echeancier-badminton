/**
 * import.js — Excel/CSV file parsing and data extraction
 */

import { DEFAULT_POINTS, showToast } from '../utils.js';
import { setState, getState } from '../store.js';
import { processPlayers } from './partitioner.js';

/**
 * Initialize the drag-and-drop zone and file input
 */
export function initImport() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });
}

/**
 * Handle a dropped/selected file
 */
function handleFile(file) {
    const validExts = ['.xlsx', '.xls', '.csv'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExts.includes(ext)) {
        showToast('Format non supporté. Utilisez .xlsx, .xls ou .csv', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            // Using header: 1 to get Array of Arrays so we can detect the real header row
            const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            if (rawRows.length === 0) {
                showToast('Le fichier est vide.', 'error');
                return;
            }

            const players = parsePlayersFromArray(rawRows);

            if (players.length === 0) {
                showToast('Aucun joueur reconnu. Vérifiez les colonnes (Nom, Sexe, Points/CPPH).', 'error');
                return;
            }

            // Group players by category
            const categories = {};

            players.forEach(p => {
                if (!categories[p.category]) {
                    categories[p.category] = { players: [] };
                }
                categories[p.category].players.push(p);
            });

            // Sort & Partition each category
            Object.keys(categories).forEach(catName => {
                const cat = categories[catName];
                cat.players.sort((a, b) => b.points - a.points);
                cat.players.forEach((p, idx) => p.rank = idx + 1); // update local rank within category

                // Pass the grouped array to the partitioner
                // Note: partitioner.js needs to return just { series, excluded } since we don't need SH/SD anymore
                cat.partition = processPlayers(cat.players);
            });

            setState({
                playersRaw: rawRows,
                players: players,
                categories: categories
            });

            // Show file info
            document.getElementById('file-info').classList.remove('hidden');
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('file-stats').textContent =
                `${players.length} joueur(s) importé(s) répartis dans ${Object.keys(categories).length} tableau(x).`;

            showToast(`${players.length} joueurs importés avec succès !`, 'success');
        } catch (err) {
            console.error('File parsing error:', err);
            showToast('Erreur de lecture du fichier.', 'error');
        }
    };

    reader.readAsArrayBuffer(file);
}

/**
 * Parse raw Array of Arrays into structured players
 * Scans rows to find the primary Header row, then maps the columns.
 */
function parsePlayersFromArray(rows) {
    let headerIndex = -1;
    let colMap = { name: -1, sex: -1, points: -1, category: -1 };

    // 1. Find the header row
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const strRow = row.map(cell => String(cell).toLowerCase().trim());

        const nameIdx = strRow.findIndex(c => ['nom', 'name', 'joueur'].includes(c));
        const sexIdx = strRow.findIndex(c => ['sexe', 'sex', 'genre', 'm/f'].includes(c));

        // Look for points, CPPH, or specifically "points simple" / "clt simple" / "rang simple"
        let pointsIdx = strRow.findIndex(c =>
            ['points', 'cpph', 'classement', 'score', 'points simple'].includes(c)
        );

        // Look for the Tableau/Category column (e.g. "Simple")
        let categoryIdx = strRow.findIndex(c =>
            ['simple', 'simpe', 'tableau', 'série', 'serie'].includes(c)
        );

        // Look for Sigle (club/dept) and Date (registration)
        let sigleIdx = strRow.findIndex(c => c.includes('sigle') || c.includes('club'));
        let dateIdx = strRow.findIndex(c => c.includes('date'));

        // If we confidently find Name and Sex on this row, it's our header
        if (nameIdx !== -1 && sexIdx !== -1) {
            headerIndex = i;
            colMap.name = nameIdx;
            colMap.sex = sexIdx;
            colMap.points = pointsIdx;

            // Secondary pass: if categoryIdx was not found, try finding a column that starts with "simp" or "tabl" 
            // but is not the points column!
            if (categoryIdx === -1) {
                categoryIdx = strRow.findIndex((c, idx) =>
                    idx !== pointsIdx && (c.includes('simp') || c.includes('tabl'))
                );
            }
            colMap.category = categoryIdx;
            colMap.sigle = sigleIdx;
            colMap.date = dateIdx;
            break;
        }
    }

    if (headerIndex === -1) {
        return [];
    }

    // 2. Parse players from the rows below the header
    const players = [];

    for (let i = headerIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Check Name if it has something
        const nameStr = String(row[colMap.name] || '').trim();
        if (!nameStr) continue;

        // Optional: concat with first name if provided in the adjacent column (often Prénom is nameIdx+1)
        // We try to grab Prénom safely if it looks like one.
        let fullName = nameStr;
        const nextCol = String(row[colMap.name + 1] || '').trim();
        if (nextCol && rows[headerIndex][colMap.name + 1] && String(rows[headerIndex][colMap.name + 1]).toLowerCase().includes('prénom')) {
            fullName = nameStr + ' ' + nextCol;
        }

        let sex = String(row[colMap.sex] || '').trim().toUpperCase();
        if (sex === 'H' || sex === 'M' || sex === 'HOMME' || sex === 'MALE') sex = 'M';
        else if (sex === 'F' || sex === 'D' || sex === 'FEMME' || sex === 'FEMALE' || sex === 'DAME') sex = 'F';
        else continue; // Skip unidentifiable sex or invalid row

        let points = colMap.points !== -1 ? parseFloat(String(row[colMap.points]).replace(',', '.')) : NaN;
        let isDefault = false;

        // Check if points are invalid or zero
        if (isNaN(points) || points <= 0 || String(row[colMap.points]).trim() === '') {
            points = DEFAULT_POINTS;
            isDefault = true;
        }

        // Extract category if available, otherwise default to "Non classé" or their Sex
        let category = colMap.category !== -1 ? String(row[colMap.category]).trim() : '';
        if (!category) {
            category = sex === 'M' ? 'SH' : 'SD';
        }

        // Remove weird line breaks from category if present
        category = category.replace(/[\r\n]+/g, '').trim();

        // Sigle
        let sigle = colMap.sigle !== -1 ? String(row[colMap.sigle]).trim() : '';

        // Date (DD/MM/YYYY HH:MM:SS)
        let dateAdded = 0;
        if (colMap.date !== -1 && row[colMap.date]) {
            const dStr = String(row[colMap.date]).trim();
            // Try Excel serial date
            if (!isNaN(Number(dStr))) {
                // Excel dates usually count days from 1900-01-01
                dateAdded = new Date(Math.round((Number(dStr) - 25569) * 86400 * 1000)).getTime();
            } else {
                const match = dStr.match(/(\d+)\/(\d+)\/(\d+)(?:\s+(\d+):(\d+):(\d+))?/);
                if (match) {
                    const d = Number(match[1]), M = Number(match[2]), y = Number(match[3]);
                    const h = match[4] ? Number(match[4]) : 0;
                    const m = match[5] ? Number(match[5]) : 0;
                    const s = match[6] ? Number(match[6]) : 0;
                    dateAdded = new Date(y, M - 1, d, h, m, s).getTime();
                }
            }
        }

        players.push({
            name: fullName,
            sex,
            points,
            isDefault,
            rank: 0,
            category,
            sigle,
            dateAdded
        });
    }

    return players;
}
