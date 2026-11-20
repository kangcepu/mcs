import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/routes/app_routes.dart';
import '../../../core/widgets/pdf_viewer_page.dart';
import '../../../data/repositories/report_center_repository.dart';

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
  final ReportCenterRepository _reportCenter = ReportCenterRepository();
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
  final RxList<ExternalReportItem> externalReports = <ExternalReportItem>[].obs;
  final RxBool loadingExternal = false.obs;
  final RxString externalError = ''.obs;
  final RxString reportSearch = ''.obs;
  final RxString reportCategory = ''.obs;
  final RxBool generating = false.obs;
  final RxInt generationProgress = 0.obs;
  final RxString generationStatus = ''.obs;

  String externalReportGroup(ExternalReportItem report) {
    final text =
        '${report.reportType} ${report.title} ${report.category}'.toLowerCase();
    if (RegExp(r'\bncr\b|non[ -]?conform|ketidaksesuaian').hasMatch(text)) {
      return 'ncr';
    }
    if (RegExp(
            r'\bmaster\b|\bcatalog(?:ue)?\b|\bkatalog\b|\bmapping\b|\bcategories\b|\bkategori\b|\blocations\b|\blokasi\b|warehouse|rack\s*/\s*bin')
        .hasMatch(text)) {
      return 'master';
    }
    return 'main';
  }

  List<String> externalCategoriesFor(String group) {
    final values = externalReports
        .where((item) => externalReportGroup(item) == group)
        .map((item) => item.category)
        .toSet()
        .toList();
    values.sort();
    return values;
  }

  List<ExternalReportItem> filteredExternalReportsFor(String group) {
    final query = reportSearch.value.trim().toLowerCase();
    return externalReports.where((item) {
      if (externalReportGroup(item) != group) return false;
      final matchesCategory =
          reportCategory.value.isEmpty || item.category == reportCategory.value;
      final text =
          '${item.title} ${item.description} ${item.category}'.toLowerCase();
      return matchesCategory && (query.isEmpty || text.contains(query));
    }).toList();
  }

  @override
  void onInit() {
    super.onInit();
    loadReportsByPermission();
    loadExternalReports();
  }

  Future<void> loadExternalReports() async {
    loadingExternal.value = true;
    externalError.value = '';
    try {
      externalReports.assignAll(await _reportCenter.catalog());
    } catch (error) {
      externalError.value = error.toString().replaceFirst('Exception: ', '');
    } finally {
      loadingExternal.value = false;
    }
  }

  Future<ReportFilterOptions> loadFilterOptions(
      ExternalReportItem report, Map<String, String> params) {
    return _reportCenter.filterOptions(report, params);
  }

  Future<void> previewExternalReport(
      ExternalReportItem report, Map<String, String> params) async {
    if (generating.value) return;
    generating.value = true;
    generationProgress.value = 0;
    generationStatus.value = 'QUEUED';
    try {
      final generated = await _reportCenter.generate(
        report,
        params,
        onProgress: (progress, status) {
          generationProgress.value = progress ?? generationProgress.value;
          generationStatus.value = status;
        },
      );
      Get.back();
      await Get.to(() => PdfViewerPage(
            title: generated.filename,
            bytes: generated.bytes,
          ));
    } catch (error) {
      Get.snackbar(
        'Report gagal dibuat',
        error.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFFEE2E2),
        colorText: const Color(0xFF991B1B),
      );
    } finally {
      generating.value = false;
      generationProgress.value = 0;
      generationStatus.value = '';
    }
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
