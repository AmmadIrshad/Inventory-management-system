export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" className="size-7 text-indigo-600" fill="none" aria-hidden>
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" fill="currentColor" opacity=".15" />
        <path d="M12 2 3 7l9 5 9-5-9-5Zm-9 5v10l9 5V12M21 7v10l-9 5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      Inventory
    </span>
  );
}
