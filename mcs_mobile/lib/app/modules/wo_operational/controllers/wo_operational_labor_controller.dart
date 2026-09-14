import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/models/work_order_model.dart' as wo_model;
import '../../../data/repositories/wo_operational_repository.dart';

class WoOperationalLaborController extends GetxController {
  final WoOperationalRepository _woRepository = WoOperationalRepository();

  final formKey = GlobalKey<FormState>();

  final woNumberController = TextEditingController();
  final jobExecutorController = TextEditingController();
  final tradeController = TextEditingController();
  final menController = TextEditingController();
  final hoursController = TextEditingController();

  final RxList<wo_model.Labor> laborList = <wo_model.Labor>[].obs;
  final RxList<String> picOptions = <String>[].obs;
  final RxList<String> selectedPics = <String>[].obs;
  final isLoadingPics = false.obs;
  final isLoading = false.obs;

  int? _tryParseInt(String raw) {
    final normalized = raw.trim();
    if (normalized.isEmpty) return null;
    return int.tryParse(normalized);
  }

  double? _tryParseDouble(String raw) {
    final normalized = raw.trim();
    if (normalized.isEmpty) return null;
    return double.tryParse(normalized.replaceAll(' ', '').replaceAll(',', '.'));
  }

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
    loadPicOptions();
  }

  @override
  void onClose() {
    woNumberController.dispose();
    jobExecutorController.dispose();
    tradeController.dispose();
    menController.dispose();
    hoursController.dispose();
    super.onClose();
  }

  void setLaborList(List<wo_model.Labor> list) {
    laborList.value = list;
  }

  Future<void> loadPicOptions() async {
    try {
      isLoadingPics.value = true;
      final options = await _woRepository.getLaborPicOptions();
      picOptions.value = options;
      if (tradeController.text.trim().isEmpty && options.isNotEmpty) {
        tradeController.text = options.first;
      }
    } catch (_) {
      picOptions.clear();
    } finally {
      isLoadingPics.value = false;
    }
  }

  Future<void> addLabor() async {
    if (!formKey.currentState!.validate()) {
      return;
    }

    try {
      isLoading.value = true;

      final tradeValue = picOptions.isNotEmpty
          ? selectedPics.map((value) => value.trim()).where((v) => v.isNotEmpty)
          : tradeController.text
              .split(',')
              .map((value) => value.trim())
              .where((value) => value.isNotEmpty);

      final tradeList = tradeValue.toSet().toList();
      if (tradeList.isEmpty) {
        throw Exception('PIC wajib dipilih');
      }
      if (tradeList.length > 10) {
        throw Exception('Maksimal 10 user');
      }

      final men = _tryParseInt(menController.text);
      if (men == null) {
        throw Exception('Men harus berupa angka');
      }
      final hours = _tryParseDouble(hoursController.text);
      if (hours == null) {
        throw Exception('Hours harus berupa angka');
      }

      await _woRepository.addLabor(
        woNumber: woNumberController.text,
        jobExecutor: jobExecutorController.text,
        trade: tradeList.join(','),
        men: men,
        hours: hours,
      );

      Get.snackbar(
        'Success',
        'Labor added successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      clearForm();
      Get.back(result: true);
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to add labor: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> removeLabor(String id) async {
    try {
      final confirm = await Get.dialog<bool>(
        AlertDialog(
          title: const Text('Confirm Delete'),
          content:
              const Text('Are you sure you want to remove this labor item?'),
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

      await _woRepository.removeLabor(id);

      laborList.removeWhere((labor) => labor.id == id);

      Get.snackbar(
        'Success',
        'Labor removed successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to remove labor: ${e.toString()}',
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
    tradeController.clear();
    menController.clear();
    hoursController.clear();
    selectedPics.clear();
  }

  void setJobExecutor(String executor) {
    jobExecutorController.text = executor;
  }

  void setTrade(String trade) {
    tradeController.text = trade;
  }
}
