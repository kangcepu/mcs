import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/repositories/non_asset_repository.dart';
import '../../../data/models/not_asset_model.dart';

class NonAssetController extends GetxController {
  final NonAssetRepository _repository = NonAssetRepository();

  final RxList<NotAsset> items = <NotAsset>[].obs;
  final RxBool isLoading = false.obs;
  final RxString errorMessage = ''.obs;
  final RxBool isSelectionMode = false.obs;
  final RxSet<int> selectedIds = <int>{}.obs;

  Future<void> fetchNonAssetItems(String noSO) async {
    try {
      isLoading.value = true;
      errorMessage.value = '';

      final result = await _repository.getNonAssetList(noSO);

      if (result['status'] == true) {
        items.value = result['data'];
      } else {
        errorMessage.value = result['message'];
        items.clear();
      }
    } catch (e) {
      errorMessage.value = 'Error: $e';
      items.clear();
    } finally {
      isLoading.value = false;
    }
  }

  void toggleSelection(int id) {
    if (selectedIds.contains(id)) {
      selectedIds.remove(id);
      if (selectedIds.isEmpty) {
        isSelectionMode.value = false;
      }
    } else {
      selectedIds.add(id);
      isSelectionMode.value = true;
    }
  }

  void clearSelection() {
    isSelectionMode.value = false;
    selectedIds.clear();
  }

  Future<void> deleteSelectedItems(String noSO) async {
    if (selectedIds.isEmpty) return;

    try {
      isLoading.value = true;

      final result = await _repository.deleteNonAssets(selectedIds.toList());

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          'Asset berhasil dihapus',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        clearSelection();
        await fetchNonAssetItems(noSO);
      } else {
        Get.snackbar(
          'Error',
          result['message'],
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white,
        );
      }
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to delete: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  Future<bool> addNonAsset({
    required String noSO,
    required String nonAssetName,
    required String locationCode,
    required String remark,
    String? image,
  }) async {
    try {
      final result = await _repository.addNonAsset(
        noSO: noSO,
        nonAssetName: nonAssetName,
        locationCode: locationCode,
        remark: remark,
        image: image,
      );

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          'Non-asset berhasil ditambahkan',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        await fetchNonAssetItems(noSO);
        return true;
      } else {
        Get.snackbar(
          'Error',
          result['message'],
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white,
        );
        return false;
      }
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to add: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return false;
    }
  }

  Future<bool> updateNonAsset({
    required int idNonAsset,
    required String noSO,
    required String nonAssetName,
    required String locationCode,
    required String remark,
    String? image,
  }) async {
    try {
      final result = await _repository.updateNonAsset(
        idNonAsset: idNonAsset,
        nonAssetName: nonAssetName,
        locationCode: locationCode,
        remark: remark,
        image: image,
      );

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          'Non-asset berhasil diupdate',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        await fetchNonAssetItems(noSO);
        return true;
      } else {
        Get.snackbar(
          'Error',
          result['message'],
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white,
        );
        return false;
      }
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to update: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return false;
    }
  }
}
