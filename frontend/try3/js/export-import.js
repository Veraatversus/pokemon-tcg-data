/**
 * Export/Import Module
 * Handles CSV and JSON export/import of collection data
 */

class ExportImport {
  constructor() {
    this.defaultColumns = [
      'number',
      'name',
      'set',
      'rarity',
      'collected',
      'reverseHolo',
      'cardmarketLink',
      'imageUrl'
    ];
  }

  /**
   * Export cards to CSV
   */
  exportToCSV(cards, setName = 'collection', columns = this.defaultColumns) {
    if (!cards || cards.length === 0) {
      throw new Error('Keine Karten zum Exportieren');
    }

    // Build CSV header
    const header = columns.join(',');

    // Build CSV rows
    const rows = cards.map(card => {
      return columns.map(col => {
        let value = card[col] || '';
        
        // Handle boolean values
        if (typeof value === 'boolean') {
          value = value ? 'JA' : 'NEIN';
        }
        
        // Escape quotes and wrap in quotes if contains comma
        value = String(value);
        if (value.includes(',') || value.includes('"')) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        
        return value;
      }).join(',');
    });

    // Combine header and rows
    const csv = [header, ...rows].join('\n');

    // Add BOM for Excel UTF-8 support
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csv;

    // Create blob and download
    this.downloadFile(csvWithBOM, `${setName}-export.csv`, 'text/csv;charset=utf-8;');
  }

