import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import apiClient from '../lib/api';

export default function EditHaushaltModal({ isOpen, onClose, haushalt, onUpdated }) {
  const [formData, setFormData] = useState({ name: '', budget_konsumitiv: '', budget_investiv: '', beschreibung: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (haushalt) {
      setFormData({
        name: haushalt.name || '',
        budget_konsumitiv: haushalt.budget_konsumitiv || '',
        budget_investiv: haushalt.budget_investiv || '',
        beschreibung: haushalt.beschreibung || '',
      });
    }
  }, [haushalt]);

  if (!isOpen || !haushalt) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.put('/haushalte/' + haushalt.id, {
        name: formData.name,
        budget_konsumitiv: parseFloat(formData.budget_konsumitiv) || 0,
        budget_investiv: parseFloat(formData.budget_investiv) || 0,
        beschreibung: formData.beschreibung,
      });
      onUpdated(response.data);
      onClose();
    } catch (err) {
      setError('Fehler beim Speichern');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Haushalt bearbeiten</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Budget Konsumitiv</label>
              <input type="number" step="0.01" value={formData.budget_konsumitiv}
                onChange={(e) => setFormData({ ...formData, budget_konsumitiv: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Budget Investitiv</label>
              <input type="number" step="0.01" value={formData.budget_investiv}
                onChange={(e) => setFormData({ ...formData, budget_investiv: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
            <textarea value={formData.beschreibung} onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" rows="3" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-800 text-white rounded-lg">Abbrechen</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
