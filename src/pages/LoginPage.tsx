import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { PublicFooter } from '../components/public/PublicFooter';
import { BrandMark } from '../components/ui/BrandMark';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PROJECT_IDENTITY, PROJECT_INSTITUTIONAL_REFERENCE, getEthicsApprovalDateLabel } from '../constants/institutional';
import { consumePendingAuthLink, getAuthRedirectUrl } from '../lib/authLinks';
import { getCurrentSession, requestPasswordReset, signInWithPassword, subscribeToAuthChanges } from '../services/authService';

// Contenido de la portada: solo lo que consta en el protocolo, en el dictamen del CEIm y en la documentación del
// modelo CMO (docs/ESTRATIFICACION_CMO.md, docs/CUESTIONARIOS.md). No añadir cifras ni afirmaciones sin fuente.

const STUDY_PILLARS = [
  ['01', 'Población', 'Pacientes adultos con hemofilia A, hemofilia B o enfermedad de von Willebrand, incluidos tras comprobar la elegibilidad y obtener el consentimiento informado.'],
  ['02', 'Diseño', 'Estudio observacional multicéntrico con visita basal (V0) y visita final (VF) a los 12 meses ±1 mes, y seguimiento intermedio según la prioridad CMO.'],
  ['03', 'Variable principal', 'Experiencia del paciente con la atención recibida, medida con el cuestionario IEXPAC al inicio y al final del seguimiento.'],
] as const;

const FEATURES = [
  ['Inclusión seudonimizada', 'Alta sin datos identificativos, elegibilidad, consentimiento informado y estado del paciente en el estudio.'],
  ['Visitas y agenda', 'Visitas basal, de seguimiento y final, contactos asistenciales y calendario con ventanas de visita y próxima valoración orientada por la prioridad CMO.'],
  ['Datos clínicos y de tratamiento', 'Variables clínicas y farmacoterapéuticas definidas en el protocolo, registradas por visita.'],
  ['Estratificación CMO', 'Cálculo de la prioridad con el modelo SEFH para coagulopatías congénitas, con intervalo cuando faltan datos y elevación de nivel motivada.'],
  ['Cuestionarios V0/VF', 'IEXPAC, EQ-5D-3L, EVASAF y VERITAS (PRN y Pro), con evolución entre la visita basal y la final.'],
  ['Exportación de investigación', 'Paquete conciliado con la base de datos: datos en formato largo y ancho, diccionario, sintaxis SPSS y manifiesto de verificación.'],
] as const;

const PROCESS = ['Incluir', 'Evaluar en V0', 'Estratificar', 'Seguir', 'Medir en VF'] as const;

const INSTRUMENTS = [
  ['IEXPAC', 'Experiencia del paciente con la atención (PREM). Variable principal.'],
  ['EQ-5D-3L', 'Calidad de vida relacionada con la salud (PROM): perfil de salud y escala visual.'],
  ['EVASAF', 'Satisfacción con la atención farmacéutica.'],
  ['VERITAS-PRN / VERITAS-Pro', 'Adherencia al tratamiento a demanda o profiláctico.'],
] as const;

