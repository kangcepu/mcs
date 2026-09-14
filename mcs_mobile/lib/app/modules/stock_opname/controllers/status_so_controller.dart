import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/models/status_so_model.dart';
import '../../../data/repositories/status_so_repository.dart';

class StatusSoController extends GetxController {
  final StatusSORepository _repository = StatusSORepository();

  final RxList<StatusSO> statuses = <StatusSO>[].obs;
  final RxBool isLoading = false.obs;
  final RxString errorMessage = ''.obs;

  @override
  void onInit() {
    super.onInit();
    fetchStatuses();
  }

  Future<void> fetchStatuses() async {
    try {
      isLoading.value = true;
      errorMessage.value = '';
      final result = await _repository.getStatuses();
      if (result['status'] == true) {
        statuses.assignAll((result['data'] as List<StatusSO>?) ?? <StatusSO>[]);
      } else {
        errorMessage.value =
            (result['message'] ?? 'Failed to fetch statuses').toString();
      }
    } finally {
      isLoading.value = false;
    }
  }

  Future<bool> addStatus(String status) async {
    final result = await _repository.createStatus(status);
    if (result['status'] == true) {
      await fetchStatuses();
      return true;
    }
    Get.snackbar(
      'Error',
      (result['message'] ?? 'Gagal tambah status').toString(),
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.red,
      colorText: Colors.white,
    );
    return false;
  }

  Future<bool> updateStatus(int id, String status) async {
    final result = await _repository.updateStatus(id, status);
    if (result['status'] == true) {
      await fetchStatuses();
      return true;
    }
    Get.snackbar(
      'Error',
      (result['message'] ?? 'Gagal update status').toString(),
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.red,
      colorText: Colors.white,
    );
    return false;
  }

  Future<bool> deleteStatus(int id) async {
    final result = await _repository.deleteStatus(id);
    if (result['status'] == true) {
      await fetchStatuses();
      return true;
    }
    Get.snackbar(
      'Error',
      (result['message'] ?? 'Gagal hapus status').toString(),
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.red,
      colorText: Colors.white,
    );
    return false;
  }
}
