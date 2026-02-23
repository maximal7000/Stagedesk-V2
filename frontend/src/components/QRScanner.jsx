/**
 * QR-Code & Barcode Scanner mit Kamera-Unterstützung
 * Verwendet html5-qrcode für QR-Code und Barcode-Erkennung
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, ScanLine } from 'lucide-react';

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

export default function QRScanner({ onScan, onClose, continuous = false, label = 'Code scannen' }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [lastFormat, setLastFormat] = useState('');
  const scannerRef = useRef(null);
  const containerRef = useRef(null);

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    setError('');

    try {
      const scanner = new Html5Qrcode('qr-reader', { formatsToSupport: SUPPORTED_FORMATS });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 300, height: 150 }, aspectRatio: 1.5 },
        (decodedText, result) => {
          const format = result?.result?.format?.formatName || 'QR';
          setLastFormat(format);
          onScan(decodedText);
          if (!continuous) {
            stopScanner();
          }
        },
        () => {}
      );
      setScanning(true);
    } catch (err) {
      setError('Kamera konnte nicht gestartet werden. Bitte Berechtigung prüfen.');
      scannerRef.current = null;
    }
  }, [onScan, continuous]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (e) {
        // ignore stop errors
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setManualCode('');
      if (!continuous) {
        onClose?.();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Camera className="w-5 h-5" />
            {label}
          </h2>
          <button
            onClick={() => { stopScanner(); onClose?.(); }}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner Area */}
        <div className="p-4 space-y-4">
          {!scanning ? (
            <div className="text-center space-y-4">
              <div className="w-full h-48 bg-gray-800 rounded-lg flex items-center justify-center flex-col gap-2">
                <ScanLine className="w-16 h-16 text-gray-600" />
                <p className="text-xs text-gray-500">QR-Codes & Barcodes</p>
              </div>
              <button
                onClick={startScanner}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                Kamera starten
              </button>
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div id="qr-reader" ref={containerRef} className="rounded-lg overflow-hidden" />
              <div className="flex items-center justify-between">
                <button
                  onClick={stopScanner}
                  className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm"
                >
                  Kamera stoppen
                </button>
              </div>
              {continuous && (
                <p className="text-gray-400 text-sm text-center">Fortlaufendes Scannen aktiv</p>
              )}
              {lastFormat && (
                <p className="text-gray-500 text-xs text-center">Erkannt: {lastFormat}</p>
              )}
            </div>
          )}

          {/* Manual Input */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-sm text-gray-400 mb-2">Oder Code manuell eingeben:</p>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="QR-Code / Barcode / Seriennummer"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
              >
                OK
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
