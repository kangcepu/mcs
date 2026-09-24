import {
  LayoutDashboard,
  ClipboardList,
  CalendarCheck2,
  Boxes,
  ArrowLeftRight,
  PackageSearch,
  BadgeCheck,
  Ban,
  CalendarRange,
  Database,
  FileBarChart2,
  Building2,
  ClipboardCheck,
  History,
  Contact,
  Factory,
  FileText,
  MapPin,
  MonitorCog,
  Smartphone,
  Palette,
  Paperclip,
  ShieldCheck,
  Tags,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { AreaKey } from "@/lib/permissions";

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
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    area: "dashboard",
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
    label: "Daily Control",
    href: "/daily-control",
    icon: CalendarCheck2,
    area: "dailyControl",
  },
  {
    label: "Asset Manage",
    href: "/assets",
    icon: Boxes,
    area: "assets",
    match: "/assets",
  },
  {
    label: "Mutasi Aset",
    href: "/asset-mutations",
    icon: ArrowLeftRight,
    area: "assetMutations",
    match: "/asset-mutations",
  },
  {
    label: "Material Usage",
    href: "/material-usage",
    icon: PackageSearch,
    area: "materialUsage",
  },
  {
    label: "Approval Center",
    href: "/approval-center",
    icon: BadgeCheck,
    area: "approvalCenter",
  },
  {
    label: "Void Center",
    href: "/void-center",
    icon: Ban,
    area: "voidCenter",
  },
  {
    label: "Preventive Schedule",
    href: "/preventive-schedules",
    icon: CalendarRange,
    area: "preventiveSchedules",
    match: "/preventive-schedules",
  },
  {
    label: "MCS Mobile",
    href: "/mcs-mobile",
    icon: Smartphone,
    match: "/mcs-mobile",
  },
  {
    label: "Report",
    href: "/reports/assets",
    icon: FileBarChart2,
    match: "/reports",
    children: [
      { label: "Report Assets", href: "/reports/assets", icon: FileText, area: "reports" },
      { label: "Asset History", href: "/reports/assets-history", icon: ClipboardList, area: "reports" },
      { label: "Cetak QR", href: "/reports/qr", icon: FileBarChart2, area: "reports" },
      {
        label: "Report Stock Opname",
        href: "/reports/stock-opname",
        icon: PackageSearch,
        area: "reports",
      },
      { label: "List Of Asset", href: "/reports/list-of-assets", icon: Boxes, area: "reports" },
      {
        label: "Recap Work Order",
        href: "/reports/recap-work-orders",
        icon: ClipboardCheck,
        area: "reportsRecapWo",
      },
    ],
  },
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
        label: "Kategori Lampiran Aset",
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
        label: "Branding & Storage",
        href: "/master-data/branding",
        icon: Palette,
        area: "masterBranding",
      },
      {
        label: "Activity Log",
        href: "/master-data/activity-log",
        icon: History,
        area: "masterUser",
      },
    ],
  },
];
