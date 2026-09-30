import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
        {description && <p className="mt-1.5 text-sm leading-6 text-gray-600">{description}</p>}
        <div className="mt-6">{children}</div>
      </section>
      {footer && <div className="mt-6 text-center text-sm text-gray-600">{footer}</div>}
    </>
  );
}
