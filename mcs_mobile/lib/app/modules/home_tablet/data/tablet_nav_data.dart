import 'package:flutter/material.dart';
import '../../../core/routes/app_routes.dart';

/// Struktur + urutan sidebar tablet — 1:1 dengan `NAV_SECTIONS` di
/// `mcs_web/src/components/layout/nav.tsx` (section, label, urutan, grouping,
/// ikon semantik yang sama). `route` null berarti modul itu belum di-port
/// native ke tablet (placeholder "coming soon") — struktur menu tetap
/// ditampilkan persis seperti web, hanya kontennya yang menyusul bertahap.
class TabletNavChild {
  final String title;
  final IconData icon;
  final String? route;
  const TabletNavChild({required this.title, required this.icon, this.route});
}

class TabletNavItem {
  final String key;
  final String title;
  final IconData icon;
  final String? route;
  final List<TabletNavChild>? children;
  /// Menu baru yang belum ada fiturnya sama sekali (bukan sekadar belum
  /// di-port) — tampil dengan badge "Segera" seperti `comingSoon` di web.
  final bool comingSoon;
  const TabletNavItem({
    required this.key,
    required this.title,
    required this.icon,
    this.route,
    this.children,
    this.comingSoon = false,
  });
}

class TabletNavSection {
  final String title;
  final List<TabletNavItem> items;
  const TabletNavSection({required this.title, required this.items});
}

const String kTabletDashboardKey = 'dashboard';

