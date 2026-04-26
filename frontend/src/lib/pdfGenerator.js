/**
 * PDF-Leihschein-Generator v3
 * Professioneller, übersichtlicher Leihschein — helles Print-Layout
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const C = {
  primary: [37, 99, 235],       // Blue-600
  primaryLight: [219, 234, 254], // Blue-100
  dark: [15, 23, 42],           // Slate-900
  text: [51, 65, 85],           // Slate-600
  muted: [148, 163, 184],       // Slate-400
  border: [226, 232, 240],      // Slate-200
  bgLight: [248, 250, 252],     // Slate-50
  white: [255, 255, 255],
  green: [22, 163, 74],         // Green-600
  red: [220, 38, 38],           // Red-600
  amber: [217, 119, 6],         // Amber-600
};

function drawLine(doc, x1, y1, x2, y2, color = C.border, width = 0.4) {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(x1, y1, x2, y2);
}

function drawRect(doc, x, y, w, h, fillColor, radius = 0) {
  doc.setFillColor(...fillColor);
  if (radius > 0) {
    doc.roundedRect(x, y, w, h, radius, radius, 'F');
  } else {
    doc.rect(x, y, w, h, 'F');
  }
}

function drawBorderedRect(doc, x, y, w, h, fillColor, borderColor, radius = 2) {
  doc.setFillColor(...fillColor);
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, radius, radius, 'FD');
}

export function generateLeihscheinPdf(ausleihe) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 18; // margin
  const cw = pw - m * 2; // content width

  // ═══ Header ═══════════════════════════════════════════════════
  // Blauer Akzentstreifen oben
  drawRect(doc, 0, 0, pw, 4, C.primary);

  let y = 16;

  // Logo-Bereich links
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text('LEIHSCHEIN', m, y + 6);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  doc.text('Stagedesk Inventar-Management', m, y + 13);

  // Nummer + Titel rechts
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  doc.text(`Nr. ${ausleihe.id}`, pw - m, y + 2, { align: 'right' });

  const titel = ausleihe.titel || '';
  if (titel) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.dark);
    doc.text(titel, pw - m, y + 9, { align: 'right', maxWidth: cw / 2 });
  }

  // Datum rechts
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  const erstelltDatum = new Date(ausleihe.erstellt_am).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(erstelltDatum, pw - m, y + 15, { align: 'right' });

  y += 22;
  drawLine(doc, m, y, pw - m, y, C.border, 0.6);
  y += 8;

  // ═══ Info-Bereich ═════════════════════════════════════════════
  const colW = (cw - 8) / 3;

  // --- Spalte 1: Ausleiher ---
  const col1x = m;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.muted);
  doc.text('AUSLEIHER', col1x, y);
  y += 5;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text(ausleihe.ausleiher_name || '–', col1x, y, { maxWidth: colW - 4 });

  if (ausleihe.ausleiher_ort) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text);
    doc.text(ausleihe.ausleiher_ort, col1x, y + 6, { maxWidth: colW - 4 });
  }

  // --- Spalte 2: Details ---
  const col2x = m + colW + 4;
  let dy = y - 5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.muted);
  doc.text('DETAILS', col2x, dy);
  dy += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text);

  const details = [];
  if (ausleihe.zweck) details.push({ label: 'Zweck', value: ausleihe.zweck });
  if (ausleihe.frist) details.push({ label: 'Rückgabefrist', value: new Date(ausleihe.frist).toLocaleDateString('de-DE') });
  details.push({ label: 'Status', value: ausleihe.status_display || ausleihe.status });

  for (const d of details) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(`${d.label}:`, col2x, dy);
    doc.setFont('helvetica', 'normal');
    doc.text(` ${d.value}`, col2x + doc.getTextWidth(`${d.label}: `), dy);
    dy += 5;
  }

  // --- Spalte 3: Typ-Info ---
  const col3x = m + (colW + 4) * 2;
  let dy3 = y - 5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.muted);
  doc.text('TYP', col3x, dy3);
  dy3 += 5;

  // Modus-Badge
  const modusText = ausleihe.modus === 'global' ? 'Globale Ausleihe' : 'Individuelle Ausleihe';
  const badgeW = doc.getTextWidth(modusText) + 8;
  drawRect(doc, col3x, dy3 - 3.5, badgeW, 6, C.primaryLight, 1.5);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  doc.text(modusText, col3x + 4, dy3 + 0.5);

  dy3 += 10;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text);
  doc.text(`${(ausleihe.positionen || []).length} Artikel`, col3x, dy3);

  y = Math.max(y + 16, dy + 4, dy3 + 4);
  y += 4;
  drawLine(doc, m, y, pw - m, y);
  y += 8;

  // ═══ Artikeltabelle ═══════════════════════════════════════════
  const positions = ausleihe.positionen || [];
  const isIndividuell = ausleihe.modus === 'individuell';

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text('Ausgeliehene Artikel', m, y);
  y += 5;

  const headCols = ['Nr.', 'Artikel'];
  if (isIndividuell) headCols.push('Ausleiher', 'Ort');
  headCols.push('Menge', 'Zustand', 'Zurückgegeben');

  const tableData = positions.map((pos, i) => {
    const row = [
      String(i + 1),
      pos.item_name,
    ];
    if (isIndividuell) {
      row.push(pos.ausleiher_name || '–');
      row.push(pos.ausleiher_ort || '–');
    }
    row.push(
      String(pos.anzahl || 1),
      pos.zustand_ausleihe === 'ok' ? 'OK' : (pos.zustand_ausleihe || '–'),
      pos.ist_zurueckgegeben ? 'Ja' : 'Nein'
    );
    return row;
  });

  // Spaltenbreiten
  const colStyles = {
    0: { cellWidth: 12, halign: 'center' },
  };
  if (isIndividuell) {
    colStyles[4] = { cellWidth: 16, halign: 'center' };
    colStyles[5] = { cellWidth: 20, halign: 'center' };
    colStyles[6] = { cellWidth: 26, halign: 'center' };
  } else {
    colStyles[2] = { cellWidth: 16, halign: 'center' };
    colStyles[3] = { cellWidth: 20, halign: 'center' };
    colStyles[4] = { cellWidth: 26, halign: 'center' };
  }

  autoTable(doc, {
    startY: y,
    head: [headCols],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: C.dark,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: C.text,
      cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
    },
    alternateRowStyles: {
      fillColor: C.bgLight,
    },
    styles: {
      lineColor: C.border,
      lineWidth: 0.3,
      overflow: 'linebreak',
    },
    columnStyles: colStyles,
    margin: { left: m, right: m },
    didParseCell: (data) => {
      // "Zurückgegeben" Spalte: Ja=grün, Nein=rot
      const zurueckIdx = isIndividuell ? 6 : 4;
      if (data.section === 'body' && data.column.index === zurueckIdx) {
        if (data.cell.raw === 'Ja') {
          data.cell.styles.textColor = C.green;
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'Nein') {
          data.cell.styles.textColor = C.red;
        }
      }
    },
  });

  y = doc.lastAutoTable.finalY + 8;

  // ═══ Per-Item Signaturen ════════════════════════════════════════
  const itemsWithSig = positions.filter(p => p.unterschrift && p.unterschrift.startsWith('data:image'));
  if (itemsWithSig.length > 0) {
    if (y > 220) { doc.addPage(); drawRect(doc, 0, 0, pw, 4, C.primary); y = 20; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text('Artikel-Signaturen', m, y);
    y += 6;

    const sigColW = (cw - 8) / 2;
    const sigItemH = 28;
    let col = 0;

    for (const pos of itemsWithSig) {
      if (y + sigItemH + 8 > ph - 20) {
        doc.addPage(); drawRect(doc, 0, 0, pw, 4, C.primary); y = 20;
      }

      const sx = m + col * (sigColW + 8);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.text);
      doc.text(pos.item_name, sx, y);
      if (pos.ausleiher_name) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.muted);
        doc.text(` – ${pos.ausleiher_name}`, sx + doc.getTextWidth(pos.item_name + ' '), y);
      }

      try {
        drawBorderedRect(doc, sx, y + 2, sigColW, sigItemH, C.white, C.border);
        doc.addImage(pos.unterschrift, 'PNG', sx + 2, y + 3, sigColW - 4, sigItemH - 2);
      } catch {
        drawBorderedRect(doc, sx, y + 2, sigColW, sigItemH, C.white, C.border);
      }

      col++;
      if (col >= 2) {
        col = 0;
        y += sigItemH + 10;
      }
    }

    if (col !== 0) y += sigItemH + 10;
    y += 4;
  }

  // ═══ Zusammenfassung ══════════════════════════════════════════
  const totalItems = positions.length;
  const returnedItems = positions.filter(p => p.ist_zurueckgegeben).length;
  const openItems = totalItems - returnedItems;

  drawBorderedRect(doc, m, y, cw, 14, C.bgLight, C.border);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text);

  const summaryY = y + 5;
  doc.text(`Gesamt: ${totalItems} Artikel`, m + 6, summaryY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.green);
  doc.text(`Zurückgegeben: ${returnedItems}`, m + 60, summaryY);

  if (openItems > 0) {
    doc.setTextColor(...C.red);
    doc.text(`Offen: ${openItems}`, m + 120, summaryY);
  } else {
    doc.setTextColor(...C.green);
    doc.text('Alle zurückgegeben', m + 120, summaryY);
  }

  y += 20;

  // ═══ Notizen ══════════════════════════════════════════════════
  if (ausleihe.notizen) {
    if (y > 240) { doc.addPage(); drawRect(doc, 0, 0, pw, 4, C.primary); y = 20; }

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.muted);
    doc.text('NOTIZEN', m, y);
    y += 5;

    drawBorderedRect(doc, m, y, cw, 16, C.bgLight, C.border);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text);
    doc.text(ausleihe.notizen, m + 4, y + 5, { maxWidth: cw - 8 });
    y += 22;
  }

  // ═══ Unterschriften ═══════════════════════════════════════════
  if (y > 215) { doc.addPage(); drawRect(doc, 0, 0, pw, 4, C.primary); y = 20; }

  // Sicherstellen, dass Unterschriften weit genug unten sind
  y = Math.max(y, 200);

  const sigW = (cw - 16) / 2;
  const sigH = 32;

  // --- Ausleihe-Unterschrift ---
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.muted);
  doc.text('UNTERSCHRIFT AUSLEIHE', m, y);
  y += 3;

  if (ausleihe.unterschrift_ausleihe && ausleihe.unterschrift_ausleihe.startsWith('data:image')) {
    try {
      drawBorderedRect(doc, m, y, sigW, sigH, C.white, C.border);
      doc.addImage(ausleihe.unterschrift_ausleihe, 'PNG', m + 4, y + 2, sigW - 8, sigH - 4);
    } catch {
      drawBorderedRect(doc, m, y, sigW, sigH, C.white, C.border);
      drawLine(doc, m + 8, y + sigH - 8, m + sigW - 8, y + sigH - 8, C.muted, 0.3);
    }
  } else {
    drawBorderedRect(doc, m, y, sigW, sigH, C.white, C.border);
    drawLine(doc, m + 8, y + sigH - 8, m + sigW - 8, y + sigH - 8, C.muted, 0.3);
  }

  // Datum + Name unter Ausleihe-Unterschrift
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  doc.text('Datum, Unterschrift', m + 4, y + sigH + 5);

  // --- Rückgabe-Unterschrift ---
  const sigRx = m + sigW + 16;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.muted);
  doc.text('UNTERSCHRIFT RÜCKGABE', sigRx, y - 3);

  if (ausleihe.unterschrift_rueckgabe && ausleihe.unterschrift_rueckgabe.startsWith('data:image')) {
    try {
      drawBorderedRect(doc, sigRx, y, sigW, sigH, C.white, C.border);
      doc.addImage(ausleihe.unterschrift_rueckgabe, 'PNG', sigRx + 4, y + 2, sigW - 8, sigH - 4);
    } catch {
      drawBorderedRect(doc, sigRx, y, sigW, sigH, C.white, C.border);
      drawLine(doc, sigRx + 8, y + sigH - 8, sigRx + sigW - 8, y + sigH - 8, C.muted, 0.3);
    }
  } else {
    drawBorderedRect(doc, sigRx, y, sigW, sigH, C.white, C.border);
    drawLine(doc, sigRx + 8, y + sigH - 8, sigRx + sigW - 8, y + sigH - 8, C.muted, 0.3);
  }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  doc.text('Datum, Unterschrift', sigRx + 4, y + sigH + 5);

  // ═══ Footer ═══════════════════════════════════════════════════
  const footerY = ph - 12;
  drawLine(doc, m, footerY - 3, pw - m, footerY - 3, C.border, 0.3);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  doc.text(
    `Generiert am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')}`,
    m, footerY + 1
  );
  doc.text('Stagedesk Inventar-Management', pw - m, footerY + 1, { align: 'right' });

  return doc;
}

/**
 * Gruppierte PDFs fuer individuelle Ausleihen
 * groupBy: 'person' (nach ausleiher_name) oder 'ort' (nach ausleiher_ort)
 * Erzeugt ein Dokument mit separaten Seiten pro Gruppe
 */
