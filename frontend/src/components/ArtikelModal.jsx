/**
 * Modal zum Hinzufügen eines Artikels mit Link-Parser
 */
import { useState } from 'react';
import { X, ShoppingCart, Link as LinkIcon, Loader, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import apiClient from '../lib/api';

export default function ArtikelModal({ haushalt, onClose, onCreated }) {
  const [formData, setFormData] = useState({
    name: '',
    preis: '',
    anzahl: 1,
    link: '',
    kategorie: 'konsumitiv',
    beschreibung: '',
  });
  
  const [isParsingLink, setIsParsingLink] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [kategorieAutoSet, setKategorieAutoSet] = useState(false);

  // Automatische Kategorie-Vorauswahl basierend auf Nettopreis
  const autoSelectKategorie = (preis) => {
    const nettoPreis = parseFloat(preis) || 0;
    if (nettoPreis > 250) {
      return 'investiv';
    }
    return 'konsumitiv';
  };

  // Preis ändern mit automatischer Kategorie-Vorauswahl
  const handlePreisChange = (newPreis) => {
    const autoKategorie = autoSelectKategorie(newPreis);
    setFormData({
      ...formData,
      preis: newPreis,
      kategorie: autoKategorie,
    });
    setKategorieAutoSet(true);
  };

  // Link parsen (automatische Datenerkennung)
  const handleParseLink = async () => {
    if (!formData.link) return;
    
    setIsParsingLink(true);
    setParseError(null);
    
    try {
      const response = await apiClient.post('/haushalte/parse-link/', {
        url: formData.link,
      });
      
      const data = response.data;
      const newPreis = data.preis || formData.preis;
      const autoKategorie = autoSelectKategorie(newPreis);
      
      // Felder mit geparsten Daten füllen + automatische Kategorie
      setFormData({
        ...formData,
        name: data.name || formData.name,
        preis: newPreis,
        beschreibung: data.beschreibung || formData.beschreibung,
        kategorie: autoKategorie,
      });
      setKategorieAutoSet(true);
    } catch (error) {
      console.error('Link-Parse-Fehler:', error);
      setParseError('Produktdaten konnten nicht automatisch geladen werden. Bitte manuell eingeben.');
    } finally {
      setIsParsingLink(false);
    }
  };

  // Benutzer kann Kategorie jederzeit manuell ändern

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    
    try {
      const response = await apiClient.post(`/haushalte/${haushalt.id}/artikel`, {
        name: formData.name,
        preis: parseFloat(formData.preis) || 0,
        anzahl: parseInt(formData.anzahl) || 1,
        kategorie: formData.kategorie,
        link: formData.link || '',
        beschreibung: formData.beschreibung || '',
      });
      
      onCreated(response.data);
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      setSaveError(err.response?.data?.detail || 'Artikel konnte nicht gespeichert werden.');
      setIsSaving(false);
    }
  };

  const gesamtPreis = (parseFloat(formData.preis) || 0) * (parseInt(formData.anzahl) || 1);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Artikel hinzufügen</h2>
              <p className="text-sm text-gray-400">zu {haushalt.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Link Parser */}
          <div className="bg-blue-950/30 border border-blue-900 rounded-lg p-4">
            <label className="block text-sm font-medium text-blue-300 mb-2">
              🔗 Produkt-Link (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                placeholder="https://amazon.de/produkt..."
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleParseLink}
                disabled={!formData.link || isParsingLink}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                {isParsingLink ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4" />
                )}
                Parsen
              </button>
            </div>
            {parseError && (
              <p className="mt-2 text-xs text-yellow-400">{parseError}</p>
            )}
            <p className="mt-2 text-xs text-gray-400">
              Füge einen Produkt-Link ein, um Name und Preis automatisch zu erkennen.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Produktname *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Laptop, Sofa, Lebensmittel"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Preis */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Netto-Preis (€) *
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.preis}
                onChange={(e) => handlePreisChange(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Bei &gt; 250€ wird automatisch "Investitiv" vorgeschlagen
              </p>
            </div>

            {/* Anzahl */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Anzahl *
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.anzahl}
                onChange={(e) => setFormData({ ...formData, anzahl: e.target.value })}
                placeholder="1"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Kategorie (manuelle Auswahl) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Kategorie * (Budget-Zuweisung)
            </label>
            {kategorieAutoSet && (
              <p className="text-xs text-blue-400 mb-3">
                ✨ Automatisch vorgeschlagen basierend auf dem Preis. Du kannst sie jederzeit ändern.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, kategorie: 'konsumitiv' });
                  setKategorieAutoSet(false);
                }}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.kategorie === 'konsumitiv'
                    ? 'bg-orange-950/30 border-orange-600'
                    : 'bg-gray-800 border-gray-700 hover:border-orange-600/50'
                }`}
              >
                <TrendingDown className="w-6 h-6 text-orange-400 mb-2" />
                <p className="font-semibold text-orange-300">Konsumitiv</p>
                <p className="text-xs text-gray-400 mt-1">Alltägliche Ausgaben (≤ 250€)</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, kategorie: 'investiv' });
                  setKategorieAutoSet(false);
                }}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.kategorie === 'investiv'
                    ? 'bg-green-950/30 border-green-600'
                    : 'bg-gray-800 border-gray-700 hover:border-green-600/50'
                }`}
              >
                <TrendingUp className="w-6 h-6 text-green-400 mb-2" />
                <p className="font-semibold text-green-300">Investitiv</p>
                <p className="text-xs text-gray-400 mt-1">Langfristige Anschaffungen (&gt; 250€)</p>
              </button>
            </div>
          </div>

          {/* Gesamtpreis Anzeige */}
          <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
            <span className="text-gray-400">Gesamtpreis</span>
            <span className="text-2xl font-bold text-white">€ {gesamtPreis.toFixed(2)}</span>
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Beschreibung (optional)
            </label>
            <textarea
              value={formData.beschreibung}
              onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
              placeholder="Zusätzliche Details zum Artikel..."
              rows={3}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Fehleranzeige */}
          {saveError && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {saveError}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-750 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wird gespeichert...
                </>
              ) : (
                'Artikel hinzufügen'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
