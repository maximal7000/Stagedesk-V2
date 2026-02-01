/**
 * Test-Seite zum Überprüfen des Tailwind CSS Designs
 */
import { Wallet, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';

export default function DesignTestPage() {
  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">
            🎨 Tailwind CSS Design Test
          </h1>
          <p className="text-gray-400">
            Wenn du diese Seite im Dark Mode mit schönen Farben siehst, funktioniert Tailwind! 🚀
          </p>
        </div>

        {/* Color Test */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Farben-Test</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-600 p-4 rounded-lg text-white text-center font-semibold">
              Blue (Primary)
            </div>
            <div className="bg-green-500 p-4 rounded-lg text-white text-center font-semibold">
              Green (Success)
            </div>
            <div className="bg-orange-500 p-4 rounded-lg text-white text-center font-semibold">
              Orange (Warning)
            </div>
            <div className="bg-red-500 p-4 rounded-lg text-white text-center font-semibold">
              Red (Danger)
            </div>
          </div>
        </div>

        {/* Cards Test */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Card 1</h3>
            <p className="text-gray-400">Dies ist eine Test-Card mit Hover-Effekt</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Card 2</h3>
            <p className="text-gray-400">Mit Icons von lucide-react</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
            <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center mb-4">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Card 3</h3>
            <p className="text-gray-400">Smooth Transitions</p>
          </div>
        </div>

        {/* Buttons Test */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Button-Test</h2>
          <div className="flex flex-wrap gap-4">
            <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
              Primary Button
            </button>
            <button className="px-6 py-3 bg-gray-800 hover:bg-gray-750 text-white font-semibold rounded-lg transition-colors">
              Secondary Button
            </button>
            <button className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors">
              Success Button
            </button>
            <button className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors">
              Danger Button
            </button>
          </div>
        </div>

        {/* Alerts Test */}
        <div className="space-y-4">
          <div className="bg-blue-950 border border-blue-900 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-300">Info</p>
              <p className="text-sm text-blue-200">Dies ist eine Info-Nachricht mit Tailwind CSS</p>
            </div>
          </div>

          <div className="bg-green-950 border border-green-900 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-300">Erfolg</p>
              <p className="text-sm text-green-200">Tailwind CSS wurde erfolgreich geladen! 🎉</p>
            </div>
          </div>
        </div>

        {/* Typography Test */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-3xl font-bold text-white mb-4">Typografie-Test</h2>
          <h3 className="text-2xl font-semibold text-white mb-2">Heading 2</h3>
          <h4 className="text-xl font-semibold text-white mb-2">Heading 3</h4>
          <p className="text-gray-300 mb-2">
            Dies ist normaler Text in grau-300. Er sollte gut lesbar sein auf dunklem Hintergrund.
          </p>
          <p className="text-gray-400 mb-2">
            Dies ist sekundärer Text in grau-400, etwas dezenter.
          </p>
          <p className="text-sm text-gray-500">
            Kleiner Text in grau-500 für weniger wichtige Informationen.
          </p>
        </div>

        {/* Form Test */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Formular-Test</h2>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Input-Feld
              </label>
              <input
                type="text"
                placeholder="Hier Text eingeben..."
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select-Feld
              </label>
              <select className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>Option 1</option>
                <option>Option 2</option>
                <option>Option 3</option>
              </select>
            </div>
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center p-8 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl border border-blue-800">
          <div className="text-6xl mb-4">✨</div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Tailwind CSS funktioniert perfekt!
          </h2>
          <p className="text-gray-300">
            Wenn du diese Seite im schönen Dark Mode siehst, ist alles korrekt konfiguriert.
          </p>
        </div>
      </div>
    </div>
  );
}