const PRIORITIES = [
  ['Prioridad 1', '≥ 28 puntos o terapia génica/avanzada', 'Seguimiento mensual'],
  ['Prioridad 2', '20 – 27 puntos', 'Seguimiento semestral'],
  ['Prioridad 3', '< 20 puntos', 'Seguimiento anual'],
] as const;

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    const link = consumePendingAuthLink();
    return link?.kind === 'error' ? `El enlace del correo no es válido o ha caducado (${link.description}). Solicita uno nuevo.` : null;
  });
  const [resetMode, setResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function ensureAnonymousState() {
      const { session, error } = await getCurrentSession();

      if (!mounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setCheckingSession(false);
        return;
      }

      if (session) {
        navigate('/dashboard', { replace: true });
        return;
      }

      setCheckingSession(false);
    }

    const subscription = subscribeToAuthChanges((event, session) => {
      if (!mounted) {
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard', { replace: true });
      }
    });

    void ensureAnonymousState();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    const { error } = await signInWithPassword(email, password);
    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setResetMessage(null);
    const { error } = await requestPasswordReset(email, getAuthRedirectUrl());
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setResetMessage('Si el email corresponde a una cuenta del estudio, recibirás un enlace para crear una nueva contraseña.');
  };

  const ref = PROJECT_INSTITUTIONAL_REFERENCE;
  const sessionDate = getEthicsApprovalDateLabel();

  return (
    <div className="public-page">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <header className="public-header">
        <div className="public-container public-nav">
          <a className="public-brand" href="#inicio" aria-label={`${PROJECT_IDENTITY.name} · Inicio`}>
            <BrandMark size={36} />
            <span><strong>{PROJECT_IDENTITY.name}</strong><small>Modelo CMO</small></span>
          </a>
          <nav aria-label="Navegación pública">
            <a href="#estudio">El estudio</a>
            <a href="#modelo-cmo">Modelo CMO</a>
            <a href="#investigacion">Investigación</a>
            <a className="public-access-link" href="#acceso">Acceso profesional</a>
          </nav>
        </div>
      </header>

      <main id="contenido">
        <section className="public-hero" id="inicio" aria-labelledby="hero-title">
          <div className="public-container hero-grid">
            <div className="hero-copy">
              <p className="iris-eyebrow">{PROJECT_IDENTITY.name} · Estudio observacional multicéntrico</p>
              <h1 id="hero-title">Experiencia del paciente.<br />Estratificación. Seguimiento.</h1>
              <p className="hero-lead">Herramienta digital del estudio {PROJECT_IDENTITY.name} para la atención farmacéutica según el modelo CMO en adultos con coagulopatías congénitas.</p>
              <p className="hero-support">Reúne en un único entorno la inclusión seudonimizada, las visitas del estudio, los datos clínicos y de tratamiento, la estratificación CMO, los cuestionarios de resultados reportados por el paciente y la exportación para el análisis.</p>
              <div className="hero-actions">
                <a className="button-link" href="#acceso">Acceso profesional</a>
                <a className="button-secondary" href="#estudio">Conocer el estudio</a>
              </div>
              {ref.ethicsApprovalCode ? (
                <p className="hero-reference">{ref.ethicsDecision} del {ref.ethicsCommittee} · nº de registro {ref.ethicsApprovalCode}</p>
              ) : null}
            </div>
            <div className="longitudinal-card" aria-label="Seguimiento desde la visita basal hasta la visita final a los doce meses">
              <div className="longitudinal-heading"><span>Seguimiento del estudio</span><strong>12 meses ±1</strong></div>
              <svg viewBox="0 0 520 210" role="img" aria-labelledby="timeline-title timeline-desc">
                <title id="timeline-title">Línea temporal del estudio</title>
                <desc id="timeline-desc">Visita basal V0, seguimientos intermedios según la prioridad CMO y visita final VF a los doce meses.</desc>
                <path className="timeline-grid" d="M35 160H485 M35 60H485" />
                {/* Línea temporal neutra: el estudio no ha medido aún ningún resultado, no se dibuja tendencia. */}
                <path className="timeline-line" d="M45 110H475" />
                {([[45, 110, 'V0 · Basal'], [190, 110, 'Seguimiento'], [330, 110, 'Seguimiento'], [475, 110, 'VF · 12 m']] as const).map(([x, y, label], index) => (
                  <g key={index} className={`timeline-point timeline-point-${index + 1}`}>
                    <circle cx={x} cy={y} r="7" /><text x={x} y="190" textAnchor="middle">{label}</text>
                  </g>
                ))}
              </svg>
              <div className="longitudinal-meta"><span>Intensidad según prioridad CMO</span><span>IEXPAC en V0 y VF</span></div>
            </div>
          </div>
        </section>

        <section className="public-section" id="estudio" aria-labelledby="study-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">El estudio</p><h2 id="study-title">Atención farmacéutica CMO en coagulopatías congénitas</h2><p>{PROJECT_IDENTITY.name} evalúa la experiencia del paciente con coagulopatía congénita seguido con el Modelo de Atención Farmacéutica Capacidad-Motivación-Oportunidad.</p></div>
            <div className="value-grid">
              {STUDY_PILLARS.map(([number, title, copy]) => <article className="value-card" key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
            </div>
          </div>
        </section>

        <section className="public-section public-section-muted" aria-labelledby="features-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">Funcionalidades</p><h2 id="features-title">Un entorno integrado para el estudio</h2><p>Cada módulo guía el registro con las reglas del protocolo, y la base de datos aplica esas mismas reglas al guardar.</p></div>
            <div className="feature-grid">
              {FEATURES.map(([title, copy], index) => <article className="feature-card" key={title}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="process-title">
          <div className="public-container">
            <div className="section-heading"><p className="iris-eyebrow">Cómo funciona</p><h2 id="process-title">De la inclusión a la medición de resultados</h2><p>El recorrido de cada paciente en el estudio, desde la visita basal hasta la visita final.</p></div>
            <ol className="process-list">{PROCESS.map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}</ol>
          </div>
        </section>

        <section className="public-section cmo-section" id="modelo-cmo" aria-labelledby="cmo-title">
          <div className="public-container cmo-grid">
            <div>
              <p className="iris-eyebrow">Metodología CMO</p>
              <h2 id="cmo-title">Seguimiento adaptado a las necesidades de cada paciente</h2>
              <p>La estratificación aplica la adaptación del modelo CMO de la SEFH al paciente con coagulopatías congénitas (v2.0): 23 variables en cuatro dimensiones (demográfica, clínica, tratamiento y sociosanitaria) que asignan una prioridad y, con ella, la intensidad del seguimiento.</p>
              <p>La herramienta propone el nivel; el farmacéutico lo confirma y puede situar al paciente en un nivel superior justificándolo.</p>
            </div>
            <div>
              <div className="cmo-pillars" aria-label="Dimensiones de la metodología CMO"><span><strong>C</strong>Capacidad</span><span><strong>M</strong>Motivación</span><span><strong>O</strong>Oportunidad</span></div>
              <dl className="coamo-priority-list" aria-label="Niveles de prioridad del modelo">
                {PRIORITIES.map(([level, criterion, frequency]) => <div key={level}><dt>{level}</dt><dd>{criterion}</dd><dd>{frequency}</dd></div>)}
              </dl>
            </div>
          </div>
        </section>

        <section className="public-section" aria-labelledby="instruments-title">
          <div className="public-container product-grid">
            <div className="section-heading">
              <p className="iris-eyebrow">Resultados reportados por el paciente</p>
              <h2 id="instruments-title">Cuestionarios en la visita basal y en la final</h2>
              <p>Cada cuestionario se registra con su versión, modalidad de administración y origen (electrónico o papel). Las puntuaciones las calcula la base de datos solo cuando el instrumento documenta su método.</p>
            </div>
            <dl className="research-data">
              {INSTRUMENTS.map(([name, copy]) => <div key={name}><dt>{name}</dt><dd>{copy}</dd></div>)}
            </dl>
          </div>
        </section>

        <section className="public-section public-section-muted" id="investigacion" aria-labelledby="research-title">
          <div className="public-container research-grid">
            <div><p className="iris-eyebrow">Proyecto de investigación</p><h2 id="research-title">Del modelo asistencial a la práctica real.</h2><p className="research-title">{ref.projectTitle}</p></div>
            <dl className="research-data">
              {ref.principalInvestigator ? <div><dt>Promotor e investigador principal</dt><dd>{ref.principalInvestigator}{ref.principalInvestigatorUnit ? <><br /><span className="cell-muted">{ref.principalInvestigatorUnit}</span></> : null}</dd></div> : null}
              {ref.ethicsCommittee ? <div><dt>Comité de ética</dt><dd>{ref.ethicsCommittee}{ref.ethicsDecision && sessionDate ? <><br /><span className="cell-muted">{ref.ethicsDecision} · sesión de {sessionDate}</span></> : null}</dd></div> : null}
              {ref.ethicsApprovalCode ? <div><dt>Nº de registro</dt><dd className="numeric">{ref.ethicsApprovalCode}</dd></div> : null}
              <div><dt>Documentos aprobados</dt><dd>{[ref.protocolVersion, ref.informedConsentVersion].filter(Boolean).join(' · ')}</dd></div>
            </dl>
          </div>
        </section>

        <aside className="research-notice"><div className="public-container"><strong>Herramienta vinculada al estudio</strong><p>{PROJECT_IDENTITY.name} es la herramienta digital de recogida de datos del estudio. Los pacientes se registran seudonimizados y cada investigador accede solo a los de su centro asignado. El acceso está restringido a profesionales autorizados.</p></div></aside>

        <section className="access-section" id="acceso" aria-labelledby="auth-title">
          <div className="public-container access-grid">
            <div className="access-context"><p className="iris-eyebrow">Entorno profesional seguro</p><h2>Acceso restringido al estudio</h2><p>Accede al entorno de trabajo con las credenciales facilitadas para tu participación.</p><div className="responsible-note"><strong>Uso responsable</strong><p>{PROJECT_IDENTITY.name} apoya el registro estructurado y el seguimiento en el marco del estudio. Sus resultados deben ser interpretados por profesionales sanitarios cualificados y no sustituyen el juicio clínico individual.</p></div></div>
            <section className="auth-card" aria-labelledby="auth-title">
              <header className="auth-card-header"><p className="iris-eyebrow">{PROJECT_IDENTITY.name} · Área restringida</p><h2 id="auth-title">Acceso profesional</h2><p className="auth-supporting-copy">Acceso exclusivo para profesionales autorizados participantes en el estudio.</p></header>
              {checkingSession ? (
                <LoadingState label="Comprobando sesión activa..." />
              ) : resetMode ? (
                <form onSubmit={handlePasswordReset} className="form-grid">
                  <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="profesional@centro.es" /></label>
                  <button type="submit" className="button-block" disabled={loading}>{loading ? 'Enviando...' : 'Enviar enlace de recuperación'}</button>
                  <button type="button" className="button-secondary" onClick={() => { setResetMode(false); setResetMessage(null); setErrorMessage(null); }}>Volver al acceso</button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="form-grid">
                  <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="profesional@centro.es" /></label>
                  <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
                  <button type="submit" className="button-block" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
                  <button type="button" className="button-secondary" onClick={() => { setResetMode(true); setErrorMessage(null); }}>¿Has olvidado tu contraseña?</button>
                </form>
              )}
              {resetMessage ? <Notice tone="success">{resetMessage}</Notice> : null}
              {errorMessage ? <ErrorState title="No se pudo iniciar sesión" message={errorMessage} /> : null}
              <p className="auth-note"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" /></svg>Entorno profesional seguro</p>
            </section>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
