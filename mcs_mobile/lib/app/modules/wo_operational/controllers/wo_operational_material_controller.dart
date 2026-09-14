import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/models/work_order_model.dart' as wo_model;
import '../../../data/repositories/wo_operational_repository.dart';

class WoOperationalMaterialController extends GetxController {
  final WoOperationalRepository _woRepository = WoOperationalRepository();
  
  final formKey = GlobalKey<FormState>();
  
  final woNumberController = TextEditingController();
  final jobExecutorController = TextEditingController();
  final materialController = TextEditingController();
  final unitController = TextEditingController();
  final qtyController = TextEditingController();
  final prController = TextEditingController();
  
  final RxList<wo_model.Material> materialList = <wo_model.Material>[].obs;
  final RxList<wo_model.Material> materialReceivedList = <wo_model.Material>[].obs;
  final RxList<String> materialSuggestions = <String>[].obs;
  final isLoading = false.obs;
  final isSearchingMaterial = false.obs;

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    if (args is Map) {
      woNumberController.text = (args['wo_number'] ?? '').toString();
      jobExecutorController.text = (args['job_executor'] ?? '').toString();
    } else {
      woNumberController.text = (args ?? '').toString();
    }
  }

  @override
  void onClose() {
    woNumberController.dispose();
    jobExecutorController.dispose();
    materialController.dispose();
    unitController.dispose();
    qtyController.dispose();
    prController.dispose();
    super.onClose();
  }

  void setMaterialList(List<wo_model.Material> list) {
    materialList.value = list;
  }

  Future<void> loadMaterialReceived() async {
    try {
      isLoading.value = true;
      
      final result = await _woRepository.getMaterialReceived(woNumberController.text);
      materialReceivedList.value = result.map((item) => wo_model.Material.fromJson(item)).toList();
      
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to load material received: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> addMaterial() async {
    if (!formKey.currentState!.validate()) {
      return;
    }

    try {
      isLoading.value = true;
      
      await _woRepository.addMaterial(
        woNumber: woNumberController.text,
        jobExecutor: jobExecutorController.text,
        material: materialController.text,
        unit: unitController.text,
        qty: double.parse(qtyController.text),
        pr: prController.text.isEmpty ? null : prController.text,
      );
      
      Get.snackbar(
        'Success',
        'Material added successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      
      clearForm();
      Get.back(result: true);
      
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to add material: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> onMaterialChanged(String keyword) async {
    final query = keyword.trim();
    if (query.isEmpty) {
      materialSuggestions.clear();
      isSearchingMaterial.value = false;
      return;
    }

    try {
      isSearchingMaterial.value = true;
      final suggestions = await _woRepository.searchMaterialSuggestions(query);
      materialSuggestions.value = suggestions;
    } catch (_) {
      materialSuggestions.clear();
    } finally {
      isSearchingMaterial.value = false;
    }
  }

  Future<void> applyMaterialSuggestion(String selected) async {
    materialController.text = selected;
    materialSuggestions.clear();

    final uom = await _woRepository.getMaterialUom(selected);
    if (uom != null && uom.trim().isNotEmpty) {
      unitController.text = uom.trim();
    }
  }

  Future<void> removeMaterial(String id) async {
    try {
      final confirm = await Get.dialog<bool>(
        AlertDialog(
          title: const Text('Confirm Delete'),
          content: const Text('Are you sure you want to remove this material item?'),
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
      
      await _woRepository.removeMaterial(id);
      
      materialList.removeWhere((material) => material.id == id);
      
      Get.snackbar(
        'Success',
        'Material removed successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to remove material: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  void clearForm() {
    jobExecutorController.clear();
    materialController.clear();
    unitController.clear();
    qtyController.clear();
    prController.clear();
    materialSuggestions.clear();
  }

  void setJobExecutor(String executor) {
    jobExecutorController.text = executor;
  }

  void setUnit(String unit) {
    unitController.text = unit;
  }
}
