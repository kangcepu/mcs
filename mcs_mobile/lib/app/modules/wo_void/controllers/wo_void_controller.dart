import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../../data/models/work_order_model.dart';
import '../../../data/repositories/wo_operational_repository.dart';

class DateCount {
  final DateTime date;
  final int count;

  DateCount({required this.date, required this.count});
}

class WoVoidController extends GetxController {
  final WoOperationalRepository _repository = WoOperationalRepository();

  static const List<Map<String, String>> moduleFilters = [
    {'key': 'tb_wo_mtc_operational', 'label': 'WO MTC'},
    {'key': 'tb_wo_mtc', 'label': 'WO MESO'},
    {'key': 'tb_wo_it', 'label': 'WO IS'},
    {'key': 'tb_wo_ga', 'label': 'WO GA'},
    {'key': 'tb_wo_preventive', 'label': 'WO Pro'},
  ];

  final candidates = <WorkOrder>[].obs;
  final isLoading = false.obs;
  final voidingWoNumber = ''.obs;
  final isBulkVoiding = false.obs;
  final selectedModule = ''.obs;
  final selectedWoNumbers = <String>{}.obs;

  // Total WO yang SUDAH di-void, per tanggal AKSI VOID terjadi (key: yyyy-MM-dd).
  final voidHistory = <String, int>{}.obs;

  @override
  void onInit() {
    super.onInit();
    loadCandidates();
  }

  List<WorkOrder> get filteredCandidates {
    if (selectedModule.value.isEmpty) return candidates;
    return candidates
        .where((wo) => wo.sourceTable == selectedModule.value)
        .toList();
  }

  int countOf(String moduleKey) {
    if (moduleKey.isEmpty) return candidates.length;
    return candidates.where((wo) => wo.sourceTable == moduleKey).length;
  }

  void toggleModule(String moduleKey) {
    selectedModule.value = selectedModule.value == moduleKey ? '' : moduleKey;
  }

  // 8 kotak: 6 hari ke belakang + hari ini + besok (H-1).
  // Angka yang ditampilkan = total WO yang SUDAH di-void untuk tanggal itu.
  List<DateCount> get dateSummary {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final start = today.subtract(const Duration(days: 6));

    return List.generate(8, (i) {
      final day = start.add(Duration(days: i));
      final key = DateFormat('yyyy-MM-dd').format(day);
      return DateCount(date: day, count: voidHistory[key] ?? 0);
    });
  }

  void _bumpHistoryToday() {
    final key = DateFormat('yyyy-MM-dd').format(DateTime.now());
    voidHistory[key] = (voidHistory[key] ?? 0) + 1;
  }

  bool isSelected(String woNumber) => selectedWoNumbers.contains(woNumber);

  bool get allVisibleSelected {
    final visible = filteredCandidates;
    if (visible.isEmpty) return false;
    return visible.every((wo) => selectedWoNumbers.contains(wo.woNumber));
  }

  void toggleSelectOne(String woNumber) {
    if (selectedWoNumbers.contains(woNumber)) {
      selectedWoNumbers.remove(woNumber);
    } else {
      selectedWoNumbers.add(woNumber);
    }
  }

  void toggleSelectAllVisible() {
    final visible = filteredCandidates;
    if (allVisibleSelected) {
      for (final wo in visible) {
        selectedWoNumbers.remove(wo.woNumber);
      }
    } else {
      for (final wo in visible) {
        selectedWoNumbers.add(wo.woNumber);
      }
    }
  }

  Future<void> loadCandidates() async {
    try {
      isLoading.value = true;
      selectedWoNumbers.clear();
      final candidatesFuture = _repository.getVoidPreventiveCandidates();
      final historyFuture = _repository.getVoidHistory();
      candidates.assignAll(await candidatesFuture);
      voidHistory.assignAll(await historyFuture);
    } catch (error) {
      Get.snackbar(
          'Gagal memuat', error.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> voidWorkOrder(WorkOrder wo, String reason) async {
    if (voidingWoNumber.value.isNotEmpty || isBulkVoiding.value) return;
    try {
      voidingWoNumber.value = wo.woNumber;
      await _repository.voidPreventiveWo(woNumber: wo.woNumber, reason: reason);
      candidates.removeWhere((item) => item.woNumber == wo.woNumber);
      selectedWoNumbers.remove(wo.woNumber);
      _bumpHistoryToday();
      Get.snackbar('Berhasil', 'WO ${wo.woNumber} telah di-void',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
    } catch (error) {
      Get.snackbar(
          'Void gagal', error.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      voidingWoNumber.value = '';
    }
  }

  Future<void> voidSelected(String reason) async {
    if (selectedWoNumbers.isEmpty || isBulkVoiding.value) return;

    final targets =
        candidates.where((wo) => selectedWoNumbers.contains(wo.woNumber)).toList();

    isBulkVoiding.value = true;
    var successCount = 0;
    final failedWoNumbers = <String>[];

    for (final wo in targets) {
      try {
        voidingWoNumber.value = wo.woNumber;
        await _repository.voidPreventiveWo(woNumber: wo.woNumber, reason: reason);
        candidates.removeWhere((item) => item.woNumber == wo.woNumber);
        selectedWoNumbers.remove(wo.woNumber);
        _bumpHistoryToday();
        successCount++;
      } catch (_) {
        failedWoNumbers.add(wo.woNumber);
      }
    }

    voidingWoNumber.value = '';
    isBulkVoiding.value = false;

    if (failedWoNumbers.isEmpty) {
      Get.snackbar('Berhasil', '$successCount WO telah di-void',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
    } else {
      Get.snackbar(
        'Sebagian gagal',
        '$successCount berhasil, ${failedWoNumbers.length} gagal (${failedWoNumbers.join(', ')})',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
      );
    }
  }
}
