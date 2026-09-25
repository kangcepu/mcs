import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:path_provider/path_provider.dart';

import '../../../data/repositories/report_so_repository.dart';
import '../../../core/widgets/pdf_viewer_page.dart';

class ReportSoDetailController extends GetxController {
  final ReportSoRepository _repository = ReportSoRepository();

  final isLoading = false.obs;
  final found = true.obs;
  final errorMessage = ''.obs;

  final header = <String, dynamic>{}.obs;
  final assetDetails = <Map<String, dynamic>>[].obs;
  final bomDetails = <Map<String, dynamic>>[].obs;
  final nonPartDetails = <Map<String, dynamic>>[].obs;
  final nonAssetDetails = <Map<String, dynamic>>[].obs;

  late String noSo;
  Map<String, dynamic> _seedRow = {};

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments is Map
        ? Map<String, dynamic>.from(Get.arguments as Map)
        : <String, dynamic>{};
    _seedRow = args['row'] is Map
        ? Map<String, dynamic>.from(args['row'] as Map)
        : <String, dynamic>{};
    noSo = (_seedRow['no_so'] ?? args['no_so'] ?? '').toString().trim();
    if (noSo.isEmpty) {
      found.value = false;
      errorMessage.value = 'No SO tidak ditemukan';
    } else {
      loadDetail();
    }
  }

  Future<void> loadDetail() async {
    try {
      isLoading.value = true;
      errorMessage.value = '';

      final result = await _repository.getDetail(noSo);
      if (result['status'] != true) {
        found.value = false;
        errorMessage.value =
            (result['message'] ?? 'Gagal memuat detail').toString();
        return;
      }

      found.value = result['found'] == true;

      final rawHeader = result['header'] is Map
          ? Map<String, dynamic>.from(result['header'] as Map)
          : <String, dynamic>{};
      final merged = <String, dynamic>{
        ..._seedRow,
        ...rawHeader,
      };
      merged['no_so'] = (merged['no_so'] ?? noSo).toString();
      header.assignAll(merged);

      assetDetails.assignAll(
        (result['asset_details'] as List<dynamic>? ?? <dynamic>[])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
      bomDetails.assignAll(
        (result['bom_details'] as List<dynamic>? ?? <dynamic>[])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
      nonPartDetails.assignAll(
        (result['non_part_details'] as List<dynamic>? ?? <dynamic>[])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
      nonAssetDetails.assignAll(
        (result['non_asset_details'] as List<dynamic>? ?? <dynamic>[])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );

      if (!found.value) {
        errorMessage.value = 'Data SO tidak ditemukan';
      }
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> printCurrent() async {
    if (header.isEmpty) {
      return;
    }

    final result = await _repository.downloadReportPdf(header);
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

    Get.to(() => PdfViewerPage(title: filename, file: file));
  }

  String readValue(Map<String, dynamic> row, String key,
      {String fallback = '-'}) {
    final value = row[key];
    if (value == null) return fallback;
    final text = value.toString().trim();
    if (text.isEmpty) return fallback;
    return text;
  }
}
