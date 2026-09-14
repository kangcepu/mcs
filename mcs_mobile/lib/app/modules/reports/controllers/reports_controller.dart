import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/routes/app_routes.dart';

enum ReportTarget {
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
  final List<ReportItem> _allReports = [
    const ReportItem(
      title: 'Asset History',
      subtitle: 'Riwayat perawatan asset',
      icon: Icons.history_toggle_off,
      color: Color(0xFF0EA5E9),
      target: ReportTarget.assetHistory,
      nativeReady: false,
      permissionKey: 'report_asset_history',
    ),
    const ReportItem(
      title: 'Cetak QR',
      subtitle: 'Cetak QR asset',
      icon: Icons.qr_code_2,
      color: Color(0xFF10B981),
      target: ReportTarget.cetakQr,
      nativeReady: false,
      permissionKey: 'report_asset_history',
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
      subtitle: 'Rekap WO maintenance',
      icon: Icons.assignment_outlined,
      color: Color(0xFFEF4444),
      target: ReportTarget.recapWo,
      permissionKey: 'recap_wo',
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
      case ReportTarget.assetHistory:
      case ReportTarget.cetakQr:
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
