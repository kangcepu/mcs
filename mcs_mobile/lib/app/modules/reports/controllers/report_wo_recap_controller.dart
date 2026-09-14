import 'package:get/get.dart';

import '../../../core/routes/app_routes.dart';
import '../../../data/repositories/wo_mtc_repository.dart';
import '../../../data/repositories/wo_operational_repository.dart';
import '../../../data/repositories/wo_repository.dart';

class ReportWoRecapController extends GetxController {
  final WoRepository _woRepository = WoRepository();
  final WoMtcRepository _woMtcRepository = WoMtcRepository();
  final WoOperationalRepository _woOperationalRepository =
      WoOperationalRepository();

  final isLoading = false.obs;

  final itStats = <String, int>{}.obs;
  final mesoStats = <String, int>{}.obs;
  final mtcStats = <String, int>{}.obs;

  @override
  void onInit() {
    super.onInit();
    loadRecap();
  }

  Future<void> refreshData() async {
    await loadRecap();
  }

  Future<void> loadRecap() async {
    try {
      isLoading.value = true;

      final results = await Future.wait<Map<String, dynamic>?>([
        _safeCall(() => _woRepository.getDashboardStats(company: 'ALL')),
        _safeCall(() => _woMtcRepository.getDashboardStats(company: 'ALL')),
        _safeCall(
            () => _woOperationalRepository.getDashboardStats(company: 'ALL')),
      ]);

      itStats.assignAll(_normalizeStats(results[0]));
      mesoStats.assignAll(_normalizeStats(results[1]));
      mtcStats.assignAll(_normalizeStats(results[2]));
    } finally {
      isLoading.value = false;
    }
  }

  Future<Map<String, dynamic>?> _safeCall(
      Future<Map<String, dynamic>> Function() fn) async {
    try {
      return await fn();
    } catch (_) {
      return null;
    }
  }

  Map<String, int> _normalizeStats(Map<String, dynamic>? raw) {
    final source = _extractPayload(raw);
    return {
      'open': _toInt(source['open']),
      'in_progress': _toInt(source['in_progress']),
      'closed': _toInt(source['closed']),
      'total': _toInt(source['total']),
    };
  }

  Map<String, dynamic> _extractPayload(Map<String, dynamic>? raw) {
    if (raw == null) return {};
    final data = raw['data'];
    if (data is Map<String, dynamic>) {
      return data;
    }
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    return raw;
  }

  int _toInt(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    if (value is double) return value.toInt();
    return int.tryParse(value.toString()) ?? 0;
  }

  int get totalAll =>
      _toInt(itStats['total']) +
      _toInt(mesoStats['total']) +
      _toInt(mtcStats['total']);

  void openModule(String module) {
    switch (module) {
      case 'IT':
        Get.toNamed(AppRoutes.woList, arguments: {'moduleTitle': 'WO ITIS'});
        return;
      case 'MESO':
        Get.toNamed(AppRoutes.woMtcList, arguments: {'moduleTitle': 'WO MESO'});
        return;
      default:
        Get.toNamed(
          AppRoutes.woOperationalList,
          arguments: {'moduleTitle': 'WO MTC'},
        );
        return;
    }
  }
}
