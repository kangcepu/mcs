import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/routes/app_routes.dart';
import '../../../data/repositories/report_so_repository.dart';

class ReportSoController extends GetxController {
  final ReportSoRepository _repository = ReportSoRepository();

  final isLoading = false.obs;
  final errorMessage = ''.obs;
  final rows = <Map<String, dynamic>>[].obs;

  final noSoController = TextEditingController();
  final selectedType = ''.obs;
  final startDate = ''.obs; // yyyy-MM-dd
  final endDate = ''.obs; // yyyy-MM-dd

  @override
  void onInit() {
    super.onInit();
    fetchList();
  }

  @override
  void onClose() {
    noSoController.dispose();
    super.onClose();
  }

  Future<void> fetchList() async {
    try {
      isLoading.value = true;
      errorMessage.value = '';
      final result = await _repository.getList(
        noSo: noSoController.text.trim(),
        type: selectedType.value,
        startDate: startDate.value,
        endDate: endDate.value,
      );
      if (result['status'] == true) {
        rows.assignAll(
          (result['rows'] as List<dynamic>)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList(),
        );
      } else {
        rows.clear();
        errorMessage.value =
            (result['message'] ?? 'Gagal memuat report SO').toString();
      }
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> refreshData() async {
    await fetchList();
  }

  void resetFilter() {
    noSoController.clear();
    selectedType.value = '';
    startDate.value = '';
    endDate.value = '';
    fetchList();
  }

  String formatFilterDate(String value) {
    final raw = value.trim();
    if (raw.isEmpty) return 'Pilih Tanggal';
    return raw;
  }

  Future<void> pickStartDate(BuildContext context) async {
    final now = DateTime.now();
    final initial = DateTime.tryParse(startDate.value) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year + 2),
    );
    if (picked != null) {
      startDate.value = _toYmd(picked);
    }
  }

  Future<void> pickEndDate(BuildContext context) async {
    final now = DateTime.now();
    final initial = DateTime.tryParse(endDate.value) ??
        DateTime.tryParse(startDate.value) ??
        now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year + 2),
    );
    if (picked != null) {
      endDate.value = _toYmd(picked);
    }
  }

  String _toYmd(DateTime date) {
    return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  void openDetail(Map<String, dynamic> row) {
    Get.toNamed(
      AppRoutes.reportSoDetail,
      arguments: {'row': row},
    );
  }

  Future<void> printRow(Map<String, dynamic> row) async {
    final result = await _repository.downloadReportPdf(row);
    if (result['status'] != true) {
      Get.snackbar(
        'Error',
        (result['message'] ?? 'Gagal download PDF').toString(),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return;
    }

    await _openPdfBytes(
      bytes: result['bytes'] as List<int>,
      filename: (result['filename'] ?? 'report_so.pdf').toString(),
    );
  }

  Future<void> _openPdfBytes({
    required List<int> bytes,
    required String filename,
  }) async {
    final tempDir = await getTemporaryDirectory();
    final file = File('${tempDir.path}/$filename');
    await file.writeAsBytes(bytes, flush: true);

    final openResult = await OpenFile.open(file.path, type: 'application/pdf');
    if (openResult.type != ResultType.done) {
      Get.snackbar(
        'Info',
        'PDF tersimpan di: ${file.path}',
        snackPosition: SnackPosition.BOTTOM,
      );
    }
  }
}
