import type { ReactNode } from "react";
import type { User } from "../../types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: ReactNode;
}

export function Layout({ user, onLogout, children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar user={user} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar user={user} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto bg-bg px-6 py-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

