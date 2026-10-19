/**
 * Modal zum Bearbeiten eines Haushalts
 */
import { useState } from 'react';
import { X, Wallet, Loader2 } from 'lucide-react';
import apiClient from '../lib/api';

export default function EditHaushaltModal({ haushalt, onClose, onUpdated }) {
  const [formData, setFormData] = useState({
    name: haushalt.name || '',
    budget_konsumitiv: haushalt.budget_konsumitiv || '',
    budget_investiv: haushalt.budget_investiv || '',
    beschreibung: haushalt.beschreibung || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.put(`/haushalte/${haushalt.id}`, {
        name: formData.name,
        budget_konsumitiv: parseFloat(formData.budget_konsumitiv) || 0,
        budget_investiv: parseFloat(formData.budget_investiv) || 0,
        beschreibung: formData.beschreibung || '',
      });
      
      onUpdated(response.data);
    } catch (err) {
      console.error('Fehler beim Aktualisieren:', err);
      setError(err.response?.data?.detail || 'Haushalt konnte nicht aktualisiert werden.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent/15 ring-1 ring-inset ring-accent/30 rounded-lg flex items-center justify-center">
              <Wallet className="w-4 h-4 text-accent" />
            </div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-white">Haushalt bearbeiten</h2>
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Name <span className="text-accent">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="z.B. Schuljahr 2026/27"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Budget Konsumitiv */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Budget konsumtiv (€) <span className="text-accent">*</span>
            </label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={formData.budget_konsumitiv}
              onChange={(e) => setFormData({ ...formData, budget_konsumitiv: e.target.value })}
              placeholder="z.B. 1500.00"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Budget Investitiv */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Budget investiv (€) <span className="text-accent">*</span>
            </label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={formData.budget_investiv}
              onChange={(e) => setFormData({ ...formData, budget_investiv: e.target.value })}
              placeholder="z.B. 1000.00"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Beschreibung <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={formData.beschreibung}
              onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
              placeholder="Wofür ist dieses Budget gedacht?"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
            />
          </div>

          {/* Fehleranzeige */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-800 -mx-5 px-5 mt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3.5 py-2 text-sm bg-accent hover:bg-accent-hover text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Speichere…
                </>
              ) : (
                'Speichern'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
