import {
  LayoutDashboard,
  ListTodo,
  ClipboardList,
  CalendarCheck2,
  Boxes,
  ArrowLeftRight,
  PackageSearch,
  CalendarRange,
  Database,
  FileBarChart2,
  Building2,
  ClipboardCheck,
  History,
  Contact,
  Factory,
  Gauge,
  Landmark,
  MapPin,
  MonitorCog,
  Smartphone,
  Palette,
  Paperclip,
  BookOpen,
  ShieldCheck,
  Tags,
  Timer,
  Users,
  Wrench,
  Truck,
  Zap,
  PackagePlus,
  ScanText,
  type LucideIcon,
} from "lucide-react";
import type { AreaKey } from "@/lib/permissions";
import { ENERGY_MODULE_ENABLED } from "@/lib/env";

export interface NavChild {
  label: string;
  href: string;
  icon: LucideIcon;
  area?: AreaKey;
}

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Area permission untuk menentukan visibilitas menu. */
  area?: AreaKey;
  children?: NavChild[];
  /** Cocokkan sebagai prefix path aktif. */
  match?: string;
  /** Menu baru yang belum ada fiturnya — tampil tapi membuka halaman "segera hadir". */
  comingSoon?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ENERGY_NAV_ITEMS: NavItem[] = ENERGY_MODULE_ENABLED
  ? [
      {
        label: "Energy & Utility",
        href: "/energy",
        icon: Zap,
        area: "energy",
        match: "/energy",
      },
    ]
  : [];

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "A. Workspace & Analytics",
    items: [
      {
        label: "My Work",
        href: "/my-work",
        icon: ListTodo,
        area: "myWork",
      },
      {
        label: "Dashboards",
        href: "/dashboard",
        icon: LayoutDashboard,
        area: "dashboard",
      },
      {
        label: "Governance",
        href: "/governance",
        icon: Landmark,
        children: [
          { label: "Energy Governance", href: "/governance", icon: Zap, area: "energy" },
          { label: "Preventive NCR", href: "/preventive-ncr", icon: ShieldCheck, area: "reports" },
        ],
      },
      {
        label: "Reports",
        href: "/reports/center?group=main",
        icon: FileBarChart2,
        match: "/reports",
        children: [
          { label: "Main Report", href: "/reports/center?group=main", icon: FileBarChart2, area: "reports" },
          { label: "NCR Report", href: "/reports/center?group=ncr", icon: ClipboardCheck, area: "reports" },
          { label: "Master Report", href: "/reports/center?group=master", icon: Boxes, area: "reports" },
        ],
      },
      {
        label: "KPI & Ratio",
        href: "/kpi-ratio",
        icon: Gauge,
        comingSoon: true,
      },
      {
        label: "Manual",
        href: "/manual",
        icon: BookOpen,
      },
      {
        label: "Mobile & Tablet",
        href: "/mcs-mobile",
        icon: Smartphone,
        match: "/mcs-mobile",
      },
    ],
  },
  {
    title: "B. Operations",
    items: [
      {
        label: "Daily Control",
        href: "/daily-control",
        icon: CalendarCheck2,
        area: "dailyControl",
      },
      {
        label: "Work Order",
        href: "/work-orders",
        icon: ClipboardList,
        area: "workOrders",
        match: "/work-orders",
        children: [
          { label: "MESO", href: "/work-orders?module=meso", icon: ClipboardCheck },
          { label: "Maintenance", href: "/work-orders?module=maintenance", icon: Wrench },
          { label: "Production", href: "/work-orders?module=production", icon: Factory },
          { label: "IS", href: "/work-orders?module=is", icon: MonitorCog },
          { label: "GA", href: "/work-orders?module=ga", icon: Building2 },
        ],
      },
      {
        label: "Sparepart Management",
        href: "/spareparts",
        icon: PackagePlus,
        area: "spareparts",
        match: "/spareparts",
      },
      {
        label: "Material Usage",
        href: "/material-usage",
        icon: PackageSearch,
        area: "materialUsage",
      },
      {
        label: "Fleet & Vehicle",
        href: "/fleet",
        icon: Truck,
        area: "fleet",
        match: "/fleet",
      },
      ...ENERGY_NAV_ITEMS,
      {
        label: "General Affair",
        href: "/general-affair",
        icon: Building2,
        area: "workOrders",
        match: "/general-affair",
      },
      {
        label: "Asset Management",
        href: "/assets",
        icon: Boxes,
        area: "assets",
        match: "/assets",
      },
      {
        label: "Preventive Schedule",
        href: "/preventive-schedules",
        icon: CalendarRange,
        area: "preventiveSchedules",
        match: "/preventive-schedules",
      },
      {
        label: "Asset Mutation",
        href: "/asset-mutations",
        icon: ArrowLeftRight,
        area: "assetMutations",
        match: "/asset-mutations",
      },
      {
        label: "Scheduler",
        href: "/scheduler",
        icon: Timer,
        area: "scheduler",
      },
      {
        label: "Stock Opname",
        href: "/stock-opname",
        icon: ClipboardCheck,
        area: "stockOpname",
        match: "/stock-opname",
      },
      {
        label: "AI Image Analysis",
        href: "/ai-image-analysis",
        icon: ScanText,
        area: "aiImageAnalysis",
        match: "/ai-image-analysis",
      },
    ],
  },
  {
    title: "C. Administration",
    items: [
      {
        label: "Master Data",
        href: "/master-data/company-structure",
        icon: Database,
        match: "/master-data",
        children: [
          {
            label: "Company Structure",
            href: "/master-data/company-structure",
            icon: Building2,
            area: "masterCompany",
          },
          {
            label: "Asset Category",
            href: "/master-data/asset-categories",
            icon: Tags,
            area: "masterAssetCategory",
          },
          {
            label: "Asset Location",
            href: "/master-data/asset-locations",
            icon: MapPin,
            area: "masterAssetLocation",
          },
          {
            label: "Asset Attachment Category",
            href: "/master-data/attachment-categories",
            icon: Paperclip,
            area: "masterAttachmentCategory",
          },
          {
            label: "Permission Group",
            href: "/master-data/permission-groups",
            icon: ShieldCheck,
            area: "masterPermissionGroup",
          },
          { label: "User", href: "/master-data/users", icon: Users, area: "masterUser" },
          {
            label: "User Alias",
            href: "/master-data/user-aliases",
            icon: Contact,
            area: "masterUserAlias",
          },
          {
            label: "System Settings",
            href: "/master-data/branding",
            icon: Palette,
            area: "masterBranding",
          },
          {
            label: "Endpoint Report Center",
            href: "/master-data/report-endpoints",
            icon: FileBarChart2,
            area: "masterUser",
          },
          {
            label: "Log Event",
            href: "/master-data/activity-log",
            icon: History,
            area: "masterUser",
          },
          {
            label: "Backup Database",
            href: "/master-data/db-backup",
            icon: Database,
            area: "masterBackup",
          },
          {
            label: "Release & Device Mobile",
            href: "/master-data/mobile-devices",
            icon: Smartphone,
            area: "masterMobileDevices",
          },
        ],
      },
    ],
  },
];

/** Daftar flat semua menu — dipertahankan untuk kode lama yang butuh iterasi tanpa section. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);
