import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/services/realtime_service.dart';
import '../../../data/repositories/wo_production_repository.dart';

class WoProductionDetailController extends GetxController
    with RealtimeRefresh {
  final WoProductionRepository _woProductionRepository =
      WoProductionRepository();

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
  Map<String, dynamic> get woHeader => woDetail.value?['wo_header'] ?? {};

  bool get isExecutor {
    final divCode = userDivisionCode.value;
    if (divCode.isEmpty) return false;
    return executors.any((ex) => ex['job_executor'] == divCode);
  }

  bool get canApprove {
    final position = userPosition.value;
    final status = (woHeader['status'] ?? '').toString();
    final userDiv = userDivisionCode.value;
    final sameDivision = _isSameWoDivision;

    if (status == 'WAIT_KA_DIV' && position == 'DIVHEAD') {
      return true;
    }

    if (status == 'WAIT_KA_DIV_MTC' &&
        position == 'DIVHEAD' &&
        userDiv == 'MTC') {
      return true;
    }

    if (status == 'COMPLETE_EXECUTOR' &&
        position == 'ADMIN_DIVISI' &&
        sameDivision) {
      return true;
    }

    if (status == 'COMPLETE_EXECUTOR' &&
        position == 'DIVHEAD' &&
        sameDivision) {
      return true;
    }

    return false;
  }

  bool get canExecute {
    final status = (woHeader['status'] ?? '').toString();
    return isExecutor &&
        (status == 'WAIT_EXECUTOR_ADMIN' ||
            status == 'WAIT_KA_DIV' ||
            status == 'WAITING_PARTS' ||
            status == 'PARTS_RECEIVED' ||
            status == 'IN_PROGRESS_EXECUTOR' ||
            status == 'COMPLETE_EXECUTOR');
  }

  bool get canComplete {
    final status = (woHeader['status'] ?? '').toString();
    return isExecutor &&
        (status == 'WAIT_EXECUTOR_ADMIN' ||
            status == 'WAIT_KA_DIV' ||
            status == 'WAITING_PARTS' ||
            status == 'PARTS_RECEIVED' ||
            status == 'IN_PROGRESS_EXECUTOR' ||
            status == 'COMPLETE_EXECUTOR');
  }

  bool get canClose {
    final position = userPosition.value;
    final status = (woHeader['status'] ?? '').toString();

    if (status == 'NEED_CLOSED' && position == 'DIVHEAD' && _isSameWoDivision) {
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
      bindRealtime(
        const ['wo', 'wo:production'],
        _silentRefresh,
        where: (e) => e.woNumber == null || e.woNumber == woNumber,
      );
    }
  }

  Future<void> _silentRefresh() async {
    if (isProcessing.value) {
      await Future.delayed(const Duration(seconds: 1));
      if (isProcessing.value) return;
    }
    await loadWoDetail(silent: true);
  }

  Future<void> loadUserData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      userDivisionCode.value = prefs.getString('division_code') ?? '';
      userDivisionId.value = prefs.getString('division_id') ?? '';
      userPosition.value = prefs.getString('id_position') ?? '';
      userFullname.value = prefs.getString('fullname') ?? '';
    } catch (e) {
      print('Error loading user data: $e');
    }
  }

  Future<void> loadWoDetail({bool silent = false}) async {
    if (woNumber == null) return;

    try {
      if (!silent) isLoading.value = true;
      final result = await _woProductionRepository.getWoDetail(woNumber!);
      woDetail.value = result;
    } catch (e) {
      print('Error loading WO detail: $e');
    } finally {
      if (!silent) isLoading.value = false;
    }
  }

  @override
  Future<void> refresh() async {
    await loadWoDetail();
  }

  Future<void> approveWo(String comment) async {
    try {
      isProcessing.value = true;
      await _woProductionRepository.approveWo(woNumber!, comment, 'approve');
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
      await _woProductionRepository.addJobExplanation(
          executor['id'], explanation, status,
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
      await _woProductionRepository.addLabor(
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
      await _woProductionRepository.addMaterial(
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
    return _woProductionRepository.searchMaterialSuggestions(keyword);
  }

  Future<String?> getMaterialUom(String partName) async {
    return _woProductionRepository.getMaterialUom(partName);
  }

  Future<List<String>> getLaborPicOptions() async {
    return _woProductionRepository.getLaborPicOptions();
  }

  Future<void> completeWo(String comment) async {
    try {
      isProcessing.value = true;
      await _woProductionRepository.completeWo(woNumber!, comment);
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
      await _woProductionRepository.closeWo(woNumber!, comment);
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
      await _woProductionRepository.voidWo(woNumber!, reason);
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

  bool get _isSameWoDivision {
    final woDivision = (woHeader['id_division'] ?? '').toString();
    if (woDivision.isEmpty) {
      return false;
    }
    return woDivision == userDivisionId.value;
  }
}
