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

// "Design" points at /projects, not a bare /design — visiting /design with
// no ?projectId= used to auto-create a brand-new blank project every
// single time (see hooks/useDesignProjectLoader.ts), so every click on
// this nav item left behind another empty "New Client" project. Projects
// already has its own "+ New Project" button that creates exactly one
// project and links into the designer with a real projectId.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",  href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads",      href: "/leads",    icon: Users },
  { label: "Projects",   href: "/projects", icon: FolderKanban },
  { label: "Quotes",     href: "/quotes",   icon: FileText },
  { label: "AI Calling", href: "/crm",      icon: PhoneCall },
  // { label: "Design",     href: "/projects", icon: PenTool },
  { label: "Settings",   href: "/settings", icon: Settings },
]

export const MOBILE_NAV: NavItem[] = [
  { label: "Home",     href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads",    href: "/leads",   icon: Users },
  { label: "Projects", href: "/projects",icon: FolderKanban },
  { label: "Quotes",   href: "/quotes",  icon: FileText },
  { label: "Calling",  href: "/crm",     icon: PhoneCall },
  // { label: "Design",   href: "/projects",icon: PenTool },
  { label: "Settings",   href: "/settings", icon: Settings },

]