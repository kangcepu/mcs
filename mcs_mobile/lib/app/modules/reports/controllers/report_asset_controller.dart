import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../data/repositories/master_repository.dart';

class ReportAssetController extends GetxController {
  final MasterRepository _masterRepository = MasterRepository();

  final assets = <Map<String, dynamic>>[].obs;
  final isLoading = false.obs;
  final isFirstLoad = true.obs;
  final query = ''.obs;
  final selectedCompany = 'ALL'.obs;
  final selectedLocation = 'ALL'.obs;

  final TextEditingController searchController = TextEditingController();
  Timer? _debounce;

  @override
  void onInit() {
    super.onInit();
    fetchAssets();
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
      fetchAssets(search: next);
    });
  }

  Future<void> refreshData() async {
    await fetchAssets(search: query.value);
  }

  void selectCompany(String company) {
    selectedCompany.value = company.trim().isEmpty ? 'ALL' : company.trim();
    selectedLocation.value = 'ALL';
  }

  void selectLocation(String location) {
    final next = location.trim().isEmpty ? 'ALL' : location.trim();
    selectedLocation.value =
        selectedLocation.value == next ? 'ALL' : next;
  }

  Future<void> fetchAssets({String? search}) async {
    try {
      isLoading.value = true;
      final rows = await _masterRepository.getAssets(search: search);
      assets.assignAll(rows);
    } catch (e) {
      Get.snackbar(
        'Error',
        'Gagal memuat report asset',
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

  String assetName(Map<String, dynamic> row) => readValue(
        row,
        const ['AssetName', 'asset_name', 'description', 'name'],
      );

  String assetCode(Map<String, dynamic> row) => readValue(
        row,
        const ['AssetCode', 'asset_code', 'tag_number', 'code'],
      );

  String company(Map<String, dynamic> row) => readValue(
        row,
        const ['CompanyName', 'Company', 'company', 'company_name'],
      );

  String normalizedCompany(Map<String, dynamic> row) {
    final raw = company(row).trim().toUpperCase();
    if (raw == 'UC' || raw.contains('UTAMA CORPORATION')) {
      return 'UC';
    }
    if (raw == 'GSU' || raw.contains('GANDA SARIBU UTAMA')) {
      return 'GSU';
    }
    if (raw == 'RU' || raw.contains('RATIMDO UTAMA')) {
      return 'RU';
    }
    return raw;
  }

  String category(Map<String, dynamic> row) => readValue(
        row,
        const ['CategoryAsset', 'category', 'Category', 'category_asset'],
      );

  String location(Map<String, dynamic> row) => readValue(
        row,
        const ['LocationAsset', 'location', 'Location', 'location_asset'],
      );

  String remark(Map<String, dynamic> row) => readValue(
        row,
        const ['Keterangan', 'Remarks', 'remark', 'remarks'],
      );

  List<String> get companyOptions => const ['ALL', 'UC', 'GSU', 'RU'];

  int get totalAssetCount => assets.length;

  int companyAssetCount(String companyCode) {
    final code = companyCode.trim().toUpperCase();
    if (code.isEmpty || code == 'ALL') {
      return totalAssetCount;
    }
    return assets.where((row) => normalizedCompany(row) == code).length;
  }

  List<Map<String, dynamic>> get filteredAssetsByCompany {
    final companyFilter = selectedCompany.value.trim().toUpperCase();
    if (companyFilter.isEmpty || companyFilter == 'ALL') {
      return assets.toList();
    }
    return assets
        .where((row) => normalizedCompany(row) == companyFilter)
        .toList();
  }

  List<Map<String, dynamic>> get filteredAssets {
    final locationFilter = selectedLocation.value.trim().toUpperCase();
    if (locationFilter.isEmpty || locationFilter == 'ALL') {
      return filteredAssetsByCompany;
    }
    return filteredAssetsByCompany
        .where((row) => location(row).trim().toUpperCase() == locationFilter)
        .toList();
  }

  List<MapEntry<String, int>> get locationSummaries {
    final map = <String, int>{};
    for (final row in filteredAssetsByCompany) {
      final key = location(row).trim().isEmpty ? '-' : location(row).trim();
      map[key] = (map[key] ?? 0) + 1;
    }

    final entries = map.entries.toList()
      ..sort((a, b) {
        return a.key.toLowerCase().compareTo(b.key.toLowerCase());
      });
    return entries;
  }

  List<String> get locationOptions => [
        'ALL',
        ...locationSummaries.map((entry) => entry.key),
      ];

  int locationAssetCount(String locationName) {
    if (locationName.trim().toUpperCase() == 'ALL') {
      return filteredAssetsByCompany.length;
    }

    for (final entry in locationSummaries) {
      if (entry.key.trim().toUpperCase() == locationName.trim().toUpperCase()) {
        return entry.value;
      }
    }
    return 0;
  }

  bool get isReadyToShowAssetList =>
      selectedCompany.value != 'ALL' && selectedLocation.value != 'ALL';
}
