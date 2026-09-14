import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/repositories/wo_operational_repository.dart';

class WoOperationalSubWoController extends GetxController {
  final WoOperationalRepository _woRepository = WoOperationalRepository();
  
  final formKey = GlobalKey<FormState>();
  
  final woNumberController = TextEditingController();
  final subtoController = TextEditingController();
  
  final isLoading = false.obs;
  final selectedSubto = 'GA'.obs;

  final List<Map<String, String>> subtoOptions = [
    {'value': 'GA', 'label': 'General Affairs (GA)'},
    {'value': 'IT', 'label': 'Information Technology (IT)'},
    {'value': 'MES', 'label': 'MESO (MES)'},
  ];

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    if (args is Map) {
      woNumberController.text = (args['wo_number'] ?? '').toString();
    } else {
      woNumberController.text = (args ?? '').toString();
    }
    subtoController.text = 'GA';
  }

  @override
  void onClose() {
    woNumberController.dispose();
    subtoController.dispose();
    super.onClose();
  }

  void setSubto(String subto) {
    selectedSubto.value = subto;
    subtoController.text = subto;
  }

  Future<void> createSubWo() async {
    if (!formKey.currentState!.validate()) {
      return;
    }

    try {
      isLoading.value = true;
      
      final result = await _woRepository.addSubWo(
        woNumber: woNumberController.text,
        subto: selectedSubto.value,
      );
      
      final subWoNumber = result['data']['sub_wo_number'];
      
      Get.snackbar(
        'Success',
        'Sub WO created successfully: $subWoNumber',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
        duration: const Duration(seconds: 5),
      );
      
      Get.back(result: true);
      
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to create sub WO: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  String getSubtoLabel(String subto) {
    final option = subtoOptions.firstWhere(
      (opt) => opt['value'] == subto,
      orElse: () => {'value': subto, 'label': subto},
    );
    return option['label'] ?? subto;
  }

  String getSubtoDescription(String subto) {
    switch (subto) {
      case 'GA':
        return 'Creates a Work Order for General Affairs department (WOGA)';
      case 'IT':
        return 'Creates a Work Order for IT department (WOIT)';
      case 'MES':
        return 'Creates a Work Order for MESO department (WO)';
      default:
        return 'Creates a sub work order';
    }
  }
}
