import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:path_provider/path_provider.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../../../core/constants/api_constants.dart';
import '../../../data/models/asset_after_model.dart';
import '../../../data/models/asset_before_model.dart';
import '../../../data/models/category_model.dart';
import '../../../data/models/company_model.dart';
import '../../../data/models/location_model.dart';
import '../../../data/models/status_so_model.dart';
import '../../../data/repositories/stock_opname_input_repository.dart';
import '../../../data/repositories/stock_opname_repository.dart';
import '../../../data/repositories/status_so_repository.dart';
import 'stock_opname_controller.dart';
import '../../../core/widgets/pdf_viewer_page.dart';

class StockOpnameInputController extends GetxController {
  final StockOpnameInputRepository _repository = StockOpnameInputRepository();
  final StockOpnameRepository _headerRepository = StockOpnameRepository();
  final StatusSORepository _statusRepository = StatusSORepository();

  final RxList<AssetAfter> assetsAfter = <AssetAfter>[].obs;
  final RxList<AssetBefore> assetsBefore = <AssetBefore>[].obs;

  final RxBool isLoadingAfter = false.obs;
  final RxBool isLoadingBefore = false.obs;
  final RxBool isLoadingAction = false.obs;
  final RxString errorMessageAfter = ''.obs;
  final RxString errorMessageBefore = ''.obs;

  final RxBool hasMoreAfter = true.obs;
  final RxBool hasMoreBefore = true.obs;
  final RxBool isFetchingMoreAfter = false.obs;
  final RxBool isFetchingMoreBefore = false.obs;
  final RxInt currentOffsetAfter = 0.obs;
  final RxInt currentOffsetBefore = 0.obs;

  final RxInt totalAssetsAfter = 0.obs;
  final RxInt totalAssetsBefore = 0.obs;

  final RxList<Company> masterCompanies = <Company>[].obs;
  final RxList<Category> masterCategories = <Category>[].obs;
  final RxList<Location> masterLocations = <Location>[].obs;
  final RxSet<String> selectedCompanies = <String>{}.obs;
  final RxSet<String> selectedCategories = <String>{}.obs;
  final RxSet<String> selectedLocations = <String>{}.obs;
  final RxBool isLoadingMasterData = false.obs;
  final RxList<StatusSO> statuses = <StatusSO>[].obs;
  final RxBool isLoadingStatuses = false.obs;

  WebSocketChannel? _channel;
  String? _currentNoSO;

  @override
  void onClose() {
    _closeWebSocket();
    super.onClose();
  }

  int get totalCombinedAssets =>
      totalAssetsAfter.value + totalAssetsBefore.value;

  Future<void> fetchMasterData() async {
    if (isLoadingMasterData.value) {
      return;
    }

    try {
      isLoadingMasterData.value = true;
      final result = await _repository.getMasterData();
      if (result['status'] == true) {
        masterCompanies
            .assignAll((result['companies'] as List<Company>?) ?? <Company>[]);
        masterCategories.assignAll(
            (result['categories'] as List<Category>?) ?? <Category>[]);
        masterLocations.assignAll(
            (result['locations'] as List<Location>?) ?? <Location>[]);
      }
    } finally {
      isLoadingMasterData.value = false;
    }
  }

  Future<void> fetchStatuses() async {
    try {
      isLoadingStatuses.value = true;
      final result = await _statusRepository.getStatuses();
      if (result['status'] == true) {
        statuses.assignAll((result['data'] as List<StatusSO>?) ?? <StatusSO>[]);
      }
    } finally {
      isLoadingStatuses.value = false;
    }
  }

  Future<bool> addStatus(String status) async {
    final result = await _statusRepository.createStatus(status);
    if (result['status'] == true) {
      await fetchStatuses();
      return true;
    }
    return false;
  }

  Future<bool> updateStatus(int id, String status) async {
    final result = await _statusRepository.updateStatus(id, status);
    if (result['status'] == true) {
      await fetchStatuses();
      return true;
    }
    return false;
  }

