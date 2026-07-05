/**
 * export.js — Excel export using SheetJS
 */

/**
 * Export schedule, series, and players to an Excel workbook
 */
export function exportToExcel(schedule, categories, allPlayers, params) {
    const wb = XLSX.utils.book_new();

    // ── Onglet 1: Échéancier ──
    addScheduleSheet(wb, schedule, params);

    // ── Onglet 2: Séries & Groupes ──
    addSeriesSheet(wb, categories);

    // ── Onglet 3: Registre Joueurs ──
    addPlayersSheet(wb, categories, allPlayers);

    // Download
    XLSX.writeFile(wb, 'echeancier_badminton.xlsx');
}

function addScheduleSheet(wb, schedule, params) {
    const rows = [];

    // Header row
    const header = ['Rotation', 'Horaire'];
    for (let c = 1; c <= params.courts; c++) {
        header.push(`Terrain ${c}`);
    }
    rows.push(header);

    // Data rows
    schedule.rotations.forEach((rot, idx) => {
        const row = [`R${idx + 1}`, `${rot.timeStart} - ${rot.timeEnd}`];
        for (let c = 0; c < params.courts; c++) {
            const slot = rot.slots[c];
            if (slot) {
                const phase = slot.phase === 'finale' ? ' [FINALE]' :
                    slot.phase === 'demi' ? ' [DEMI]' : '';
                row.push(`${slot.seriesLabel}\n${slot.label}${phase}`);
            } else {
                row.push('');
            }
        }
        rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    ws['!cols'] = [
        { wch: 10 }, { wch: 16 },
        ...Array(params.courts).fill({ wch: 30 }),
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Échéancier');
}

function addSeriesSheet(wb, categories) {
    const rows = [['Tableau', 'Série', 'Format', 'Nb Joueurs', 'Rangs', 'Joueurs']];

    Object.keys(categories).sort().forEach(catName => {
        const cat = categories[catName];
        if (!cat.partition) return;

        cat.partition.series.forEach(s => {
            rows.push([
                catName,
                s.label,
                s.type,
                s.size,
                `${s.rankStart} à ${s.rankEnd}`,
                s.players.map(p => p.name).join(', '),
            ]);
        });

        if (cat.partition.excluded && cat.partition.excluded.length > 0) {
            rows.push([
                catName,
                'Exclus',
                '—',
                cat.partition.excluded.length,
                '—',
                cat.partition.excluded.map(p => p.name).join(', ')
            ]);
        }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Séries & Groupes');
}

function addPlayersSheet(wb, categories, allPlayers) {
    const rows = [['Rang', 'Nom', 'Tableau', 'Sexe', 'Points', 'Points estimés']];

    // Group players by category for the export
    Object.keys(categories).sort().forEach(catName => {
        const players = categories[catName].players || [];
        rows.push(['', `── ${catName} ──`, '', '', '', '']);

        let rank = 1;
        players.forEach(p => {
            rows.push([
                rank++,
                p.name,
                p.category,
                p.sex,
                p.points,
                p.isDefault ? 'Oui (400 par défaut)' : 'Non'
            ]);
        });
        rows.push(['', '', '', '', '', '']); // spacer
    });

    // If there were players without categories, they'll be missed, but they shouldn't exist anymore due to our default logic.

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 15 }, { wch: 6 }, { wch: 8 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Registre Joueurs');
}
