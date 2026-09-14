import 'dart:io';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import '../../../data/models/asset_before_bom_model.dart';
import '../../../data/models/asset_bom_model.dart';
import '../../../data/models/category_model.dart';
import '../../../data/models/company_model.dart';
import '../../../data/models/location_model.dart';
import '../../../data/repositories/stock_opname_input_repository.dart';
import 'stock_opname_controller.dart';

class StockOpnameInputBOMController extends GetxController {
  final StockOpnameInputRepository _repository = StockOpnameInputRepository();

  final RxList<AssetBeforeBOMModel> assetsBefore = <AssetBeforeBOMModel>[].obs;
  final RxList<AssetBOMItem> bomParts = <AssetBOMItem>[].obs;

  final RxBool isLoadingAssets = false.obs;
  final RxBool isLoadingBOM = false.obs;
  final RxBool isLoadingAction = false.obs;
  final RxString errorMessage = ''.obs;

  final RxInt totalAssetsBefore = 0.obs;
  final RxBool hasMoreBefore = true.obs;
  final RxBool isFetchingMoreBefore = false.obs;
  final RxInt currentOffsetBefore = 0.obs;

  final RxString selectedAssetCode = ''.obs;

  final RxList<Company> masterCompanies = <Company>[].obs;
  final RxList<Category> masterCategories = <Category>[].obs;
  final RxList<Location> masterLocations = <Location>[].obs;
  final RxSet<String> selectedCompanies = <String>{}.obs;
  final RxSet<String> selectedCategories = <String>{}.obs;
  final RxSet<String> selectedLocations = <String>{}.obs;

  Future<void> fetchMasterData() async {
    final result = await _repository.getMasterData();
    if (result['status'] == true) {
      masterCompanies
          .assignAll((result['companies'] as List<Company>?) ?? <Company>[]);
      masterCategories
          .assignAll((result['categories'] as List<Category>?) ?? <Category>[]);
      masterLocations
          .assignAll((result['locations'] as List<Location>?) ?? <Location>[]);
    }
  }

  void toggleCompanyFilter(String value) {
    if (selectedCompanies.contains(value)) {
      selectedCompanies.remove(value);
    } else {
      selectedCompanies.add(value);
    }
  }

  void toggleCategoryFilter(String value) {
    if (selectedCategories.contains(value)) {
      selectedCategories.remove(value);
    } else {
      selectedCategories.add(value);
    }
  }

  void toggleLocationFilter(String value) {
    if (selectedLocations.contains(value)) {
      selectedLocations.remove(value);
    } else {
      selectedLocations.add(value);
    }
  }

  Future<void> fetchAssetsBefore(String noSO, {bool loadMore = false}) async {
    if (isLoadingAssets.value && !loadMore) {
      return;
    }
    if (loadMore && (!hasMoreBefore.value || isFetchingMoreBefore.value)) {
      return;
    }

    try {
      if (loadMore) {
        isFetchingMoreBefore.value = true;
      } else {
        isLoadingAssets.value = true;
        errorMessage.value = '';
        currentOffsetBefore.value = 0;
        hasMoreBefore.value = true;
        assetsBefore.clear();
      }

      final result = await _repository.getAssetsBeforeBOM(
        noSO,
        offset: loadMore ? currentOffsetBefore.value : 0,
        companyFilters: selectedCompanies.toList(),
        categoryFilters: selectedCategories.toList(),
        locationFilters: selectedLocations.toList(),
      );

      if (result['status'] == true) {
        final data = (result['data'] as List<AssetBeforeBOMModel>?) ??
            <AssetBeforeBOMModel>[];
        if (loadMore) {
          assetsBefore.addAll(data);
        } else {
          assetsBefore.assignAll(data);
        }

        totalAssetsBefore.value =
            (result['total'] as int?) ?? assetsBefore.length;
        currentOffsetBefore.value =
            (result['nextOffset'] as int?) ?? assetsBefore.length;
        hasMoreBefore.value = (result['hasMore'] as bool?) ?? false;
      } else {
        errorMessage.value =
            (result['message'] ?? 'Failed to fetch BOM assets').toString();
      }
    } finally {
      isLoadingAssets.value = false;
      isFetchingMoreBefore.value = false;
    }
  }