  Future<bool> deleteStatus(int id) async {
    final result = await _statusRepository.deleteStatus(id);
    if (result['status'] == true) {
      await fetchStatuses();
      return true;
    }
    return false;
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

  void clearFilters() {
    selectedCompanies.clear();
    selectedCategories.clear();
    selectedLocations.clear();
  }

  Future<void> applyFilters(String noSO) async {
    await Future.wait([
      fetchAssetsAfter(noSO),
      fetchAssetsBefore(noSO),
    ]);
  }

  Future<void> fetchAssetsAfter(
    String noSO, {
    bool loadMore = false,
  }) async {
    if (isLoadingAfter.value && !loadMore) {
      return;
    }
    if (loadMore && (!hasMoreAfter.value || isFetchingMoreAfter.value)) {
      return;
    }

    try {
      if (loadMore) {
        isFetchingMoreAfter.value = true;
      } else {
        isLoadingAfter.value = true;
        errorMessageAfter.value = '';
        currentOffsetAfter.value = 0;
        hasMoreAfter.value = true;
        assetsAfter.clear();
      }

      final result = await _repository.getAssetsAfter(
        noSO,
        offset: loadMore ? currentOffsetAfter.value : 0,
        companyFilters: selectedCompanies.toList(),
        categoryFilters: selectedCategories.toList(),
        locationFilters: selectedLocations.toList(),
      );

      if (result['status'] == true) {
        final data = (result['data'] as List<AssetAfter>?) ?? <AssetAfter>[];
        if (loadMore) {
          assetsAfter.addAll(data);
        } else {
          assetsAfter.assignAll(data);
        }

        totalAssetsAfter.value =
            (result['total'] as int?) ?? assetsAfter.length;
        currentOffsetAfter.value =
            (result['nextOffset'] as int?) ?? assetsAfter.length;
        hasMoreAfter.value = (result['hasMore'] as bool?) ?? false;
      } else {
        errorMessageAfter.value =
            (result['message'] ?? 'Failed to load assets').toString();
      }
    } catch (e) {
      errorMessageAfter.value = 'Error: $e';
    } finally {
      isLoadingAfter.value = false;
      isFetchingMoreAfter.value = false;
    }
  }

  Future<void> fetchAssetsBefore(
    String noSO, {
    bool loadMore = false,
  }) async {
    if (isLoadingBefore.value && !loadMore) {
      return;
    }
    if (loadMore && (!hasMoreBefore.value || isFetchingMoreBefore.value)) {
      return;
    }

    try {
      if (!loadMore) {
        await _initWebSocket(noSO);
      }

      if (loadMore) {
        isFetchingMoreBefore.value = true;
      } else {
        isLoadingBefore.value = true;
        errorMessageBefore.value = '';
        currentOffsetBefore.value = 0;
        hasMoreBefore.value = true;
        assetsBefore.clear();
      }

      final result = await _repository.getAssetsBefore(
        noSO,
        offset: loadMore ? currentOffsetBefore.value : 0,
        companyFilters: selectedCompanies.toList(),
        categoryFilters: selectedCategories.toList(),
        locationFilters: selectedLocations.toList(),
      );

      if (result['status'] == true) {
        final data = (result['data'] as List<AssetBefore>?) ?? <AssetBefore>[];
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
        errorMessageBefore.value =
            (result['message'] ?? 'Failed to load assets').toString();
      }
    } catch (e) {
      errorMessageBefore.value = 'Error: $e';
    } finally {
      isLoadingBefore.value = false;
      isFetchingMoreBefore.value = false;
    }
  }

  Future<void> loadMoreAfter(String noSO) async {
    await fetchAssetsAfter(noSO, loadMore: true);
  }

  Future<void> loadMoreBefore(String noSO) async {
    await fetchAssetsBefore(noSO, loadMore: true);
  }

  Future<Map<String, dynamic>> scanAsset(String noSO, String assetCode) async {
    try {
      final result = await _repository.scanAsset(noSO, assetCode);
      if (result['status'] == true) {
        try {
          await fetchAssetsAfter(noSO);
        } catch (_) {
          // Refresh gagal tidak mempengaruhi hasil scan yang sudah berhasil
        }
        return result;
      }

      Get.snackbar(
        'Error',
        (result['message'] ?? 'Failed to scan').toString(),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return result;
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to scan: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return {
        'status': false,
        'message': 'Failed to scan: $e',
        'statusCode': 0,
      };
    }
  }

  Future<bool> updateAsset({
    required String noSO,
    required String assetCode,
    required Map<String, dynamic> updateData,
  }) async {
    try {
      isLoadingAction.value = true;
      final result = await _repository.updateAsset(
        noSO: noSO,
        assetCode: assetCode,
        updateData: updateData,
      );

      if (result['status'] == true) {
        await fetchAssetsBefore(noSO);
        await fetchAssetsAfter(noSO);
        return true;
      }

      Get.snackbar(
        'Error',
        (result['message'] ?? 'Failed to update').toString(),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return false;
    } finally {
      isLoadingAction.value = false;
    }
  }

  Future<Map<String, dynamic>> uploadImage(
    String imagePath, {
    String? noSO,
  }) {
    return _repository.uploadImage(imagePath, noSO: noSO);
  }

  Future<Map<String, dynamic>> replaceImage({
    required String oldImageName,
    required String imagePath,
    required String noSO,
  }) {
    return _repository.replaceImage(
      oldImageName: oldImageName,
      imagePath: imagePath,
      noSO: noSO,
    );
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

        if (Get.currentRoute != '/stock_opname/list') {
          Get.back();
        }
      } else {
        Get.snackbar(
          'Error',
          (result['message'] ?? 'Failed to lock stock opname').toString(),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white,
        );
      }
    } finally {
      isLoadingAction.value = false;
    }
  }

  Future<void> printReport({
    required String noSO,
    required String tanggal,
    required String? lockedDate,
    required List<String> companies,
  }) async {
    final result = await _repository.downloadReport(
      noSO: noSO,
      tanggal: tanggal,
      lockedDate: lockedDate,
      company: companies.join(', '),
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

    await _openPdfBytes(
      bytes: result['bytes'] as List<int>,
      filename: 'laporan_${noSO.replaceAll('.', '_')}.pdf',
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

  Future<bool> createStockOpname({
    required String tanggal,
    required List<String> companies,
    required List<String> categories,
    required List<String> locations,
    required bool isBOM,
  }) async {
    final result = await _headerRepository.createStockOpname(
      tanggal: tanggal,
      idCompanies: companies,
      idCategories: categories,
      idLocations: locations,
      isBOM: isBOM,
    );
    return result['status'] == true;
  }

  Future<void> _initWebSocket(String noSO) async {
    if (_currentNoSO == noSO && _channel != null) {
      return;
    }

    await _closeWebSocket();
    _currentNoSO = noSO;

    try {
      _channel = WebSocketChannel.connect(
          Uri.parse(ApiConstants.realtimeStockOpname(noSO)));
      _channel?.stream.listen(
        _handleRealtimeUpdate,
        onError: (_) {},
      );
    } catch (_) {
      _channel = null;
    }
  }

  void _handleRealtimeUpdate(dynamic message) {
    try {
      if (message == null) {
        return;
      }

      final payload = message is String ? message : message.toString();
      if (payload.isEmpty) {
        return;
      }

      final dynamic decoded =
          payload.startsWith('{') ? jsonDecodeSafe(payload) : null;
      if (decoded is! Map<String, dynamic>) {
        return;
      }

      if (decoded['type'] != 'NEW_ASSET') {
        return;
      }

      final data = decoded['data'];
      if (data is! Map<String, dynamic>) {
        return;
      }

      final noSoData = (data['NoSO'] ?? '').toString();
      if (_currentNoSO != null &&
          noSoData.isNotEmpty &&
          noSoData != _currentNoSO) {
        return;
      }

      final newAsset = AssetAfter.fromJson(data);
      final exists =
          assetsAfter.any((item) => item.assetCode == newAsset.assetCode);
      if (!exists) {
        assetsAfter.insert(0, newAsset);
        totalAssetsAfter.value += 1;
        assetsBefore
            .removeWhere((item) => item.assetCode == newAsset.assetCode);
        if (totalAssetsBefore.value > 0) {
          totalAssetsBefore.value -= 1;
        }
      }
    } catch (_) {
      // Ignore malformed realtime payload.
    }
  }

  dynamic jsonDecodeSafe(String raw) {
    try {
      return raw.isEmpty ? null : json.decode(raw);
    } catch (_) {
      return null;
    }
  }

  Future<void> _closeWebSocket() async {
    await _channel?.sink.close();
    _channel = null;
  }
}
