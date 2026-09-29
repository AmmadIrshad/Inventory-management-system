import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { requireUser } from "@/lib/auth/dal";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Pages repeat this check; a layout alone doesn't protect its children.
  const { user } = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/">
            <Logo className="text-gray-900" />
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium text-gray-600">
            <Link href="/" className="hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/settings/security" className="hover:text-gray-900">
              Security
            </Link>
            <span className="hidden text-gray-400 sm:inline" aria-hidden>
              |
            </span>
            <span className="hidden text-gray-900 sm:inline">{user.name}</span>
            <form action={logout}>
              <button type="submit" className="hover:text-gray-900">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
    </div>
  );
}
