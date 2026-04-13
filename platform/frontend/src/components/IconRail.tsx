import { Link, useLocation } from "@tanstack/react-router";

export function IconRail() {
  const location = useLocation();
  const isChat = location.pathname === "/";
  const isModules = location.pathname === "/modules";
  const isBenchmarks = location.pathname.startsWith("/benchmarks");

  return (
    <nav className="w-12 flex-shrink-0 border-r border-border bg-bg-raised flex flex-col items-center py-3 gap-1 h-full">
      {/* Logo */}
      <div className="w-8 h-8 mb-3">
        <img src="/favicon-mark.webp" alt="ContextAgora" className="w-full h-full object-contain" />
      </div>

      {/* Chat */}
      <Link
        to="/"
        title="Chat"
        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          isChat ? "bg-accent/25" : "hover:bg-bg-hover"
        }`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isChat ? "var(--color-accent)" : "var(--color-text-secondary)"}
          strokeWidth="2"
        >
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </Link>

      {/* Modules */}
      <Link
        to="/modules"
        title="Modules"
        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          isModules ? "bg-accent/25" : "hover:bg-bg-hover"
        }`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isModules ? "var(--color-accent)" : "var(--color-text-secondary)"}
          strokeWidth="2"
        >
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      </Link>

      {/* Benchmarks */}
      <Link
        to="/benchmarks"
        title="Benchmarks"
        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          isBenchmarks ? "bg-accent/25" : "hover:bg-bg-hover"
        }`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke={
            isBenchmarks
              ? "var(--color-accent)"
              : "var(--color-text-secondary)"
          }
          strokeWidth="2"
        >
          <path d="M3 3v18h18" />
          <path d="M7 15l4-4 4 4 5-5" />
        </svg>
      </Link>

      {/* Spacer for future icons */}
      <div className="flex-1" />
    </nav>
  );
}
