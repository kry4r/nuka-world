"use client";

import Sidebar from "./Sidebar";

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 h-screen overflow-y-auto bg-nuka-page">
        {children}
      </main>
    </div>
  );
}
