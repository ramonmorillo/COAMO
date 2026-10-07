// Pregunta Sí / No con tercera opción «Sin registrar» (NULL). Nunca se asume «No» por defecto.

type YesNoFieldProps = {
  name: string;
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  hint?: string;
  disabled?: boolean;
  yesLabel?: string;
  noLabel?: string;
};

export function YesNoField({ name, label, value, onChange, hint, disabled, yesLabel = 'Sí', noLabel = 'No' }: YesNoFieldProps) {
  const options: Array<{ key: string; label: string; v: boolean | null }> = [
    { key: 'yes', label: yesLabel, v: true },
    { key: 'no', label: noLabel, v: false },
    { key: 'na', label: 'Sin registrar', v: null },
  ];
  return (
    <fieldset className="coamo-fieldset">
      <legend>{label}</legend>
      {hint ? <p className="coamo-field-hint">{hint}</p> : null}
      <div className="coamo-radio-row">
        {options.map((option) => (
          <label key={option.key} className="radio-inline">
            <input
              type="radio"
              name={name}
              checked={value === option.v}
              onChange={() => onChange(option.v)}
              disabled={disabled}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
