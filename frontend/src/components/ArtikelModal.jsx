/**
 * Modal zum Hinzufügen eines Artikels mit Link-Parser
 */
import { useState } from 'react';
import { X, ShoppingCart, Link as LinkIcon, Loader, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import apiClient from '../lib/api';
import { MarkdownHint } from './Markdown';

// Status-Optionen (synchron mit Backend STATUS_CHOICES).
const STATUS_OPTIONS = [
  { v: 'geplant',   l: 'Geplant' },
  { v: 'beantragt', l: 'Beantragt' },
  { v: 'genehmigt', l: 'Genehmigt' },
  { v: 'bestellt',  l: 'Bestellt' },
  { v: 'geliefert', l: 'Geliefert' },
  { v: 'abgelehnt', l: 'Abgelehnt' },
];

export default function ArtikelModal({ haushalt, onClose, onCreated, initialKategorie = 'konsumitiv', artikel = null }) {
  // Wenn `artikel` übergeben wird, ist es ein Edit-Modus — sonst Neu-Anlegen.
  const isEdit = !!artikel;
  const [formData, setFormData] = useState({
    name: artikel?.name || '',
    preis: artikel?.preis ?? '',
    anzahl: artikel?.anzahl ?? 1,
    link: artikel?.link || '',
    kategorie: artikel?.kategorie || initialKategorie,
    beschreibung: artikel?.beschreibung || '',
    status: artikel?.status || 'geplant',
    bild_url: artikel?.bild_url || '',
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

    const body = {
      name: formData.name,
      preis: parseFloat(formData.preis) || 0,
      anzahl: parseInt(formData.anzahl) || 1,
      kategorie: formData.kategorie,
      link: formData.link || '',
      beschreibung: formData.beschreibung || '',
      status: formData.status || 'geplant',
      bild_url: formData.bild_url || '',
    };

    try {
      const response = isEdit
        ? await apiClient.put(`/haushalte/${haushalt.id}/artikel/${artikel.id}`, body)
        : await apiClient.post(`/haushalte/${haushalt.id}/artikel`, body);
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent/15 ring-1 ring-inset ring-accent/30 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight text-white leading-tight">
                {isEdit ? 'Artikel bearbeiten' : 'Artikel erfassen'}
              </h2>
              <p className="text-sm text-gray-400">
                {isEdit ? `in ${haushalt.name}` : `zu ${haushalt.name}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Link Parser */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2">
              <LinkIcon className="w-3.5 h-3.5 text-gray-500" /> Produkt-Link <span className="text-gray-500 font-normal">(optional, füllt Name und Preis aus)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                placeholder="https://amazon.de/produkt..."
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={handleParseLink}
                disabled={!formData.link || isParsingLink}
                className="px-3.5 py-2 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
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
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Bei &gt; 250€ wird automatisch „Investiv" vorgeschlagen
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
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Kategorie (manuelle Auswahl) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Kategorie * (Budget-Zuweisung)
            </label>
            {kategorieAutoSet && (
              <p className="text-xs text-gray-400 mb-3">
                Anhand des Preises vorgeschlagen. Du kannst sie jederzeit ändern.
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
                <p className="font-semibold text-orange-300">Konsumtiv</p>
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
                <p className="font-semibold text-green-300">Investiv</p>
                <p className="text-xs text-gray-400 mt-1">Langfristige Anschaffungen (&gt; 250€)</p>
              </button>
            </div>
          </div>

          {/* Gesamtpreis Anzeige */}
          <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
            <span className="text-gray-400">Gesamtpreis</span>
            <span className="text-2xl font-bold text-white">€ {gesamtPreis.toFixed(2)}</span>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.v} value={s.v}>{s.l}</option>
              ))}
            </select>
          </div>

          {/* Bild-URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Bild-URL (optional)
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                value={formData.bild_url}
                onChange={(e) => setFormData({ ...formData, bild_url: e.target.value })}
                placeholder="https://…/produktbild.jpg"
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              {formData.bild_url && (
                <img src={formData.bild_url} alt="" className="w-10 h-10 object-cover rounded bg-gray-800"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
            </div>
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
              rows={4}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none font-mono text-sm"
            />
            <MarkdownHint />
          </div>

          {/* Fehleranzeige */}
          {saveError && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {saveError}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-3.5 py-2 text-sm bg-accent hover:bg-accent-hover text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Speichere…
                </>
              ) : (
                isEdit ? 'Speichern' : 'Artikel erfassen'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
