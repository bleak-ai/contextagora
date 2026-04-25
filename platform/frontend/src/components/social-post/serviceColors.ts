/** Inline text-color class for a service display-name. Unknown → amber. */
export function serviceTextClass(name: string): string {
  const key = name.trim().toLowerCase();
  switch (key) {
    case "linear":
      return "text-[#5e6ad2] font-bold";
    case "supabase":
      return "text-[#2aaf74] font-bold";
    case "notion":
      return "text-[#0f172a] font-bold";
    case "slack":
      return "text-[#611f69] font-bold";
    case "github":
      return "text-[#24292f] font-bold";
    default:
      return "text-amber-500 font-bold";
  }
}

export function serviceDotClass(name: string): string {
  const key = name.trim().toLowerCase();
  switch (key) {
    case "linear":
      return "bg-[#5e6ad2]";
    case "supabase":
      return "bg-[#2aaf74]";
    case "notion":
      return "bg-[#0f172a]";
    case "slack":
      return "bg-[#611f69]";
    case "github":
      return "bg-[#24292f]";
    default:
      return "bg-amber-400";
  }
}

const SERVICE_HEX: Record<string, string> = {
  linear: "#5e6ad2",
  supabase: "#2aaf74",
  notion: "#0f172a",
  slack: "#611f69",
  github: "#24292f",
};

export function serviceHex(name: string, fallback: string): string {
  return SERVICE_HEX[name.trim().toLowerCase()] ?? fallback;
}