  /**
   * Export cards to JSON
   */
  exportToJSON(cards, setName = 'collection', metadata = {}) {
    if (!cards || cards.length === 0) {
      throw new Error('Keine Karten zum Exportieren');
    }

    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalCards: cards.length,
        setName: setName,
        ...metadata
      },
      cards: cards,
      statistics: this.generateStatistics(cards)
    };

    const json = JSON.stringify(exportData, null, 2);
    this.downloadFile(json, `${setName}-export.json`, 'application/json;charset=utf-8;');
  }

  /**
   * Import cards from CSV
   */
  async importFromCSV(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const csv = e.target.result;
          
          // Remove BOM if present
          const cleanCSV = csv.replace(/^\uFEFF/, '');
          
          // Split lines and parse
          const lines = cleanCSV.split('\n').filter(line => line.trim());
          if (lines.length < 2) {
            throw new Error('CSV-Datei ist leer oder ungültig');
          }

          // Parse header
          const headers = this.parseCSVLine(lines[0]);
          
          // Parse rows
          const cards = [];
          for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length > 0) {
              const card = {};
              headers.forEach((header, idx) => {
                let value = values[idx] || '';
                
                // Convert boolean strings
                if (value.toLowerCase() === 'ja') {
                  value = true;
                } else if (value.toLowerCase() === 'nein') {
                  value = false;
                }
                
                card[header] = value;
              });
              cards.push(card);
            }
          }

          resolve(cards);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei'));
      reader.readAsText(file, 'utf-8');
    });
  }

  /**
   * Import cards from JSON
   */
  async importFromJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          
          if (!json.cards || !Array.isArray(json.cards)) {
            throw new Error('JSON-Format ungültig: "cards" Array nicht gefunden');
          }

          resolve({
            cards: json.cards,
            metadata: json.metadata || {},
            statistics: json.statistics || {}
          });
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei'));
      reader.readAsText(file, 'utf-8');
    });
  }

  /**
   * Parse CSV line handling quotes
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Export to Excel format (XLSX)
   * Note: Requires xlsx library - simplified version returns CSV
   */
  exportToExcel(cards, setName = 'collection') {
    // For now, export as CSV with proper formatting
    // Full Excel support would require xlsx library
    this.exportToCSV(cards, setName);
  }

  /**
   * Export collection snapshot (full backup)
   */
  exportFullBackup(sets, currentSetStats) {
    const backup = {
      version: '1.0',
      backupDate: new Date().toISOString(),
      sets: sets.map(set => ({
        id: set.id,
        name: set.name,
        sheetName: set.sheetName,
        cardCount: set.cards.length,
        stats: currentSetStats.find(s => s.setId === set.id) || {}
      })),
      totalSets: sets.length,
      totalCards: sets.reduce((sum, s) => sum + s.cards.length, 0),
      collectedCards: sets.reduce((sum, s) => 
        sum + s.cards.filter(c => c.collected || c.reverseHolo).length, 0
      )
    };

    const json = JSON.stringify(backup, null, 2);
    this.downloadFile(json, `collection-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json;charset=utf-8;');
  }

  /**
   * Generate statistics from cards
   */
  generateStatistics(cards) {
    const stats = {
      totalCards: cards.length,
      collectedCards: 0,
      uncollectedCards: 0,
      reverseHoloCards: 0,
      normalCards: 0,
      byRarity: {},
      bySet: {},
      completionPercent: 0
    };

    cards.forEach(card => {
      if (card.collected) stats.collectedCards++;
      if (!card.collected && !card.reverseHolo) stats.uncollectedCards++;
      if (card.reverseHolo) stats.reverseHoloCards++;
      if (!card.reverseHolo) stats.normalCards++;

      // By rarity
      const rarity = card.rarity || 'Unknown';
      if (!stats.byRarity[rarity]) {
        stats.byRarity[rarity] = 0;
      }
      stats.byRarity[rarity]++;

      // By set
      const set = card.set || 'Unknown';
      if (!stats.bySet[set]) {
        stats.bySet[set] = 0;
      }
      stats.bySet[set]++;
    });

    stats.completionPercent = stats.totalCards > 0 
      ? parseFloat(((stats.collectedCards / stats.totalCards) * 100).toFixed(2))
      : 0;

    return stats;
  }

  /**
   * Download file utility
   */
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Get file from input
   */
  async getFileFromInput(inputElement) {
    return new Promise((resolve, reject) => {
      inputElement.click();
      
      inputElement.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
          reject(new Error('Keine Datei ausgewählt'));
          return;
        }
        resolve(file);
      });
    });
  }

  /**
   * Validate imported data
   */
  validateImportedData(cards, expectedColumns = null) {
    if (!Array.isArray(cards)) {
      throw new Error('Importierte Daten sind kein Array');
    }

    if (cards.length === 0) {
      throw new Error('Keine Karten in der importierten Datei');
    }

    if (expectedColumns) {
      const firstCard = cards[0];
      const missingColumns = expectedColumns.filter(col => !(col in firstCard));
      
      if (missingColumns.length > 0) {
        console.warn(`Warnung: Fehlende Spalten: ${missingColumns.join(', ')}`);
      }
    }

    return true;
  }

  /**
   * Merge imported data with existing
   */
  mergeImportedData(existingCards, importedCards, mergeStrategy = 'update') {
    const merged = [...existingCards];

    importedCards.forEach(importedCard => {
      const existingIdx = merged.findIndex(c => 
        c.id === importedCard.id || 
        (c.number === importedCard.number && c.set === importedCard.set)
      );

      if (existingIdx >= 0) {
        if (mergeStrategy === 'update') {
          // Update existing with imported data
          merged[existingIdx] = { ...merged[existingIdx], ...importedCard };
        } else if (mergeStrategy === 'skip') {
          // Keep existing data
        } else if (mergeStrategy === 'overwrite') {
          // Replace entirely
          merged[existingIdx] = importedCard;
        }
      } else {
        // Add as new card
        merged.push(importedCard);
      }
    });

    return merged;
  }
}

// Global instance
let globalExportImport = null;

/**
 * Initialize global Export/Import
 */
function initializeExportImport() {
  if (!globalExportImport) {
    globalExportImport = new ExportImport();
  }
  return globalExportImport;
}

/**
 * Get global Export/Import instance
 */
function getGlobalExportImport() {
  if (!globalExportImport) {
    globalExportImport = new ExportImport();
  }
  return globalExportImport;
}

export { ExportImport, initializeExportImport, getGlobalExportImport };