  Future<void> loadMoreAssetsBefore(String noSO) async {
    await fetchAssetsBefore(noSO, loadMore: true);
  }

  Future<void> fetchBOMParts(String noSO, String assetCode) async {
    try {
      isLoadingBOM.value = true;
      errorMessage.value = '';
      selectedAssetCode.value = assetCode;

      final result = await _repository.getPartBOM(noSO, assetCode);
      if (result['status'] == true) {
        bomParts.assignAll(
            (result['data'] as List<AssetBOMItem>?) ?? <AssetBOMItem>[]);
      } else {
        bomParts.clear();
        errorMessage.value =
            (result['message'] ?? 'Failed to fetch BOM parts').toString();
      }
    } finally {
      isLoadingBOM.value = false;
    }
  }

  void updateBOMItem(String id, String qtyFound, String remark) {
    void updateItem(AssetBOMItem item) {
      if (item.id == id) {
        item.qtyFound = qtyFound;
        item.remark = remark;
        return;
      }
      for (final child in item.parts) {
        updateItem(child);
      }
    }

    for (final item in bomParts) {
      updateItem(item);
    }
    update();
  }

  Future<bool> submitBOM(String noSO, String assetCode) async {
    try {
      isLoadingAction.value = true;
      final allParts = <AssetBOMItem>[];

      void collectParts(AssetBOMItem item) {
        allParts.add(item);
        for (final child in item.parts) {
          collectParts(child);
        }
      }

      for (final item in bomParts) {
        collectParts(item);
      }

      final parts = allParts
          .where((item) => !item.isParent && item.qtyFound.trim().isNotEmpty)
          .map((item) => {
                'idBOM': item.id,
                'qtyFound': item.qtyFound,
                'remark': item.remark,
              })
          .toList();

      final result = await _repository.updateBOM(
        noSO: noSO,
        assetCode: assetCode,
        parts: parts,
      );

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          'BOM berhasil disimpan',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        return true;
      }

      Get.snackbar(
        'Error',
        (result['message'] ?? 'Failed to submit BOM').toString(),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return false;
    } finally {
      isLoadingAction.value = false;
    }
  }

  Future<void> lockStockOpname(String noSO) async {
    try {
      isLoadingAction.value = true;
      final result = await _repository.lockStockOpname(noSO);
      if (result['status'] == true) {
        if (Get.isRegistered<StockOpnameController>()) {
          await Get.find<StockOpnameController>().fetchStockOpnameList();
        }
        Get.snackbar(
          'Success',
          'Stock Opname berhasil dikunci',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
      } else {
        Get.snackbar(
          'Error',
          (result['message'] ?? 'Failed to lock SO').toString(),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white,
        );
      }
    } finally {
      isLoadingAction.value = false;
    }
  }

  Future<void> printReportBOM({
    required String noSO,
    required String tanggal,
    required String? lockedDate,
    required List<String> companies,
    required List<String> locations,
  }) async {
    final result = await _repository.downloadReportBom(
      noSO: noSO,
      tanggal: tanggal,
      lockedDate: lockedDate,
      company: companies.join(', '),
      location: locations.join(', '),
    );

    if (result['status'] != true) {
      Get.snackbar(
        'Error',
        (result['message'] ?? 'Gagal download report').toString(),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return;
    }

    final tempDir = await getTemporaryDirectory();
    final file =
        File('${tempDir.path}/laporan_bom_${noSO.replaceAll('.', '_')}.pdf');
    await file.writeAsBytes(result['bytes'] as List<int>, flush: true);
    final openResult = await OpenFile.open(file.path, type: 'application/pdf');
    if (openResult.type != ResultType.done) {
      Get.snackbar('Info', 'PDF tersimpan di ${file.path}',
          snackPosition: SnackPosition.BOTTOM);
    }
  }

  void clearSelectedAsset() {
    selectedAssetCode.value = '';
    bomParts.clear();
  }
}
