import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/repositories/non_part_repository.dart';
import '../../../data/models/non_part_model.dart';

class NonPartController extends GetxController {
  final NonPartRepository _repository = NonPartRepository();

  final RxList<NonPart> items = <NonPart>[].obs;
  final RxBool isLoading = false.obs;
  final RxString errorMessage = ''.obs;
  final RxBool isSelectionMode = false.obs;
  final RxSet<int> selectedIds = <int>{}.obs;

  Future<void> fetchNonPartItems(String noSO) async {
    try {
      isLoading.value = true;
      errorMessage.value = '';

      final result = await _repository.getNonPartList(noSO);

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

      final result = await _repository.deleteNonParts(selectedIds.toList());

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          'Part berhasil dihapus',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        clearSelection();
        await fetchNonPartItems(noSO);
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

  Future<bool> addNonPart({
    required String noSO,
    required String nonPartName,
    required int qty,
    required String remark,
    String? image,
  }) async {
    try {
      final result = await _repository.addNonPart(
        noSO: noSO,
        nonPartName: nonPartName,
        qty: qty,
        remark: remark,
        image: image,
      );

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          'Non-part berhasil ditambahkan',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        await fetchNonPartItems(noSO);
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

  Future<bool> updateNonPart({
    required int idNonPart,
    required String noSO,
    required String nonPartName,
    required int qty,
    required String remark,
    String? image,
  }) async {
    try {
      final result = await _repository.updateNonPart(
        idNonPart: idNonPart,
        nonPartName: nonPartName,
        qty: qty,
        remark: remark,
        image: image,
      );

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          'Non-part berhasil diupdate',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        await fetchNonPartItems(noSO);
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
