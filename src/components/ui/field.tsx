import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 shadow-xs placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-1 focus:outline-indigo-600";

export function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <ul id={id} className="space-y-0.5 text-sm text-red-700">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  errors?: string[];
  /** Rendered to the right of the label, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  children?: ReactNode;
};

export function Field({ label, name, errors, labelAside, children, id, className, ...inputProps }: FieldProps) {
  const inputId = id ?? name;
  const errorId = `${inputId}-errors`;
  const invalid = Boolean(errors?.length);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-800">
          {label}
        </label>
        {labelAside}
      </div>
      <input
        id={inputId}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={`${inputClass} ${invalid ? "border-red-400" : "border-gray-300"} ${className ?? ""}`}
        {...inputProps}
      />
      {children}
      <FieldErrors id={errorId} errors={errors} />
    </div>
  );
}
