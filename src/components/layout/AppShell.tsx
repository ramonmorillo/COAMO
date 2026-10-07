import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { PROJECT_IDENTITY, PROJECT_SHORT_FOOTER } from '../../constants/institutional';
import { getCurrentSession, getOwnAccessDecision, signOut, subscribeToAuthChanges } from '../../services/authService';
import { BrandMark } from '../ui/BrandMark';
import { LoadingState } from '../ui/LoadingState';

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link');

type BlockedState = { title: string; message: string } | null;

export function AppShell() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [blocked, setBlocked] = useState<BlockedState>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function validateSession() {
      const { session, error } = await getCurrentSession();
      if (!mounted) return;

      if (error) {
        setBlocked({ title: 'Error de autenticación', message: error.message });
        setCheckingSession(false);
        return;
      }
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }

      // Autorización COAMO: la cuenta puede ser válida en el proyecto (compartido con DERMAPEX) y no
      // estar autorizada en COAMO. La decisión real la toma la base de datos.
      const decision = await getOwnAccessDecision(session.user.id);
      if (!mounted) return;

      switch (decision) {
        case 'no_access':
          setBlocked({
            title: 'Cuenta sin acceso a COAMO',
            message:
              'Has iniciado sesión correctamente, pero esta cuenta no está autorizada en COAMO. Si participas en el estudio, pide a la coordinación que habilite tu acceso.',
          });
          break;
        case 'inactive':
          setBlocked({
            title: 'Cuenta desactivada en COAMO',
            message: 'Tu perfil en COAMO está desactivado. Contacta con la coordinación del estudio.',
          });
          break;
        case 'error':
          setBlocked({
            title: 'No se pudo comprobar tu acceso',
            message: 'Inténtalo de nuevo en unos minutos. Si el problema persiste, contacta con la coordinación.',
          });
          break;
        case 'must_change_password':
          // Contraseña temporal (cuenta creada por coordinación): debe cambiarse antes de acceder.
          navigate('/set-password?mode=first', { replace: true });
          return;
        case 'ok':
          setBlocked(null);
          break;
      }
      setCheckingSession(false);
    }

    const subscription = subscribeToAuthChanges((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session) navigate('/login', { replace: true });
    });

    void validateSession();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await signOut();
    if (error) {
      setBlocked({ title: 'No se pudo cerrar la sesión', message: error.message });
      setIsSigningOut(false);
      return;
    }
    navigate('/login', { replace: true });
  };

  if (checkingSession) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <LoadingState label="Comprobando sesión..." />
        </main>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <section className="error-state" role="alert">
            <h2>{blocked.title}</h2>
            <p>{blocked.message}</p>
            <button type="button" className="button-link" onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? 'Saliendo...' : 'Cerrar sesión'}
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/dashboard" aria-label={`${PROJECT_IDENTITY.name} · Ir al inicio`}>
            <BrandMark size={30} />
            <span className="brand-stack">
              <span className="brand-name">{PROJECT_IDENTITY.name}</span>
              <span className="brand-subtitle">{PROJECT_IDENTITY.subtitle}</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="Navegación principal">
            <NavLink to="/dashboard" className={navLinkClass}>
              Inicio
            </NavLink>
            <NavLink to="/centers" className={navLinkClass}>
              Centros
            </NavLink>
          </nav>
          <div className="topbar-meta">
            <span className="system-status" title={`Sesión autenticada en el entorno profesional de ${PROJECT_IDENTITY.name}`}>
              <span className="system-status-dot" aria-hidden="true" />
              Entorno profesional seguro
            </span>
            <button type="button" className="nav-signout" onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? 'Saliendo...' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      </header>
      <main className="main-content" id="main-content">
        <Outlet />
      </main>
      <footer className="app-footer">
        <p className="app-footer-text">{PROJECT_SHORT_FOOTER}</p>
      </footer>
    </div>
  );
}