export function generateGroupedLeihscheinPdf(ausleihe, groupBy = 'person') {
  const positions = ausleihe.positionen || [];
  if (positions.length === 0) return generateLeihscheinPdf(ausleihe);

  const groupKey = groupBy === 'ort' ? 'ausleiher_ort' : 'ausleiher_name';
  const groupLabel = groupBy === 'ort' ? 'ORT' : 'AUSLEIHER';

  // Positionen gruppieren
  const groups = {};
  for (const pos of positions) {
    const key = pos[groupKey] || 'Unbekannt';
    if (!groups[key]) groups[key] = [];
    groups[key].push(pos);
  }

  const sortedKeys = Object.keys(groups).sort();
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 18;
  const cw = pw - m * 2;
  let firstPage = true;

  for (const groupName of sortedKeys) {
    const groupPositions = groups[groupName];
    if (!firstPage) doc.addPage();
    firstPage = false;

    // Header
    drawRect(doc, 0, 0, pw, 4, C.primary);
    let y = 16;

    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text('LEIHSCHEIN', m, y + 6);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text('Stagedesk Inventar-Management', m, y + 13);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(`Nr. ${ausleihe.id}`, pw - m, y + 2, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(new Date(ausleihe.erstellt_am).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }), pw - m, y + 9, { align: 'right' });

    y += 22;
    drawLine(doc, m, y, pw - m, y, C.border, 0.6);
    y += 8;

    // Gruppen-Info
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.muted);
    doc.text(groupLabel, m, y);
    y += 5;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text(groupName, m, y);
    y += 4;

    // Zweitinfo
    const colX = m + cw / 2;
    let iy = y - 9;
    if (ausleihe.zweck) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.text);
      doc.text(`Zweck: ${ausleihe.zweck}`, colX, iy + 5);
      iy += 5;
    }
    if (ausleihe.frist) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.text);
      doc.text(`Frist: ${new Date(ausleihe.frist).toLocaleDateString('de-DE')}`, colX, iy + 5);
    }

    y += 6;
    drawLine(doc, m, y, pw - m, y);
    y += 8;

    // Artikeltabelle fuer diese Gruppe
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text(`Artikel (${groupPositions.length})`, m, y);
    y += 5;

    const headCols = ['Nr.', 'Artikel'];
    if (groupBy === 'person') headCols.push('Ort');
    if (groupBy === 'ort') headCols.push('Ausleiher');
    headCols.push('Menge', 'Zustand', 'Zurückgegeben');

    const tableData = groupPositions.map((pos, i) => {
      const row = [String(i + 1), pos.item_name];
      if (groupBy === 'person') row.push(pos.ausleiher_ort || '–');
      if (groupBy === 'ort') row.push(pos.ausleiher_name || '–');
      row.push(
        String(pos.anzahl || 1),
        pos.zustand_ausleihe === 'ok' ? 'OK' : (pos.zustand_ausleihe || '–'),
        pos.ist_zurueckgegeben ? 'Ja' : 'Nein'
      );
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: [headCols],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: C.dark, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
      bodyStyles: { fontSize: 8, textColor: C.text, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      alternateRowStyles: { fillColor: C.bgLight },
      styles: { lineColor: C.border, lineWidth: 0.3, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 12, halign: 'center' } },
      margin: { left: m, right: m },
      didParseCell: (data) => {
        const zurueckIdx = headCols.length - 1;
        if (data.section === 'body' && data.column.index === zurueckIdx) {
          if (data.cell.raw === 'Ja') { data.cell.styles.textColor = C.green; data.cell.styles.fontStyle = 'bold'; }
          else if (data.cell.raw === 'Nein') { data.cell.styles.textColor = C.red; }
        }
      },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Per-Item Signaturen fuer diese Gruppe
    const sigItems = groupPositions.filter(p => p.unterschrift && p.unterschrift.startsWith('data:image'));
    if (sigItems.length > 0) {
      if (y > 220) { doc.addPage(); drawRect(doc, 0, 0, pw, 4, C.primary); y = 20; }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.dark);
      doc.text('Signaturen', m, y);
      y += 6;

      const sigColW = (cw - 8) / 2;
      const sigItemH = 28;
      let col = 0;

      for (const pos of sigItems) {
        if (y + sigItemH + 8 > ph - 40) { doc.addPage(); drawRect(doc, 0, 0, pw, 4, C.primary); y = 20; }
        const sx = m + col * (sigColW + 8);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.text);
        doc.text(pos.item_name, sx, y);
        try {
          drawBorderedRect(doc, sx, y + 2, sigColW, sigItemH, C.white, C.border);
          doc.addImage(pos.unterschrift, 'PNG', sx + 2, y + 3, sigColW - 4, sigItemH - 2);
        } catch {
          drawBorderedRect(doc, sx, y + 2, sigColW, sigItemH, C.white, C.border);
        }
        col++;
        if (col >= 2) { col = 0; y += sigItemH + 10; }
      }
      if (col !== 0) y += sigItemH + 10;
    }

    // Unterschriftsfeld
    y = Math.max(y, ph - 60);
    const sigW = (cw - 16) / 2;
    const sigH = 28;

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.muted);
    doc.text('UNTERSCHRIFT AUSLEIHE', m, y);
    doc.text('UNTERSCHRIFT RÜCKGABE', m + sigW + 16, y);
    y += 3;

    drawBorderedRect(doc, m, y, sigW, sigH, C.white, C.border);
    drawLine(doc, m + 8, y + sigH - 8, m + sigW - 8, y + sigH - 8, C.muted, 0.3);

    const sigRx = m + sigW + 16;
    drawBorderedRect(doc, sigRx, y, sigW, sigH, C.white, C.border);
    drawLine(doc, sigRx + 8, y + sigH - 8, sigRx + sigW - 8, y + sigH - 8, C.muted, 0.3);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text('Datum, Unterschrift', m + 4, y + sigH + 5);
    doc.text('Datum, Unterschrift', sigRx + 4, y + sigH + 5);

    // Footer
    const footerY = ph - 12;
    drawLine(doc, m, footerY - 3, pw - m, footerY - 3, C.border, 0.3);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(`Generiert am ${new Date().toLocaleDateString('de-DE')} – Seite ${groupName}`, m, footerY + 1);
    doc.text('Stagedesk Inventar-Management', pw - m, footerY + 1, { align: 'right' });
  }

  return doc;
}

export function downloadLeihschein(ausleihe, groupBy = null) {
  const doc = groupBy ? generateGroupedLeihscheinPdf(ausleihe, groupBy) : generateLeihscheinPdf(ausleihe);
  const suffix = groupBy ? `_pro_${groupBy === 'ort' ? 'Ort' : 'Person'}` : '';
  const name = ausleihe.titel ? `Leihschein_${ausleihe.titel.replace(/\s+/g, '_')}${suffix}` : `Leihschein_${ausleihe.id}${suffix}`;
  doc.save(`${name}.pdf`);
}

export function printLeihschein(ausleihe) {
  const doc = generateLeihscheinPdf(ausleihe);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url);
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print();
      URL.revokeObjectURL(url);
    };
  }
}
