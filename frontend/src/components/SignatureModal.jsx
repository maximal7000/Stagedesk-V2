/**
 * Custom Signature Modal — iPad-optimiert mit devicePixelRatio
 * Grosses Zeichenfeld, Undo-Funktion, Touch + Maus
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Eraser, Check, Pencil, Info, Undo2, Maximize2, Minimize2 } from 'lucide-react';

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
  const [fullscreen, setFullscreen] = useState(false);
  // Undo: Speichere Canvas-Snapshots nach jedem Strich
  const strokeHistory = useRef([]);

  // Canvas initialisieren
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const isTouchDevice = (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
    setTouchDevice(isTouchDevice);
    setHasSignature(false);
    strokeHistory.current = [];

    const timer = setTimeout(initCanvas, 50);
    return () => clearTimeout(timer);
  }, [isOpen, initCanvas]);

  // Re-init canvas bei fullscreen toggle
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      // Bisherige Zeichnung speichern
      const canvas = canvasRef.current;
      if (!canvas) return;
      const prevData = hasSignature ? canvas.toDataURL() : null;
      initCanvas();
      // Zeichnung wiederherstellen
      if (prevData) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          const rect = canvas.getBoundingClientRect();
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = prevData;
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [fullscreen, isOpen, initCanvas, hasSignature]);

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
    // Snapshot vor neuem Strich speichern (fuer Undo)
    const canvas = canvasRef.current;
    strokeHistory.current.push(canvas.toDataURL());
    const ctx = canvas.getContext('2d');
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
    strokeHistory.current = [];
  };

  const handleUndo = () => {
    if (strokeHistory.current.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const prevState = strokeHistory.current.pop();
    const img = new Image();
    img.onload = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      if (strokeHistory.current.length === 0) setHasSignature(false);
    };
    img.src = prevState;
  };

  const handleSave = () => {
    if (!hasSignature || !canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
    clearCanvas();
  };

  const handleClose = () => {
    clearCanvas();
    setFullscreen(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className={`bg-gray-900 border border-gray-700 rounded-xl flex flex-col transition-all duration-200 ${
        fullscreen
          ? 'w-full h-full max-w-none rounded-none'
          : 'w-full max-w-4xl'
      }`}
        style={fullscreen ? {} : { maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{title}</h2>
            {subtitle && <p className="text-sm text-gray-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {progress && (
              <span className="text-sm text-blue-400 font-medium">{progress}</span>
            )}
            <button onClick={() => setFullscreen(!fullscreen)}
              className="text-gray-400 hover:text-white p-1" title={fullscreen ? 'Verkleinern' : 'Vollbild'}>
              {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button onClick={handleClose} className="text-gray-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="px-3 sm:px-4 pt-2 pb-1 flex items-center gap-2 text-sm text-gray-400">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            {touchDevice
              ? 'Finger oder Stift zum Unterschreiben verwenden'
              : 'Mit der Maus im weißen Feld unterschreiben'}
          </span>
        </div>

        {/* Canvas */}
        <div className="px-3 sm:px-4 pb-3 flex-1 min-h-0">
          <div className="relative rounded-lg overflow-hidden border border-gray-600 bg-white"
            style={{ height: fullscreen ? 'calc(100vh - 180px)' : 'min(400px, 50vh)', touchAction: 'none' }}>
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
                <Pencil className="w-10 h-10 mb-3 opacity-30" />
                <span className="text-base opacity-40">Bitte hier unterschreiben</span>
              </div>
            )}
            {/* Signatur-Linie */}
            <div className="absolute bottom-8 left-8 right-8 border-b border-gray-300 pointer-events-none" />
            <div className="absolute bottom-3 left-8 text-xs text-gray-300 pointer-events-none">Unterschrift</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-t border-gray-700">
          <div className="flex items-center gap-1">
            <button onClick={handleUndo} disabled={strokeHistory.current.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-gray-800">
              <Undo2 className="w-4 h-4" />
              <span className="hidden sm:inline">Rückgängig</span>
            </button>
            <button onClick={clearCanvas} disabled={!hasSignature}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-30 rounded-lg hover:bg-gray-800">
              <Eraser className="w-4 h-4" />
              <span className="hidden sm:inline">Löschen</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white">
              Abbrechen
            </button>
            <button onClick={handleSave} disabled={!hasSignature}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg">
              <Check className="w-4 h-4" />
              Bestätigen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
