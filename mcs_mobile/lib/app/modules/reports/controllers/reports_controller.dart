import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/routes/app_routes.dart';

enum ReportTarget {
  assets,
  listOfAssets,
  assetHistory,
  cetakQr,
  reportSo,
  recapWo,
  crystalWo,
}

class ReportItem {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final ReportTarget target;
  final bool nativeReady;
  final String permissionKey;
  final List<String> additionalPermissionKeys;
  final bool alwaysVisible;

  const ReportItem({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.target,
    this.nativeReady = true,
    this.permissionKey = '',
    this.additionalPermissionKeys = const [],
    this.alwaysVisible = false,
  });
}

class ReportsController extends GetxController {
  static const List<String> _assetKeys = ['list_of_asset', 'privilage_asset'];
  static const List<String> _recapKeys = [
    'recap_wo',
    'wo_mtc',
    'wo_mtc_all',
    'wo_operational',
    'wo_preventive',
    'wo_it',
    'wo_ga',
    'wo_cross_access',
  ];

  final List<ReportItem> _allReports = [
    const ReportItem(
      title: 'Report Assets',
      subtitle: 'Daftar asset dengan filter lengkap',
      icon: Icons.inventory_2_outlined,
      color: Color(0xFF6366F1),
      target: ReportTarget.assets,
      additionalPermissionKeys: _assetKeys,
    ),
    const ReportItem(
      title: 'List Of Asset',
      subtitle: 'Daftar asset perusahaan',
      icon: Icons.list_alt_outlined,
      color: Color(0xFF14B8A6),
      target: ReportTarget.listOfAssets,
      additionalPermissionKeys: _assetKeys,
    ),
    const ReportItem(
      title: 'Asset History',
      subtitle: 'Riwayat perawatan asset',
      icon: Icons.history_toggle_off,
      color: Color(0xFF0EA5E9),
      target: ReportTarget.assetHistory,
      additionalPermissionKeys: _assetKeys,
    ),
    const ReportItem(
      title: 'Cetak QR',
      subtitle: 'Label QR asset',
      icon: Icons.qr_code_2,
      color: Color(0xFF10B981),
      target: ReportTarget.cetakQr,
      additionalPermissionKeys: _assetKeys,
    ),
    const ReportItem(
      title: 'Report SO',
      subtitle: 'Laporan stock opname',
      icon: Icons.summarize_outlined,
      color: Color(0xFFF59E0B),
      target: ReportTarget.reportSo,
      permissionKey: 'report_so',
    ),
    const ReportItem(
      title: 'Recap Work Order',
      subtitle: 'Rekap WO semua modul',
      icon: Icons.assignment_outlined,
      color: Color(0xFFEF4444),
      target: ReportTarget.recapWo,
      additionalPermissionKeys: _recapKeys,
    ),
    const ReportItem(
      title: 'Crystal Report WO',
      subtitle: 'Template crystal report',
      icon: Icons.description_outlined,
      color: Color(0xFF8B5CF6),
      target: ReportTarget.crystalWo,
      nativeReady: false,
      permissionKey: 'report_cr',
    ),
  ];

  final RxList<ReportItem> reports = <ReportItem>[].obs;

  @override
  void onInit() {
    super.onInit();
    loadReportsByPermission();
  }

  Future<void> loadReportsByPermission() async {
    final prefs = await SharedPreferences.getInstance();

    bool canShow(ReportItem item) {
      if (item.alwaysVisible) {
        return true;
      }
      final keys = <String>[
        if (item.permissionKey.isNotEmpty) item.permissionKey,
        ...item.additionalPermissionKeys.where((k) => k.trim().isNotEmpty),
      ];
      if (keys.isEmpty) {
        return true;
      }
      return keys.any((key) => (prefs.getInt(key) ?? 0) == 1);
    }

    reports.value = _allReports.where(canShow).toList();
  }

  Future<void> openReport(ReportItem item) async {
    switch (item.target) {
      case ReportTarget.reportSo:
        Get.toNamed(AppRoutes.reportSo);
        return;
      case ReportTarget.recapWo:
        Get.toNamed(AppRoutes.reportWoRecap);
        return;
      case ReportTarget.assets:
        Get.toNamed(AppRoutes.reportAsset,
            arguments: {'report': 'assets', 'title': item.title});
        return;
      case ReportTarget.listOfAssets:
        Get.toNamed(AppRoutes.reportAsset,
            arguments: {'report': 'list-of-assets', 'title': item.title});
        return;
      case ReportTarget.assetHistory:
        Get.toNamed(AppRoutes.reportAssetHistory);
        return;
      case ReportTarget.cetakQr:
        Get.toNamed(AppRoutes.reportQr);
        return;
      case ReportTarget.crystalWo:
        _showNativeUnavailable(item.title);
        return;
    }
  }

  String actionLabel(ReportItem item) {
    if (!item.nativeReady) {
      return 'Segera Hadir';
    }
    return 'Buka Halaman';
  }

  void _showNativeUnavailable(String title) {
    Get.snackbar(
      'Belum tersedia',
      '"$title" belum tersedia versi native mobile.',
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: const Color(0xFF374151),
      colorText: Colors.white,
      duration: const Duration(seconds: 3),
    );
  }
}
