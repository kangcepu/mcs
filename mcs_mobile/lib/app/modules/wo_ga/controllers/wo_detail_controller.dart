import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../data/repositories/wo_ga_repository.dart';

class WoGaDetailController extends GetxController {
  final WoGaRepository _woRepository = WoGaRepository();

  final isLoading = false.obs;
  final woDetail = Rx<Map<String, dynamic>?>(null);
  final isProcessing = false.obs;

  final userDivisionCode = ''.obs;
  final userDivisionId = ''.obs;
  final userPosition = ''.obs;
  final userFullname = ''.obs;
  final openSummaryOnly = false.obs;

  String? woNumber;

  List<dynamic> get executors => woDetail.value?['executors'] ?? [];
  List<dynamic> get labor => woDetail.value?['labor'] ?? [];
  List<dynamic> get material => woDetail.value?['material'] ?? [];
  List<dynamic> get materialRequests =>
      woDetail.value?['material_requests'] ?? [];
  Map<String, dynamic> get woHeader => woDetail.value?['wo_header'] ?? {};

  bool get isExecutor {
    final divCode = userDivisionCode.value;
    if (divCode.isEmpty) return false;
    return executors.any((ex) => ex['job_executor'] == divCode);
  }

  bool get canApprove {
    final position = userPosition.value;
    final status = woHeader['status'] ?? '';
    final userDiv = userDivisionCode.value;
    final targetDivisionId = woHeader['id_division']?.toString() ?? '';

    if (status == 'WAIT_KA_DIV' && position == 'DIVHEAD') {
      return true;
    }

    if (status == 'WAIT_KA_DIV_HRGA' &&
        position == 'DIVHEAD' &&
        userDiv == 'HRGA') {
      return true;
    }

    if (status == 'WAIT_KA_DIV_HRGA' &&
        userDiv == 'HRGA' &&
        position.isEmpty) {
      return true;
    }

    if (status == 'COMPLETE_EXECUTOR' &&
        position == 'ADMIN_DIVISI' &&
        userDivisionId.value == targetDivisionId) {
      return true;
    }

    if (status == 'COMPLETE_EXECUTOR' &&
        position == 'DIVHEAD' &&
        userDivisionId.value == targetDivisionId) {
      return true;
    }

    return false;
  }

  bool get canExecute {
    final status = woHeader['status'] ?? '';
    return isExecutor &&
        (status == 'WAIT_EXECUTOR_ADMIN' ||
            status == 'IN_PROGRESS_EXECUTOR' ||
            status == 'COMPLETE_EXECUTOR');
  }

  bool get canComplete {
    final status = woHeader['status'] ?? '';
    return isExecutor &&
        (status == 'IN_PROGRESS_EXECUTOR' || status == 'COMPLETE_EXECUTOR');
  }

  bool get canClose {
    final position = userPosition.value;
    final status = woHeader['status'] ?? '';
    final targetDivisionId = woHeader['id_division']?.toString() ?? '';

    if (status == 'NEED_CLOSED' &&
        position == 'DIVHEAD' &&
        userDivisionId.value == targetDivisionId) {
      return true;
    }

    return false;
  }

  bool get hasAnyPermission {
    return canApprove || canExecute || canComplete || canClose;
  }

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    if (args is Map) {
      woNumber = (args['wo_number'] ?? '').toString();
      openSummaryOnly.value =
          args['open_summary'] == true ||
          args['source']?.toString() == 'daily_control';
    } else {
      woNumber = args as String?;
    }
    loadUserData();
    if ((woNumber ?? '').isNotEmpty) {
      loadWoDetail();
    }
  }

  Future<void> loadUserData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      userDivisionId.value = prefs.getString('id_division') ?? '';
      userDivisionCode.value = prefs.getString('division_code') ?? '';
      userPosition.value = prefs.getString('id_position') ?? '';
      userFullname.value = prefs.getString('fullname') ?? '';
    } catch (e) {
      print('Error loading user data: $e');
    }
  }

  Future<void> loadWoDetail() async {
    if (woNumber == null) return;

    try {
      isLoading.value = true;
      final result = await _woRepository.getWoDetail(woNumber!);
      woDetail.value = result;
    } catch (e) {
      print('Error loading WO detail: $e');
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> refresh() async {
    await loadWoDetail();
  }

  Future<void> approveWo(String comment) async {
    try {
      isProcessing.value = true;
      await _woRepository.approveWo(woNumber!, comment, 'approve');
      Get.snackbar('Success', 'WO approved',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
      await refresh();
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceAll('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> addJobExplanation(
    String explanation,
    String status, {
    required List<String> servicePhotoPaths,
  }) async {
    try {
      isProcessing.value = true;
      if (servicePhotoPaths.isEmpty) {
        throw Exception('Bukti foto service wajib diupload');
      }
      final executor = executors.firstWhere(
          (ex) => ex['job_executor'] == userDivisionCode.value,
          orElse: () => null);
      if (executor == null) throw Exception('Executor not found');
      await _woRepository.addJobExplanation(executor['id'], explanation, status,
          servicePhotoPaths: servicePhotoPaths);
      Get.snackbar('Success', 'Job explanation updated',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
      await refresh();
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceAll('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> addLabor(String trade, int men, double hours) async {
    try {
      isProcessing.value = true;
      await _woRepository.addLabor(
          woNumber!, userDivisionCode.value, trade, men, hours);
      Get.snackbar('Success', 'Labor added',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
      await refresh();
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceAll('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> addMaterial(
      String materialName, double qty, String unit, String pr) async {
    try {
      isProcessing.value = true;
      await _woRepository.addMaterial(
          woNumber!, userDivisionCode.value, materialName, qty, unit, pr);
      Get.snackbar('Success', 'Material added',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
      await refresh();
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceAll('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      isProcessing.value = false;
    }
  }

  Future<List<String>> searchMaterialSuggestions(String keyword) async {
    return _woRepository.searchMaterialSuggestions(keyword);
  }

  Future<String?> getMaterialUom(String partName) async {
    return _woRepository.getMaterialUom(partName);
  }

  Future<List<String>> getLaborPicOptions() async {
    return _woRepository.getLaborPicOptions();
  }

  Future<void> completeWo(String comment) async {
    try {
      isProcessing.value = true;
      await _woRepository.completeWo(woNumber!, comment);
      Get.snackbar('Success', 'WO completed',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
      await refresh();
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceAll('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> closeWo(String comment) async {
    try {
      isProcessing.value = true;
      await _woRepository.closeWo(woNumber!, comment);
      Get.snackbar('Success', 'WO closed',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
      await refresh();
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceAll('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> voidWo(String reason) async {
    try {
      isProcessing.value = true;
      await _woRepository.voidWo(woNumber!, reason);
      Get.snackbar('Success', 'WO voided',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.green,
          colorText: Colors.white);
      Get.back();
    } catch (e) {
      Get.snackbar('Error', e.toString().replaceAll('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.red,
          colorText: Colors.white);
    } finally {
      isProcessing.value = false;
    }
  }
}

