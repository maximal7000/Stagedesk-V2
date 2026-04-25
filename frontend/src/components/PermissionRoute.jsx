/**
 * Wrapper für geschützte Routen: rendert children nur wenn der User die
 * geforderte Permission hat. Sonst "Keine Berechtigung"-Seite.
 *
 * <PermissionRoute permission="inventar.view"><InventarPage/></PermissionRoute>
 * <PermissionRoute adminOnly><AdminPage/></PermissionRoute>
 * <PermissionRoute anyOf={['monitor.view']} adminOnly><Page/></PermissionRoute>
 *   (adminOnly + anyOf/permission = Admin oder eine der Permissions reicht)
 */
import { Loader2, ShieldOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';

export default function PermissionRoute({ permission, anyOf, adminOnly, children }) {
  const { isAdmin, hasPermission, loading, initialized } = useUser();

  if (loading || !initialized) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  let allowed = false;
  if (isAdmin) {
    allowed = true;
  } else if (adminOnly && !permission && !anyOf) {
    allowed = false;
  } else if (permission) {
    allowed = hasPermission(permission);
  } else if (Array.isArray(anyOf) && anyOf.length > 0) {
    allowed = anyOf.some(p => hasPermission(p));
  } else {
    // Keine Restriktion gesetzt → für eingeloggte User offen
    allowed = true;
  }

  if (!allowed) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <ShieldOff className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Keine Berechtigung</h1>
        <p className="text-gray-400 mb-6">
          Du hast keine Berechtigung, diese Seite zu sehen. Wende dich an einen Administrator,
          falls du Zugriff brauchst.
        </p>
        <Link to="/" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
          Zurück zum Dashboard
        </Link>
      </div>
    );
  }

  return children;
}
