type BrandMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

// Isotipo provisional de COAMO (monograma). Las clases iris-mark-* proceden de la hoja de estilos
// compartida con DERMAPEX; el color de marca de COAMO se fija en styles/coamo.css.
export function BrandMark({ size = 28, className, title }: BrandMarkProps) {
  return (
    <svg
      className={['iris-mark', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <rect className="iris-mark-bg" width="32" height="32" rx="8" />
      <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif">
        C
      </text>
    </svg>
  );
}
