/**
 * Modal zum Hinzufügen eines Artikels mit Link-Parser
 */
import { useState } from 'react';
import { X, Link as LinkIcon, Loader, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-overlay border border-line rounded-lg shadow-overlay max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-subtle sticky top-0 bg-overlay z-10">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-fg leading-tight">
              {isEdit ? 'Artikel bearbeiten' : 'Artikel erfassen'}
            </h2>
            <p className="text-sm text-fg-muted">
              {isEdit ? `in ${haushalt.name}` : `zu ${haushalt.name}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 text-fg-subtle hover:text-fg hover:bg-raised rounded-sm transition-colors"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Link Parser */}
          <div className="pb-5 border-b border-line-subtle">
            <label className="flex items-center gap-1.5 text-sm font-medium text-fg-muted mb-2">
              <LinkIcon className="w-3.5 h-3.5 text-fg-subtle" /> Produkt-Link <span className="text-fg-subtle font-normal">(optional, füllt Name und Preis aus)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                placeholder="https://amazon.de/produkt..."
                className="flex-1 px-4 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleParseLink}
                disabled={!formData.link || isParsingLink}
                className="px-3.5 py-2 text-sm bg-raised hover:bg-hover disabled:text-fg-disabled disabled:cursor-not-allowed text-fg font-medium rounded-md transition-colors flex items-center gap-2"
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
              <p className="mt-2 text-xs text-warn">{parseError}</p>
            )}
            <p className="mt-2 text-xs text-fg-muted">
              Füge einen Produkt-Link ein, um Name und Preis automatisch zu erkennen.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-fg-muted mb-2">
                Produktname *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Laptop, Sofa, Lebensmittel"
                className="w-full px-4 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>

            {/* Preis */}
            <div>
              <label className="block text-sm font-medium text-fg-muted mb-2">
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
                className="w-full px-4 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
              <p className="text-xs text-fg-subtle mt-1">
                Bei &gt; 250€ wird automatisch „Investiv" vorgeschlagen
              </p>
            </div>

            {/* Anzahl */}
            <div>
              <label className="block text-sm font-medium text-fg-muted mb-2">
                Anzahl *
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.anzahl}
                onChange={(e) => setFormData({ ...formData, anzahl: e.target.value })}
                placeholder="1"
                className="w-full px-4 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Kategorie (manuelle Auswahl) */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Kategorie * (Budget-Zuweisung)
            </label>
            {kategorieAutoSet && (
              <p className="text-xs text-fg-muted mb-3">
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
                className={`p-4 rounded-md border-2 transition-colors ${
                  formData.kategorie === 'konsumitiv'
                    ? 'bg-raised border-orange-500'
                    : 'bg-raised border-transparent hover:bg-hover'
                }`}
              >
                <TrendingDown className="w-6 h-6 text-orange-400 mb-2" />
                <p className="font-semibold text-orange-300">Konsumtiv</p>
                <p className="text-xs text-fg-muted mt-1">Alltägliche Ausgaben (≤ 250€)</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormData({ ...formData, kategorie: 'investiv' });
                  setKategorieAutoSet(false);
                }}
                className={`p-4 rounded-md border-2 transition-colors ${
                  formData.kategorie === 'investiv'
                    ? 'bg-raised border-ok'
                    : 'bg-raised border-transparent hover:bg-hover'
                }`}
              >
                <TrendingUp className="w-6 h-6 text-ok mb-2" />
                <p className="font-semibold text-ok">Investiv</p>
                <p className="text-xs text-fg-muted mt-1">Langfristige Anschaffungen (&gt; 250€)</p>
              </button>
            </div>
          </div>

          {/* Gesamtpreis Anzeige */}
          <div className="bg-raised rounded-md p-4 flex items-center justify-between">
            <span className="text-fg-muted">Gesamtpreis</span>
            <span className="text-2xl font-bold text-fg">€ {gesamtPreis.toFixed(2)}</span>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-4 py-2 bg-raised border border-line rounded-md text-fg hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.v} value={s.v}>{s.l}</option>
              ))}
            </select>
          </div>

          {/* Bild-URL */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Bild-URL (optional)
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                value={formData.bild_url}
                onChange={(e) => setFormData({ ...formData, bild_url: e.target.value })}
                placeholder="https://…/produktbild.jpg"
                className="flex-1 px-4 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
              {formData.bild_url && (
                <img src={formData.bild_url} alt="" className="w-10 h-10 object-cover rounded-sm bg-raised"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
            </div>
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Beschreibung (optional)
            </label>
            <textarea
              value={formData.beschreibung}
              onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
              placeholder="Zusätzliche Details zum Artikel..."
              rows={4}
              className="w-full px-4 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none resize-none font-mono text-sm"
            />
            <MarkdownHint />
          </div>

          {/* Fehleranzeige */}
          {saveError && (
            <div className="p-3 bg-raised rounded-md text-bad text-sm">
              {saveError}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-line-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-sm text-fg-muted hover:text-fg hover:bg-raised font-medium rounded-md transition-colors disabled:text-fg-disabled"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-3.5 py-2 text-sm bg-accent hover:bg-accent-hover text-white font-medium rounded-md transition-colors disabled:bg-raised disabled:text-fg-disabled disabled:pointer-events-none flex items-center justify-center gap-2"
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
