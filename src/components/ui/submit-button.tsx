"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingText = "Please wait…",
  variant = "primary",
  fullWidth = false,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={buttonClass(variant, fullWidth ? "w-full" : "")}
    >
      {pending ? pendingText : children}
    </button>
  );
}
