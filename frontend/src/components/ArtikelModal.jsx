/**
 * Modal zum Hinzufuegen eines Artikels
 */
import { useState } from 'react';
import { X, Loader2, Wand2 } from 'lucide-react';
import apiClient from '../lib/api';

export default function ArtikelModal({ isOpen, onClose, haushaltId, onCreated }) {
  const [formData, setFormData] = useState({
    name: '', preis: '', anzahl: 1, kategorie: 'konsumitiv', link: '', beschreibung: ''
  });
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleParseLink = async () => {
    if (!formData.link) return;
    setParsing(true);
    try {
      const response = await apiClient.post('/haushalte/parse-link/', { url: formData.link });
      const data = response.data;
      setFormData(prev => ({
        ...prev,
        name: data.name || prev.name,
        preis: data.preis || prev.preis,
        beschreibung: data.beschreibung || prev.beschreibung,
        kategorie: data.preis && parseFloat(data.preis) > 250 ? 'investiv' : prev.kategorie,
      }));
    } catch (err) {
      console.error('Parse-Fehler:', err);
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      await apiClient.post(`/haushalte/${haushaltId}/artikel`, {
        name: formData.name,
        preis: parseFloat(formData.preis) || 0,
        anzahl: parseInt(formData.anzahl) || 1,
        kategorie: formData.kategorie,
        link: formData.link,
        beschreibung: formData.beschreibung,
      });
      onCreated();
      onClose();
      setFormData({ name: '', preis: '', anzahl: 1, kategorie: 'konsumitiv', link: '', beschreibung: '' });
    } catch (err) {
      setError('Fehler beim Erstellen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Neuer Artikel</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Link (optional)</label>
            <div className="flex gap-2">
              <input type="url" value={formData.link} onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                placeholder="https://..." className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              <button type="button" onClick={handleParseLink} disabled={!formData.link || parsing}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg">
                {parsing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" required />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Preis</label>
              <input type="number" step="0.01" value={formData.preis}
                onChange={(e) => {
                  const preis = e.target.value;
                  setFormData({ ...formData, preis, kategorie: parseFloat(preis) > 250 ? 'investiv' : formData.kategorie });
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Anzahl</label>
              <input type="number" min="1" value={formData.anzahl}
                onChange={(e) => setFormData({ ...formData, anzahl: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Kategorie</label>
            <div className="flex gap-2">
              {['konsumitiv', 'investiv'].map((k) => (
                <button key={k} type="button" onClick={() => setFormData({ ...formData, kategorie: k })}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium ${formData.kategorie === k
                    ? k === 'konsumitiv' ? 'bg-orange-600 text-white' : 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-400'}`}>
                  {k === 'konsumitiv' ? 'Konsumitiv' : 'Investitiv'}
                </button>
              ))}
            </div>
          </div>
          
          {error && <p className="text-red-400 text-sm">{error}</p>}
          
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-800 text-white rounded-lg">Abbrechen</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}Hinzufügen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
