import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../data/models/work_order_model.dart' as wo_model;
import '../../../data/repositories/wo_operational_repository.dart';
import '../../../data/repositories/material_part_request_repository.dart';
import '../../../data/repositories/auth_repository.dart';
import '../../../core/routes/app_routes.dart';
import '../utils/wo_operational_status_mapper.dart';

class WoOperationalDetailController extends GetxController {
  final WoOperationalRepository _woRepository = WoOperationalRepository();
  final MaterialPartRequestRepository _partRequestRepo =
      MaterialPartRequestRepository();
  final AuthRepository _authRepository = AuthRepository();

  final Rx<wo_model.WorkOrder?> workOrder = Rx<wo_model.WorkOrder?>(null);
  final RxList<wo_model.Executor> executors = <wo_model.Executor>[].obs;
  final RxList<wo_model.Labor> labor = <wo_model.Labor>[].obs;
  final RxList<wo_model.Material> materials = <wo_model.Material>[].obs;
  final RxList<wo_model.Approval> approvals = <wo_model.Approval>[].obs;
  final RxList<wo_model.PreventivePartExecution> partExecutionRows =
      <wo_model.PreventivePartExecution>[].obs;
  final RxList<wo_model.PartImage> servicePhotos = <wo_model.PartImage>[].obs;

  final isLoading = false.obs;
  final isPartExecutionDirty = false.obs;
  final selectedDetailTab = 0.obs;
  final woNumber = ''.obs;
  final openSummaryOnly = false.obs;
  final isReadOnlyCrossViewer = false.obs;
  final hasWoExecutorPermission = false.obs;
  final hasWoVoidPermission = false.obs;

  final userDivisionCode = ''.obs;
  final userDivisionId = ''.obs;
  final userPosition = ''.obs;
  final userFullname = ''.obs;

  bool get isExecutor {
    final divisionCode = userDivisionCode.value.trim().toUpperCase();
    if (divisionCode.isEmpty) {
      return false;
    }

    final executorRaw =
        (workOrder.value?.jobExecutor ?? '').trim().toUpperCase();
    if (executorRaw.isEmpty) {
      return false;
    }

    final tokens = executorRaw
        .split(',')
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();

    return tokens.contains(divisionCode) || executorRaw.contains(divisionCode);
  }

  bool get canApprove {
    if (isReadOnlyCrossViewer.value) return false;
    final status = _normalizeStatus(workOrder.value?.status ?? '');
    final position = userPosition.value.trim().toUpperCase();
    final userDiv = userDivisionCode.value.trim().toUpperCase();

    if (status == 'WAIT_KA_DIV' && position == 'DIVHEAD') {
      return true;
    }

    if (status == 'WAIT_KA_DEPT_MESO' && position == 'DEPTHEAD') {
      return true;
    }

    if (status == 'WAIT_KA_DIV_MTC' &&
        position == 'DIVHEAD' &&
        userDiv == 'MTC') {
      return true;
    }

    if (status == 'WAIT_EXECUTOR_ADMIN' &&
        (position == 'EXECUTOR_ADMIN' || position == 'ADMIN_DIVISI')) {
      return true;
    }

    return false;
  }

  bool get canExecute {
    if (isReadOnlyCrossViewer.value) return false;
    final status = _normalizeStatus(workOrder.value?.status ?? '');
    if (_isFinalStatus(status)) return false;
    return isExecutor &&
        (status == 'WAIT_EXECUTOR_ADMIN' ||
            status == 'WAIT_KA_DIV' ||
            status == 'WAITING_PARTS' ||
            status == 'PARTS_RECEIVED' ||
            status == 'IN_PROGRESS_EXECUTOR');
  }

  /// All preventive part actions require the dedicated executor permission.
  /// Module access alone only allows the user to view the work order.
  bool get canUpdatePreventivePart {
    return hasWoExecutorPermission.value &&
        !isReadOnlyCrossViewer.value &&
        !_isFinalStatus(_normalizeStatus(workOrder.value?.status ?? ''));
  }

