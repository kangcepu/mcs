import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../data/repositories/wo_operational_repository.dart';
import '../../../data/models/work_order_model.dart';
import '../../../core/utils/media_picker_helper.dart';

class WoOperationalJobExplanationController extends GetxController {
  final WoOperationalRepository _woRepository = WoOperationalRepository();

  final formKey = GlobalKey<FormState>();

  final woNumberController = TextEditingController();
  final jobExplanationController = TextEditingController();
  final statusController = TextEditingController();
  final startedPlannerController = TextEditingController();
  final startedActualTimeController = TextEditingController();
  final finishedPlannerController = TextEditingController();
  final finishedActualTimeController = TextEditingController();
  final estimatePlannerController = TextEditingController();

  final isLoading = false.obs;
  final selectedStatus = 'IN_PROGRESS'.obs;
  final selectedServicePhotoPaths = <String>[].obs;

  final List<String> statusOptions = [
    'IN_PROGRESS',
    'COMPLETE',
    'FORWARD_TO_MESO',
  ];

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    if (args is Map) {
      woNumberController.text = (args['wo_number'] ?? '').toString();
      jobExplanationController.text = (args['job_explanation'] ?? '').toString();

      final rawStatus = (args['status'] ?? '').toString().trim().toUpperCase();
      if (rawStatus == 'FORWARD_TO_MESO' || rawStatus == 'FOWARD_TO_MESO') {
        selectedStatus.value = 'FORWARD_TO_MESO';
      } else if (rawStatus == 'COMPLETE' || rawStatus == 'COMPLETE_EXECUTOR') {
        selectedStatus.value = 'COMPLETE';
      } else {
        selectedStatus.value = 'IN_PROGRESS';
      }
      statusController.text = selectedStatus.value;

      final startedPlanner = (args['started_planner'] ?? '').toString();
      final finishedPlanner = (args['finished_planner'] ?? '').toString();
      final startedActual = (args['started_actual'] ?? '').toString();
      final finishedActual = (args['finished_actual'] ?? '').toString();
      final estimatePlanner = (args['estimate_planner'] ?? '').toString();

      if (startedPlanner.isNotEmpty) {
        startedPlannerController.text = _extractDate(startedPlanner);
      }
      if (finishedPlanner.isNotEmpty) {
        finishedPlannerController.text = _extractDate(finishedPlanner);
      }
      if (startedActual.isNotEmpty) {
        startedActualTimeController.text = _extractTime(startedActual);
      }
      if (finishedActual.isNotEmpty) {
        finishedActualTimeController.text = _extractTime(finishedActual);
      }
      if (estimatePlanner.isNotEmpty) {
        estimatePlannerController.text = estimatePlanner;
      }
    } else {
      woNumberController.text = (args ?? '').toString();
    }

    if (startedPlannerController.text.isEmpty ||
        finishedPlannerController.text.isEmpty ||
        startedActualTimeController.text.isEmpty ||
        finishedActualTimeController.text.isEmpty ||
        estimatePlannerController.text.isEmpty) {
      setDefaultTimes();
    }
  }

  @override
  void onClose() {
    selectedServicePhotoPaths.clear();
    woNumberController.dispose();
    jobExplanationController.dispose();
    statusController.dispose();
    startedPlannerController.dispose();
    startedActualTimeController.dispose();
    finishedPlannerController.dispose();
    finishedActualTimeController.dispose();
    estimatePlannerController.dispose();
    super.onClose();
  }

  void setDefaultTimes() {
    final now = DateTime.now();
    final dateStr =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final timeStr =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    startedPlannerController.text = dateStr;
    finishedPlannerController.text = dateStr;
    startedActualTimeController.text = timeStr;
    finishedActualTimeController.text = timeStr;
    estimatePlannerController.text = '1';
  }

  String _extractDate(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return value;
    if (value.contains(' ')) {
      return value.split(' ').first;
    }
    return value;
  }

  String _extractTime(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return value;
    if (value.contains(' ')) {
      final split = value.split(' ');
      if (split.length > 1) {
        final time = split[1];
        if (time.length >= 5) {
          return time.substring(0, 5);
        }
        return time;
      }
    }
    if (value.length >= 5 && value.contains(':')) {
      return value.substring(0, 5);
    }
    return value;
  }

  void setStatus(String status) {
    selectedStatus.value = status;
    statusController.text = status;
  }

  bool _isPreventiveType(String? rawType) {
    final normalized = (rawType ?? '').trim().toUpperCase();
    return [
      'PREVENTIVE',
      'PREVENTIVE MAINTENANCE',
      'PREV MAINTENANCE',
      'PM',
    ].contains(normalized);
  }

  Future<void> submitJobExplanation({
    required List<String> servicePhotoPaths,
  }) async {
    if (!formKey.currentState!.validate()) {
      return;
    }
    if (servicePhotoPaths.isEmpty) {
      Get.snackbar(
        'Error',
        'Bukti foto service wajib diupload',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return;
    }

    try {
      isLoading.value = true;

      if (selectedStatus.value == 'COMPLETE') {
        final detailRaw =
            await _woRepository.getWoDetail(woNumberController.text.trim());
        final detail = WorkOrderDetail.fromJson(detailRaw);
        final isPreventive = _isPreventiveType(detail.workOrder.typeWo);

        if (isPreventive) {
          final partRows = detail.partExecution.isNotEmpty
              ? detail.partExecution
              : detail.preventiveParts;
          final pendingParts = partRows
              .where((item) => item.maintenanceStatus != 'DONE')
              .map((item) => item.partMesin)
              .where((item) => item.trim().isNotEmpty)
              .toList();

          if (pendingParts.isNotEmpty) {
            final preview = pendingParts.take(5).join(', ');
            throw Exception(
              'Part preventive belum selesai: $preview',
            );
          }
        }
      }

      await _woRepository.addJobExplanation(
        woNumber: woNumberController.text,
        jobExplanation: jobExplanationController.text,
        status: selectedStatus.value,
        startedPlanner: startedPlannerController.text,
        startedActualTime: startedActualTimeController.text,
        finishedPlanner: finishedPlannerController.text,
        finishedActualTime: finishedActualTimeController.text,
        estimatePlanner: estimatePlannerController.text,
        servicePhotoPaths: servicePhotoPaths,
      );

      Get.snackbar(
        'Success',
        'Job explanation submitted successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      Get.back(result: true);
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to submit job explanation: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> pickServicePhotoFromCamera() async {
    final file = await MediaPickerHelper.pickImageFromCamera();
    if (file == null) {
      return;
    }
    selectedServicePhotoPaths.add(file.path);
  }

  Future<void> pickServicePhotosFromGallery() async {
    final files = await MediaPickerHelper.pickMultiImageFromGallery();
    if (files.isEmpty) {
      return;
    }
    selectedServicePhotoPaths.addAll(files.map((item) => item.path));
  }

  void removeServicePhotoAt(int index) {
    if (index < 0 || index >= selectedServicePhotoPaths.length) {
      return;
    }
    selectedServicePhotoPaths.removeAt(index);
  }

  String getStatusLabel(String status) {
    switch (status) {
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETE':
        return 'Complete';
      case 'FORWARD_TO_MESO':
        return 'Forward to MESO';
      default:
        return status;
    }
  }
}
