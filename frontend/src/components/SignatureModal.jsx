/**
 * Custom Signature Modal — iPad-optimiert mit devicePixelRatio
 * Port vom alten Stagedesk-System, angepasst an V2 Dark Theme
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Eraser, Check, Pencil, Info } from 'lucide-react';

export default function SignatureModal({
  isOpen,
  onClose,
  onSave,
  title = 'Unterschrift erforderlich',
  subtitle = null,
  progress = null,
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [touchDevice, setTouchDevice] = useState(false);

  // Canvas initialisieren
  useEffect(() => {
    if (!isOpen) return;

    const isTouchDevice = (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
    setTouchDevice(isTouchDevice);
    setHasSignature(false);

    // Kurz warten bis DOM gerendert ist
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen]);

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    if (e.type.includes('touch')) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDrawing = useCallback((e) => {
    if (e.type.includes('touch')) e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  }, [getPos]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    if (e.type.includes('touch')) e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    canvasRef.current.getContext('2d').closePath();
    setIsDrawing(false);
  }, [isDrawing]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSave = () => {
    if (!hasSignature || !canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
    clearCanvas();
  };

  const handleClose = () => {
    clearCanvas();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {progress && (
              <span className="text-sm text-blue-400 font-medium">{progress}</span>
            )}
            <button onClick={handleClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2 text-sm text-gray-400">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            {touchDevice
              ? 'Verwenden Sie Ihren Finger oder Apple Pencil zum Unterschreiben'
              : 'Unterschreiben Sie mit der Maus im weißen Feld'}
          </span>
        </div>

        {/* Canvas */}
        <div className="px-4 pb-3 flex-1 min-h-0">
          <div className="relative rounded-lg overflow-hidden border border-gray-600 bg-white"
            style={{ height: '220px', touchAction: 'none' }}>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasSignature && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-gray-300">
                <Pencil className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-sm opacity-40">Bitte hier unterschreiben</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700">
          <button onClick={clearCanvas} disabled={!hasSignature}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30">
            <Eraser className="w-4 h-4" />
            Löschen
          </button>
          <div className="flex items-center gap-2">
            <button onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white">
              Abbrechen
            </button>
            <button onClick={handleSave} disabled={!hasSignature}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg">
              <Check className="w-4 h-4" />
              Unterschrift bestätigen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
