import Link from "next/link";
import {
  BookOpen,
  Headphones,
  Mic,
  PenLine,
  Library,
  ClipboardCheck,
  FileDown,
  Settings,
  Home,
} from "lucide-react";

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/resources", label: "资源", icon: Library },
  { href: "/listen", label: "听", icon: Headphones },
  { href: "/speak/drill", label: "说", icon: Mic },
  { href: "/read", label: "读", icon: BookOpen },
  { href: "/write/practice", label: "写", icon: PenLine },
  { href: "/notebook", label: "Notebook", icon: BookOpen },
  { href: "/assessment", label: "测试", icon: ClipboardCheck },
  { href: "/export/commute", label: "通勤", icon: FileDown },
  { href: "/settings", label: "设置", icon: Settings },
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex items-center gap-2 overflow-x-auto px-4 py-3">
        <Link href="/" className="mr-4 shrink-0 text-lg font-bold text-primary">
          LangTube
        </Link>
        <nav className="flex gap-1">
          {navItems.slice(1).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