final List<TabletNavSection> tabletNavSections = [
  TabletNavSection(
    title: 'A. Workspace & Analytics',
    items: [
      const TabletNavItem(
        key: 'my_work',
        title: 'My Work',
        icon: Icons.checklist_outlined, // ListTodo
      ),
      const TabletNavItem(
        key: kTabletDashboardKey,
        title: 'Dashboards',
        icon: Icons.dashboard_outlined, // LayoutDashboard
      ),
      const TabletNavItem(
        key: 'governance',
        title: 'Governance',
        icon: Icons.account_balance_outlined, // Landmark
        comingSoon: true,
      ),
      TabletNavItem(
        key: 'report',
        title: 'Reports',
        icon: Icons.bar_chart_outlined, // FileBarChart2
        children: const [
          TabletNavChild(title: 'Report Assets', icon: Icons.description_outlined, route: AppRoutes.reportAsset), // FileText
          TabletNavChild(title: 'Asset History', icon: Icons.history_outlined, route: AppRoutes.reportAssetHistory), // ClipboardList
          TabletNavChild(title: 'Cetak QR', icon: Icons.qr_code_outlined, route: AppRoutes.reportQr), // FileBarChart2
          TabletNavChild(title: 'Report Stock Opname', icon: Icons.inventory_outlined, route: AppRoutes.reportSo), // PackageSearch
          TabletNavChild(title: 'List Of Asset', icon: Icons.inventory_2_outlined, route: AppRoutes.reportAsset), // Boxes
          TabletNavChild(title: 'Recap Work Order', icon: Icons.summarize_outlined, route: AppRoutes.reportWoRecap), // ClipboardCheck
        ],
      ),
      const TabletNavItem(
        key: 'kpi_ratio',
        title: 'KPI & Ratio',
        icon: Icons.speed_outlined, // Gauge
        comingSoon: true,
      ),
      const TabletNavItem(
        key: 'manual',
        title: 'Manual',
        icon: Icons.menu_book_outlined, // BookOpen
        comingSoon: true,
      ),
      const TabletNavItem(
        key: 'mcs_mobile',
        title: 'Mobile & Tablet',
        icon: Icons.smartphone_outlined, // Smartphone
      ),
    ],
  ),
  TabletNavSection(
    title: 'B. Operasional',
    items: [
      TabletNavItem(
        key: 'work_order',
        title: 'Work Order',
        icon: Icons.assignment_outlined, // ClipboardList
        // Di web, kelima anak ini bukan 5 layar terpisah — mereka cuma
        // `?module=` di SATU halaman `/work-orders` yang sama. `route: null`
        // di sini supaya tap-nya inline (ganti tab modul di TabletWorkOrdersPage),
        // bukan Get.toNamed ke layar list gaya HP yang terpisah.
        children: const [
          TabletNavChild(title: 'MESO', icon: Icons.fact_check_outlined), // ClipboardCheck
          TabletNavChild(title: 'Maintenance', icon: Icons.build_outlined), // Wrench
          TabletNavChild(title: 'Production', icon: Icons.precision_manufacturing_outlined), // Factory
          TabletNavChild(title: 'IS', icon: Icons.dns_outlined), // MonitorCog
          TabletNavChild(title: 'GA', icon: Icons.apartment_outlined), // Building2
        ],
      ),
      const TabletNavItem(
        key: 'daily_control',
        title: 'Daily Control',
        icon: Icons.event_available_outlined, // CalendarCheck2
        route: AppRoutes.dailyControl,
      ),
      const TabletNavItem(
        key: 'preventive_schedule',
        title: 'Preventive Schedule',
        icon: Icons.event_repeat_outlined, // CalendarRange
      ),
      // route: null — "Asset Manage" (href web `/assets`) dirender inline
      // native (TabletAssetManagePage), BUKAN layar "Report Assets"
      // (`AppRoutes.reportAsset`, halaman web yang beda: `/reports/assets`)
      // yang kepakai di sini sebelumnya.
      const TabletNavItem(
        key: 'asset_manage',
        title: 'Asset Manage',
        icon: Icons.inventory_2_outlined, // Boxes
      ),
      const TabletNavItem(
        key: 'asset_mutation',
        title: 'Mutasi Aset',
        icon: Icons.compare_arrows_outlined, // ArrowLeftRight
        route: AppRoutes.reportAssetMutation,
      ),
      const TabletNavItem(
        key: 'material_usage',
        title: 'Material Usage',
        icon: Icons.inventory_outlined, // PackageSearch
      ),
    ],
  ),
  TabletNavSection(
    title: 'C. Kontrol',
    items: [
      // route: null — dirender inline native (TabletApprovalCenterPage),
      // bukan layar approval gaya HP (AppRoutes.approval) yang kepakai
      // sebelumnya.
      const TabletNavItem(
        key: 'approval_center',
        title: 'Approval Center',
        icon: Icons.verified_outlined, // BadgeCheck
      ),
      const TabletNavItem(
        key: 'void_center',
        title: 'Void Center',
        icon: Icons.block_outlined, // Ban
        route: AppRoutes.woVoid,
      ),
    ],
  ),
  TabletNavSection(
    title: 'D. Administrasi',
    items: [
      TabletNavItem(
        key: 'master_data',
        title: 'Master Data',
        icon: Icons.storage_outlined, // Database
        children: const [
          TabletNavChild(title: 'Company Structure', icon: Icons.apartment_outlined), // Building2
          TabletNavChild(title: 'Asset Category', icon: Icons.sell_outlined), // Tags
          TabletNavChild(title: 'Asset Location', icon: Icons.location_on_outlined), // MapPin
          TabletNavChild(title: 'Kategori Lampiran Aset', icon: Icons.attach_file_outlined), // Paperclip
          TabletNavChild(title: 'Permission Group', icon: Icons.shield_outlined), // ShieldCheck
          TabletNavChild(title: 'User', icon: Icons.group_outlined), // Users
          TabletNavChild(title: 'User Alias', icon: Icons.contacts_outlined), // Contact
          TabletNavChild(title: 'Branding & Storage', icon: Icons.palette_outlined), // Palette
          TabletNavChild(title: 'Log Event', icon: Icons.history_outlined), // History
          TabletNavChild(title: 'Jadwal Preventive (Cron)', icon: Icons.timer_outlined), // Timer
          TabletNavChild(title: 'Backup Database', icon: Icons.backup_outlined), // Database
          TabletNavChild(title: 'Release & Device Mobile', icon: Icons.smartphone_outlined), // Smartphone
        ],
      ),
    ],
  ),
];

/// Daftar flat semua menu — dipertahankan untuk kode lama yang butuh iterasi
/// tanpa section (mis. pencarian item berdasarkan key).
List<TabletNavItem> get tabletNavItems => tabletNavSections.expand((s) => s.items).toList();
