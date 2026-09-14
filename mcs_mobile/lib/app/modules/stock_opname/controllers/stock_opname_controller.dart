import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/repositories/stock_opname_repository.dart';
import '../../../data/models/stock_opname_model.dart';

class StockOpnameController extends GetxController {
  final StockOpnameRepository _repository = StockOpnameRepository();

  final RxList<StockOpname> stockOpnameList = <StockOpname>[].obs;
  final RxBool isLoading = false.obs;
  final RxString errorMessage = ''.obs;
  final RxList<String> selectedItems = <String>[].obs;

  @override
  void onInit() {
    super.onInit();
    fetchStockOpnameList();
  }

  Future<void> fetchStockOpnameList() async {
    try {
      isLoading.value = true;
      errorMessage.value = '';

      final result = await _repository.getStockOpnameList();

      if (result['status'] == true) {
        stockOpnameList.value = result['data'];
      } else {
        errorMessage.value = result['message'];
        stockOpnameList.clear();
      }
    } catch (e) {
      errorMessage.value = 'Error: $e';
      stockOpnameList.clear();
    } finally {
      isLoading.value = false;
    }
  }

  Future<bool> createStockOpname({
    required String tanggal,
    required List<String> idCompanies,
    required List<String> idCategories,
    required List<String> idLocations,
    required bool isBOM,
  }) async {
    try {
      isLoading.value = true;

      final result = await _repository.createStockOpname(
        tanggal: tanggal,
        idCompanies: idCompanies,
        idCategories: idCategories,
        idLocations: idLocations,
        isBOM: isBOM,
      );

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          result['message'],
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        await fetchStockOpnameList();
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
        'Failed to create: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> deleteSelectedStockOpname() async {
    if (selectedItems.isEmpty) return;

    try {
      isLoading.value = true;

      final result = await _repository.deleteStockOpname(selectedItems);

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          result['message'],
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        selectedItems.clear();
        await fetchStockOpnameList();
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

  Future<void> lockStockOpname(String noSO) async {
    try {
      isLoading.value = true;

      final result = await _repository.lockStockOpname(noSO);

      if (result['status'] == true) {
        Get.snackbar(
          'Success',
          result['message'],
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white,
        );
        await fetchStockOpnameList();
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
        'Failed to lock: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  void toggleSelection(String noSO) {
    if (selectedItems.contains(noSO)) {
      selectedItems.remove(noSO);
    } else {
      selectedItems.add(noSO);
    }
  }

  void clearSelection() {
    selectedItems.clear();
  }
}