  bool get canComplete {
    final status = _normalizeStatus(workOrder.value?.status ?? '');
    if (_isFinalStatus(status)) {
      return false;
    }
    return canExecute;
  }

  bool get canClose {
    return false;
  }

  bool get canVoidPreventive {
    final status = _normalizeStatus(workOrder.value?.status ?? '');
    return hasWoVoidPermission.value &&
        !isReadOnlyCrossViewer.value &&
        isPreventiveWo &&
        !_isFinalStatus(status);
  }

  bool get hasAnyPermission {
    return canApprove || canExecute || canComplete || canClose;
  }

  void setSelectedDetailTab(int index) {
    selectedDetailTab.value = index;
  }

  void _applyInitialDetailTab() {
    if (openSummaryOnly.value) {
      selectedDetailTab.value = 0;
      return;
    }

    selectedDetailTab.value = isPreventiveWo ? 1 : 2;
  }

  String _normalizeStatus(String status) {
    return status.trim().toUpperCase();
  }

  bool _isFinalStatus(String status) {
    return const {
      'CLOSED',
      'COMPLETE',
      'DONE',
      'COMPLETE_EXECUTOR',
      'NEED_CLOSED',
      'VOID',
      'DECLINE',
      'REJECT',
    }.contains(status);
  }

  bool get isPreventiveWo {
    final raw = (workOrder.value?.typeWo ?? '').toUpperCase().trim();
    if (raw.isEmpty) {
      return false;
    }
    return const {
      'PREVENTIVE',
      'PREVENTIVE MAINTENANCE',
      'PREV MAINTENANCE',
      'PM',
    }.contains(raw);
  }

  bool _looksLikeMtcWo(String woNumberValue) {
    final normalized = woNumberValue.trim().toUpperCase();
    if (normalized.isEmpty) {
      return false;
    }

    return normalized.contains('/MTC/') ||
        normalized.contains('/MES/') ||
        normalized.contains('/MKL/') ||
        normalized.contains('/ELC/') ||
        normalized.contains('/SPL/') ||
        normalized.contains('/OTO/');
  }

