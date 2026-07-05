import {
  LayoutDashboard,
  Users,
  FolderKanban,
  FileText,
  Settings,
  PhoneCall,
  PenTool,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",  href: "/",        icon: LayoutDashboard },
  { label: "Leads",      href: "/leads",    icon: Users },
  { label: "Projects",   href: "/projects", icon: FolderKanban },
  { label: "Quotes",     href: "/quotes",   icon: FileText },
  { label: "AI Calling", href: "/crm",      icon: PhoneCall },
  { label: "Design",     href: "/design",   icon: PenTool },
  { label: "Settings",   href: "/settings", icon: Settings },
]

export const MOBILE_NAV: NavItem[] = [
  { label: "Home",     href: "/",        icon: LayoutDashboard },
  { label: "Leads",    href: "/leads",   icon: Users },
  { label: "Projects", href: "/projects",icon: FolderKanban },
  { label: "Quotes",   href: "/quotes",  icon: FileText },
  { label: "Calling",  href: "/crm",     icon: PhoneCall },
  { label: "Design",   href: "/design",  icon: PenTool },
]