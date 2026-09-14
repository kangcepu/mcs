import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../data/repositories/asset_mutation_repository.dart';
import '../../../core/routes/app_routes.dart';

class ReportAssetMutationController extends GetxController {
  final AssetMutationRepository _repository = AssetMutationRepository();

  final requests = <Map<String, dynamic>>[].obs;
  final isLoading = false.obs;
  final isFirstLoad = true.obs;
  final query = ''.obs;
  final canCreate = false.obs;
  final canApprove = false.obs;

  final TextEditingController searchController = TextEditingController();
  Timer? _debounce;

  @override
  void onInit() {
    super.onInit();
    loadRequests();
  }

  @override
  void onClose() {
    _debounce?.cancel();
    searchController.dispose();
    super.onClose();
  }

  void onSearchChanged(String value) {
    final next = value.trim();
    query.value = next;

    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () {
      loadRequests(search: next);
    });
  }

  Future<void> refreshData() async {
    await loadRequests(search: query.value);
  }

  Future<void> openCreateRequest() async {
    final result = await Get.toNamed(AppRoutes.reportAssetMutationCreate);
    if (result == true) {
      await refreshData();
    }
  }

  Future<void> openDetail(Map<String, dynamic> row) async {
    final docNo = readValue(row, const ['doc_no']);
    if (docNo == '-') {
      return;
    }
    final result = await Get.toNamed(
      AppRoutes.reportAssetMutationDetail,
      arguments: {'doc_no': docNo},
    );
    if (result == true) {
      await refreshData();
    }
  }

  Future<void> loadRequests({String? search}) async {
    try {
      isLoading.value = true;
      final data = await _repository.getRequests(search: search ?? '');
      final items = data['items'] is List
          ? List<Map<String, dynamic>>.from(
              (data['items'] as List).whereType<Map>().map(
                    (e) => Map<String, dynamic>.from(e),
                  ),
            )
          : <Map<String, dynamic>>[];
      requests.assignAll(items);

      final perms = data['permissions'] is Map
          ? Map<String, dynamic>.from(data['permissions'] as Map)
          : <String, dynamic>{};

      bool fromApiCreate = (perms['can_create'] == true);
      bool fromApiApprove = (perms['can_approve'] == true);
      if (!fromApiCreate && !fromApiApprove) {
        final prefs = await SharedPreferences.getInstance();
        fromApiCreate = (prefs.getInt('asset_mutation') ?? 0) == 1;
        fromApiApprove = (prefs.getInt('approval_asset_mutation') ?? 0) == 1;
      }

      canCreate.value = fromApiCreate;
      canApprove.value = fromApiApprove;
    } catch (e) {
      Get.snackbar(
        'Error',
        'Gagal memuat data mutation request',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
      isFirstLoad.value = false;
    }
  }

  String readValue(Map<String, dynamic> row, List<String> keys) {
    for (final key in keys) {
      final value = row[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
    return '-';
  }

  String docNo(Map<String, dynamic> row) => readValue(row, const ['doc_no']);

  String locationBefore(Map<String, dynamic> row) =>
      readValue(row, const ['location_before']);

  String companyBefore(Map<String, dynamic> row) =>
      readValue(row, const ['company_before']);

  String date(Map<String, dynamic> row) => readValue(row, const ['date']);

  String creator(Map<String, dynamic> row) =>
      readValue(row, const ['creator', 'created_by']);

  String status(Map<String, dynamic> row) =>
      readValue(row, const ['status']).toUpperCase();

  int detailCount(Map<String, dynamic> row) {
    final value = row['detail_count'];
    if (value is int) return value;
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }

  Color statusColor(String statusText) {
    switch (statusText.toUpperCase()) {
      case 'APPROVED':
        return const Color(0xFF16A34A);
      case 'NEED_APPROVED':
        return const Color(0xFFF59E0B);
      default:
        return const Color(0xFF6B7280);
    }
  }
}