  bool _isNotFoundDetailError(Object error) {
    final message = error.toString().toLowerCase();
    return message.contains('404') || message.contains('wo not found');
  }

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    if (args is Map) {
      woNumber.value = (args['wo_number'] ?? '').toString();
      openSummaryOnly.value = args['open_summary'] == true ||
          args['source']?.toString() == 'daily_control';
    } else {
      woNumber.value = (args ?? '').toString();
    }
    loadUserData();
    if (woNumber.value.isNotEmpty) {
      loadDetail();
    }
  }

  Future<void> loadUserData() async {
    try {
      try {
        await _authRepository.getProfile();
      } catch (_) {}
      final prefs = await SharedPreferences.getInstance();
      final hasCrossAccess = (prefs.getInt('wo_cross_access') ?? 0) == 1;
      final hasNativeAccess = (prefs.getInt('wo_operational') ?? 0) == 1;
      hasWoExecutorPermission.value = (prefs.getInt('wo_executor') ?? 0) == 1;
      hasWoVoidPermission.value = (prefs.getInt('wo_void') ?? 0) == 1;
      isReadOnlyCrossViewer.value = hasCrossAccess && !hasNativeAccess;
      userDivisionCode.value = prefs.getString('division_code') ?? '';
      userDivisionId.value = prefs.getString('id_division') ??
          prefs.getString('division_id') ??
          '';
      userPosition.value = prefs.getString('id_position') ?? '';
      userFullname.value = prefs.getString('fullname') ?? '';
    } catch (e) {
      debugPrint('Error loading user data: $e');
    }
  }

  Future<void> loadDetail() async {
    try {
      isLoading.value = true;

      final result = await _woRepository.getWoDetail(woNumber.value);
      final detail = wo_model.WorkOrderDetail.fromJson(result);

      workOrder.value = detail.workOrder;
      executors.value = detail.executors;
      labor.value = detail.labor;
      materials.value = detail.material;
      approvals.value = detail.approvals;
      servicePhotos.value = detail.servicePhotos;

      if (isPreventiveWo) {
        final rows = detail.partExecution.isNotEmpty
            ? detail.partExecution
            : detail.preventiveParts;
        partExecutionRows.value = rows;
      } else {
        partExecutionRows.clear();
      }
      _applyInitialDetailTab();
      isPartExecutionDirty.value = false;
    } catch (e) {
      if (_isNotFoundDetailError(e) && _looksLikeMtcWo(woNumber.value)) {
        await Get.offNamed(
          AppRoutes.woMtcDetail,
          arguments: woNumber.value,
        );
        return;
      }

      print('Error loading WO detail: $e');
      Get.snackbar(
        'Error',
        'Failed to load WO detail: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> refresh() async {
    await loadDetail();
  }

  Future<void> approveWo(String comment) async {
    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.approveWo(
        woNumber: woNumber.value,
        comment: comment,
      );

      Get.back();
      Get.snackbar(
        'Success',
        'WO approved successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      await loadDetail();
    } catch (e) {
      Get.back();
      Get.snackbar(
        'Error',
        'Failed to approve WO: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> declineWo(String comment) async {
    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.declineWo(
        woNumber: woNumber.value,
        comment: comment,
      );

      Get.back();
      Get.snackbar(
        'Success',
        'WO declined successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      await loadDetail();
    } catch (e) {
      Get.back();
      Get.snackbar(
        'Error',
        'Failed to decline WO: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> forwardWo(String toDivision, String comment) async {
    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.forwardWo(
        woNumber: woNumber.value,
        toDivision: toDivision,
        comment: comment,
      );

      Get.back();
      Get.snackbar(
        'Success',
        'WO forwarded successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      await loadDetail();
    } catch (e) {
      Get.back();
      Get.snackbar(
        'Error',
        'Failed to forward WO: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> voidDocument(String reason) async {
    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.voidDocument(
        woNumber: woNumber.value,
        reason: reason,
      );

      Get.back();
      Get.snackbar(
        'Success',
        'Document voided successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      await loadDetail();
    } catch (e) {
      Get.back();
      Get.snackbar(
        'Error',
        'Failed to void document: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> voidPreventive(String reason) async {
    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.voidPreventiveWo(
        woNumber: woNumber.value,
        reason: reason,
      );

      Get.back();
      Get.snackbar(
        'Success',
        'WO preventive berhasil di-void',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      await loadDetail();
    } catch (e) {
      Get.back();
      Get.snackbar(
        'Tidak dapat void',
        e.toString(),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> deleteWo() async {
    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.deleteWo(woNumber.value);

      Get.back();
      Get.snackbar(
        'Success',
        'WO deleted successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      Get.back();
    } catch (e) {
      Get.back();
      Get.snackbar(
        'Error',
        'Failed to delete WO: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  void updatePartExecutionRow(
    int index,
    wo_model.PreventivePartExecution row,
  ) {
    if (index < 0 || index >= partExecutionRows.length) {
      return;
    }
    partExecutionRows[index] = row;
    isPartExecutionDirty.value = true;
  }

  void togglePartExecutionDone(int index, bool isDone) {
    if (index < 0 || index >= partExecutionRows.length) {
      return;
    }

    final currentRow = partExecutionRows[index];
    updatePartExecutionRow(
      index,
      currentRow.copyWith(
        maintenanceStatus: isDone ? 'DONE' : 'PENDING',
      ),
    );
  }

  Future<List<String>> searchRequestPartSuggestions(String keyword) async {
    return _woRepository.searchMaterialSuggestions(keyword);
  }

  Future<String?> getRequestPartUom(String partName) async {
    return _woRepository.getMaterialUom(partName);
  }

  Future<List<String>> getLaborPicOptions() async {
    return _woRepository.getLaborPicOptions();
  }

  Future<void> uploadPartExecutionMedia(int index, String filePath) async {
    if (!isPreventiveWo) {
      return;
    }
    if (index < 0 || index >= partExecutionRows.length) {
      return;
    }

    final row = partExecutionRows[index];

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      final uploaded = await _woRepository.uploadPartExecutionMedia(
        woNumber: woNumber.value,
        customDetailId: row.customDetailId,
        partMesin: row.partMesin,
        filePath: filePath,
      );

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      final mergedMedia = [...row.executionMedia, uploaded];
      updatePartExecutionRow(
        index,
        row.copyWith(executionMedia: mergedMedia),
      );

      Get.snackbar(
        'Success',
        'Media berhasil diupload',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal upload media: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> savePartExecution() async {
    if (!isPreventiveWo) {
      return;
    }

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.savePartExecution(
        woNumber: woNumber.value,
        rows: partExecutionRows.toList(),
      );

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      Get.snackbar(
        'Success',
        'Part update tersimpan (sementara)',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );

      await loadDetail();
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal menyimpan part update: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> openJobExplanationPage() async {
    final result = await Get.toNamed(
      AppRoutes.woOperationalJobExplanation,
      arguments: {
        'wo_number': woNumber.value,
        'job_explanation': workOrder.value?.jobExplanation ?? '',
        'status': workOrder.value?.status ?? '',
        'started_planner': workOrder.value?.startedPlanner ?? '',
        'finished_planner': workOrder.value?.finishedPlanner ?? '',
        'estimate_planner': workOrder.value?.estimatePlanner ?? '',
        'started_actual': workOrder.value?.startedActual ?? '',
        'finished_actual': workOrder.value?.finishedActual ?? '',
      },
    );
    if (result == true) {
      await loadDetail();
    }
  }

  Future<void> openUpdatePage() async {
    if (workOrder.value == null) {
      return;
    }

    final result = await Get.toNamed(
      AppRoutes.woOperationalUpdate,
      arguments: workOrder.value,
    );
    if (result == true) {
      await loadDetail();
    }
  }

  Future<void> openSubWoPage() async {
    final result = await Get.toNamed(
      AppRoutes.woOperationalSubWo,
      arguments: {'wo_number': woNumber.value},
    );
    if (result == true) {
      await loadDetail();
    }
  }

  Future<void> openLaborAddPage() async {
    final result = await Get.toNamed(
      AppRoutes.woOperationalLaborAdd,
      arguments: {
        'wo_number': woNumber.value,
        'job_executor': workOrder.value?.jobExecutor ?? '',
      },
    );
    if (result == true) {
      await loadDetail();
    }
  }

  Future<void> openMaterialAddPage() async {
    final result = await Get.toNamed(
      AppRoutes.woOperationalMaterialAdd,
      arguments: {
        'wo_number': woNumber.value,
        'job_executor': workOrder.value?.jobExecutor ?? '',
      },
    );
    if (result == true) {
      await loadDetail();
    }
  }

  Future<void> addLabor({
    required String trade,
    required int men,
    required double hours,
  }) async {
    final jobExecutor = workOrder.value?.jobExecutor ?? '';
    if (trade.trim().isEmpty) {
      Get.snackbar(
        'Error',
        'Trade harus diisi',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return;
    }

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.addLabor(
        woNumber: woNumber.value,
        jobExecutor: jobExecutor,
        trade: trade.trim(),
        men: men,
        hours: hours,
      );

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      Get.snackbar(
        'Success',
        'Labor berhasil ditambahkan',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      await loadDetail();
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal menambah labor: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> addMaterial({
    required String material,
    required double qty,
    required String unit,
    String? pr,
  }) async {
    final jobExecutor = workOrder.value?.jobExecutor ?? '';
    if (material.trim().isEmpty) {
      Get.snackbar(
        'Error',
        'Material harus diisi',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return;
    }

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.addMaterial(
        woNumber: woNumber.value,
        jobExecutor: jobExecutor,
        material: material.trim(),
        unit: unit.trim().isEmpty ? 'PCS' : unit.trim(),
        qty: qty,
        pr: pr?.trim().isEmpty ?? true ? null : pr!.trim(),
      );

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      Get.snackbar(
        'Success',
        'Material berhasil ditambahkan',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      await loadDetail();
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal menambah material: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> requestPart({String? note}) async {
    final jobExecutor = workOrder.value?.jobExecutor ?? '';

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _partRequestRepo.requestPart(
        woNumber: woNumber.value,
        jobExecutor: jobExecutor,
        note: note,
      );

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      Get.snackbar(
        'Request Part',
        'Request part berhasil dikirim. Tim Material akan memproses.',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal request part: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> submitJobExplanation({
    required String jobExplanation,
    required String status,
    required String startedPlanner,
    required String startedActualTime,
    required String finishedPlanner,
    required String finishedActualTime,
    required String estimatePlanner,
    required List<String> servicePhotoPaths,
  }) async {
    if (jobExplanation.trim().isEmpty) {
      Get.snackbar(
        'Error',
        'Job explanation wajib diisi',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
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
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.addJobExplanation(
        woNumber: woNumber.value,
        jobExplanation: jobExplanation.trim(),
        status: status,
        startedPlanner: startedPlanner,
        startedActualTime: startedActualTime,
        finishedPlanner: finishedPlanner,
        finishedActualTime: finishedActualTime,
        estimatePlanner: estimatePlanner,
        servicePhotoPaths: servicePhotoPaths,
      );

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      Get.snackbar(
        'Success',
        'Job explanation berhasil disimpan',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      await loadDetail();
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal menyimpan job explanation: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> createSubWo(String subto) async {
    if (subto.trim().isEmpty) {
      Get.snackbar(
        'Error',
        'Pilih tujuan Sub WO',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
      return;
    }

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      final result = await _woRepository.addSubWo(
        woNumber: woNumber.value,
        subto: subto,
      );

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      final subWoNumber =
          ((result['data'] ?? const {})['sub_wo_number'] ?? '').toString();

      Get.snackbar(
        'Success',
        subWoNumber.isEmpty
            ? 'Sub WO berhasil dibuat'
            : 'Sub WO berhasil dibuat: $subWoNumber',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      await loadDetail();
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal membuat Sub WO: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> removeLabor(String id) async {
    final confirm = await Get.dialog<bool>(
      AlertDialog(
        title: const Text('Hapus Labor'),
        content: const Text('Yakin ingin menghapus labor ini?'),
        actions: [
          TextButton(
            onPressed: () => Get.back(result: false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Get.back(result: true),
            child: const Text('Hapus', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.removeLabor(id);

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      Get.snackbar(
        'Success',
        'Labor berhasil dihapus',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      await loadDetail();
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal menghapus labor: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> removeMaterial(String id) async {
    final confirm = await Get.dialog<bool>(
      AlertDialog(
        title: const Text('Hapus Material'),
        content: const Text('Yakin ingin menghapus material ini?'),
        actions: [
          TextButton(
            onPressed: () => Get.back(result: false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Get.back(result: true),
            child: const Text('Hapus', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      await _woRepository.removeMaterial(id);

      if (Get.isDialogOpen == true) {
        Get.back();
      }

      Get.snackbar(
        'Success',
        'Material berhasil dihapus',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      await loadDetail();
    } catch (e) {
      if (Get.isDialogOpen == true) {
        Get.back();
      }
      Get.snackbar(
        'Error',
        'Gagal menghapus material: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Color getStatusColor(String status) {
    return WoOperationalStatusMapper.badgeTextColor(status);
  }

  Color getStatusBgColor(String status) {
    return WoOperationalStatusMapper.badgeBgColor(status);
  }

  String getStatusLabel(String status) {
    return WoOperationalStatusMapper.mapStatusDisplay(status);
  }
}
