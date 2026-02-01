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
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Haushalt bearbeiten</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Name des Haushalts *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="z.B. Privat, WG, Firma"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Budget Konsumitiv */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Budget Konsumitiv (€) *
            </label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={formData.budget_konsumitiv}
              onChange={(e) => setFormData({ ...formData, budget_konsumitiv: e.target.value })}
              placeholder="z.B. 1500.00"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Budget Investitiv */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Budget Investitiv (€) *
            </label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={formData.budget_investiv}
              onChange={(e) => setFormData({ ...formData, budget_investiv: e.target.value })}
              placeholder="z.B. 1000.00"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Beschreibung (optional)
            </label>
            <textarea
              value={formData.beschreibung}
              onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
              placeholder="Kurze Beschreibung des Haushalts..."
              rows={3}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Fehleranzeige */}
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-750 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wird gespeichert...
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
