import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/models/work_order_model.dart' as wo_model;
import '../../../data/repositories/wo_operational_repository.dart';

class WoOperationalExecutorController extends GetxController {
  final WoOperationalRepository _woRepository = WoOperationalRepository();
  
  final formKey = GlobalKey<FormState>();
  
  final woNumberController = TextEditingController();
  final jobExecutorController = TextEditingController();
  final statusController = TextEditingController();
  
  final RxList<wo_model.Executor> executorList = <wo_model.Executor>[].obs;
  final isLoading = false.obs;
  final selectedStatus = 'WAITING'.obs;

  final List<String> statusOptions = [
    'WAITING',
    'IN_PROGRESS',
    'COMPLETED',
  ];

  @override
  void onInit() {
    super.onInit();
    woNumberController.text = Get.arguments ?? '';
  }

  @override
  void onClose() {
    woNumberController.dispose();
    jobExecutorController.dispose();
    statusController.dispose();
    super.onClose();
  }

  void setExecutorList(List<wo_model.Executor> list) {
    executorList.value = list;
  }

  Future<void> updateExecutor(String id, String jobExecutor, String status) async {
    try {
      isLoading.value = true;
      
      await _woRepository.updateExecutor(
        id: id,
        woNumber: woNumberController.text,
        jobExecutor: jobExecutor,
        status: status,
      );
      
      Get.snackbar(
        'Success',
        'Executor updated successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      
      Get.back(result: true);
      
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to update executor: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> deleteExecutor(String id) async {
    try {
      final confirm = await Get.dialog<bool>(
        AlertDialog(
          title: const Text('Confirm Delete'),
          content: const Text('Are you sure you want to delete this executor?'),
          actions: [
            TextButton(
              onPressed: () => Get.back(result: false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Get.back(result: true),
              child: const Text('Delete', style: TextStyle(color: Colors.red)),
            ),
          ],
        ),
      );

      if (confirm != true) return;

      isLoading.value = true;
      
      await _woRepository.deleteExecutor(id);
      
      executorList.removeWhere((executor) => executor.id == id);
      
      Get.snackbar(
        'Success',
        'Executor deleted successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to delete executor: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  void setStatus(String status) {
    selectedStatus.value = status;
    statusController.text = status;
  }

  void setJobExecutor(String executor) {
    jobExecutorController.text = executor;
  }

  String getStatusLabel(String status) {
    switch (status) {
      case 'WAITING':
        return 'Waiting';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETED':
        return 'Completed';
      default:
        return status;
    }
  }

  Color getStatusColor(String status) {
    switch (status) {
      case 'WAITING':
        return const Color(0xFFfeca57);
      case 'IN_PROGRESS':
        return const Color(0xFF4facfe);
      case 'COMPLETED':
        return const Color(0xFF0be881);
      default:
        return const Color(0xFF74b9ff);
    }
  }
}
