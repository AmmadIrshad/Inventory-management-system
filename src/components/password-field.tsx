"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Field } from "@/components/ui/field";
import type { PasswordStrength } from "@/lib/password-strength";

type StrengthModule = typeof import("@/lib/password-strength");

const LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;
const COLORS = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"] as const;

/**
 * Password input with a live strength meter. The zxcvbn dictionaries (~1 MB) are only
 * downloaded once the user starts typing. The server repeats the same check on submit.
 */
export function PasswordField({
  label,
  name,
  errors,
  userInputs = [],
  relatedFieldNames = [],
}: {
  label: string;
  name: string;
  errors?: string[];
  /** Words the password must not be built from (name, email...). */
  userInputs?: string[];
  /** Other inputs in the same form whose current values count as user inputs. */
  relatedFieldNames?: string[];
}) {
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  const [visible, setVisible] = useState(false);
  const moduleRef = useRef<Promise<StrengthModule> | null>(null);
  const latestRequest = useRef(0);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const password = event.currentTarget.value;
    const form = event.currentTarget.form;
    const requestId = ++latestRequest.current;

    if (!password) {
      setStrength(null);
      return;
    }

    const related = relatedFieldNames.map((fieldName) => {
      const element = form?.elements.namedItem(fieldName);
      return element instanceof HTMLInputElement ? element.value : "";
    });

    moduleRef.current ??= import("@/lib/password-strength");
    const { checkPasswordStrength } = await moduleRef.current;
    if (requestId === latestRequest.current) {
      setStrength(checkPasswordStrength(password, [...userInputs, ...related]));
    }
  }

  return (
    <Field
      label={label}
      name={name}
      type={visible ? "text" : "password"}
      autoComplete="new-password"
      required
      errors={errors}
      onChange={handleChange}
      labelAside={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
    >
      {strength && (
        <div className="space-y-1.5 pt-1" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((segment) => (
              <span
                key={segment}
                className={`h-1.5 flex-1 rounded-full ${segment < Math.max(strength.score, 1) ? COLORS[strength.score] : "bg-gray-200"}`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600">
            Strength: <span className="font-medium text-gray-900">{LABELS[strength.score]}</span>
            {strength.isStrong && " ✓"}
          </p>
          {!strength.isStrong && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-600">
              {strength.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}
