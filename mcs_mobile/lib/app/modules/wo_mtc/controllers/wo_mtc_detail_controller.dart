import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dio/dio.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import '../../../core/services/realtime_service.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../data/repositories/wo_mtc_repository.dart';
import '../../../data/repositories/auth_repository.dart';
import '../../../data/providers/api_service.dart';
import '../../../data/models/wo_mtc_model.dart';
import '../../../data/models/executor_model.dart';
import '../../../data/models/labor_model.dart';
import '../../../data/models/material_mtc_model.dart';
import '../../../data/models/approval_model.dart';
import '../../../data/models/material_request_model.dart';
import '../../../data/models/material_request_payload.dart';
import '../../../data/models/wo_constants.dart';
import '../../../data/models/work_order_model.dart' as wo_model;
import '../../../core/constants/api_constants.dart';
import '../../../core/utils/media_picker_helper.dart';
import '../../../core/widgets/pdf_viewer_page.dart';
import '../../../core/widgets/video_player_page.dart';

class WoMtcDetailController extends GetxController with RealtimeRefresh {
  final WoMtcRepository _woMtcRepository = WoMtcRepository();
  final AuthRepository _authRepository = AuthRepository();
  final ApiService _apiService = ApiService();

  final isLoading = false.obs;
  final isProcessing = false.obs;
  final selectedDetailTab = 0.obs;

  final woDetail = Rx<WorkOrderMtc?>(null);
  final executors = <Executor>[].obs;
  final labor = <Labor>[].obs;
  final material = <MaterialMtc>[].obs;
  final approvalHistory = <Approval>[].obs;
  final materialRequests = <MaterialRequest>[].obs;
  final preventiveParts = <wo_model.PreventivePartExecution>[].obs;
  final partExecutionRows = <wo_model.PreventivePartExecution>[].obs;
  final isPartExecutionDirty = false.obs;
  final detailExtras = <String, dynamic>{}.obs;

  final userDivisionCode = ''.obs;
  final userPosition = ''.obs;
  final userFullname = ''.obs;
  final userId = ''.obs;
  final openSummaryOnly = false.obs;
  final isReadOnlyCrossViewer = false.obs;
  final hasWoExecutorPermission = false.obs;

  String? woNumber;

  WorkOrderMtc? get woHeader => woDetail.value;
  WoStatus? get currentStatus =>
      woHeader != null ? WoStatus.fromCode(woHeader!.status) : null;

  bool get isExecutor {
    final divCode = userDivisionCode.value;
    if (divCode.isEmpty) return false;

    final jobExecutor = woHeader?.jobExecutor ?? '';
    if (jobExecutor.isEmpty) return false;

    return jobExecutor.contains(divCode);
  }

  Executor? get myExecutor {
    final divCode = userDivisionCode.value;
    if (divCode.isEmpty) return null;
    final mine = executors.where((ex) => ex.jobExecutor == divCode).toList();
    if (mine.isEmpty) return null;

    int statusRank(String status) {
      switch (ExecutorStatus.fromCode(status)) {
        case ExecutorStatus.inProgress:
          return 3;
        case ExecutorStatus.waiting:
          return 2;
        case ExecutorStatus.complete:
        case ExecutorStatus.additional:
          return 1;
        default:
          return 0;
      }
    }

    mine.sort((a, b) {
      final byStatus = statusRank(b.status).compareTo(statusRank(a.status));
      if (byStatus != 0) return byStatus;
      return b.id.compareTo(a.id);
    });

    return mine.first;
  }

  bool get canApprove {
    if (isReadOnlyCrossViewer.value) return false;
    final position = userPosition.value;
    final status = currentStatus;

    if (status == null) return false;

    if (position == 'DIVHEAD' && status == WoStatus.waitKaDiv) return true;
    if (position == 'DEPTHEAD' && status == WoStatus.waitKaDeptMeso)
      return true;
    if (position == 'EXECUTOR_ADMIN' && status == WoStatus.waitExecutorAdmin)
      return true;

    return false;
  }

  bool get canExecute {
    if (isReadOnlyCrossViewer.value) return false;
    final status = currentStatus;
    if (status == null) return false;
    return isExecutor &&
        (status == WoStatus.waitExecutorAdmin ||
            status == WoStatus.inProgressExecutor ||
            status == WoStatus.partsReceived);
  }

  bool get canAddJobExplanation {
    if (isReadOnlyCrossViewer.value) return false;
    final status = currentStatus;
    if (status == null || myExecutor == null) return false;

    final executorStatus = ExecutorStatus.fromCode(myExecutor!.status);
    return executorStatus == ExecutorStatus.waiting ||
        executorStatus == ExecutorStatus.inProgress;
  }

  bool get canAddLabor {
    return canExecute;
  }

  bool get canAddMaterial {
    return canExecute;
  }

  bool get canRequestMaterial {
    final status = currentStatus;
    if (status == null) return false;
    return canExecute && status == WoStatus.inProgressExecutor;
  }

  bool get canComplete {
    final status = currentStatus;
    if (status == null || myExecutor == null) return false;

    final executorStatus = ExecutorStatus.fromCode(myExecutor!.status);
    return isExecutor &&
        (status == WoStatus.inProgressExecutor ||
            status == WoStatus.partsReceived ||
            executorStatus == ExecutorStatus.inProgress);
  }

  bool get canUpdatePreventivePart =>
      isPreventiveWo &&
      hasWoExecutorPermission.value &&
      !isReadOnlyCrossViewer.value;

  bool get canClose {
    if (isReadOnlyCrossViewer.value) return false;
    final position = userPosition.value;
    final status = currentStatus;
    final userDiv = userDivisionCode.value;
    final woDiv = woHeader?.divisionCode ?? '';

    if (status == null) return false;

    if (status == WoStatus.needClosed &&
        (position == 'DIVHEAD' || position == 'ADMIN_DIVISI') &&
        userDiv == woDiv) {
      return true;
    }

    if (status == WoStatus.completeExecutor &&
        (position == 'DEPTHEAD' ||
            position == 'DIVHEAD' ||
            position == 'ADMIN_DIVISI') &&
        userDiv == woDiv) {
      return true;
    }

    if (status == WoStatus.needClosed && userDiv == woDiv && position.isEmpty) {
      return true;
    }

    return false;
  }

  bool get canVoid {
    if (isReadOnlyCrossViewer.value) return false;
    final position = userPosition.value;
    return position == 'SUPER' ||
        position == 'DIVHEAD' ||
        position == 'ADMIN_DIVISI';
  }

  bool get canCreateSubWo {
    if (isReadOnlyCrossViewer.value) return false;
    final position = userPosition.value;
    return (position == 'EXECUTOR_ADMIN' || position == 'EXECUTOR_HEAD') &&
        isExecutor;
  }

  bool get hasAnyPermission {
    return canApprove || canExecute || canComplete || canClose || canVoid;
  }

  bool get isPreventiveWo {
    final normalized = (woHeader?.typeWo ?? '').trim().toLowerCase();
    return normalized == 'preventive' ||
        normalized == 'preventive maintenance' ||
        normalized == 'prev maintenance' ||
        normalized == 'pm';
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

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    if (args is Map) {
      woNumber = (args['wo_number'] ?? '').toString();
      openSummaryOnly.value = args['open_summary'] == true ||
          args['source']?.toString() == 'daily_control';
    } else {
      woNumber = args as String?;
    }
    loadUserData();
    if ((woNumber ?? '').isNotEmpty) {
      loadAllData();
      bindRealtime(
        const ['wo', 'wo:meso'],
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
    await loadAllData(silent: true);
  }

  List<MaterialRequest> _materialRequestsFromRaw(dynamic raw) {
    return _mapListFromRaw(raw)
        .map((item) => MaterialRequest.fromJson(item))
        .toList();
  }

  List<Map<String, dynamic>> _mapListFromRaw(dynamic raw) {
    dynamic source = raw;
    if (source is String) {
      try {
        source = jsonDecode(source);
      } catch (_) {}
    }

    final normalized = <dynamic>[];
    if (source is List) {
      normalized.addAll(source);
    } else if (source is Map) {
      if (source['data'] is List) {
        normalized.addAll(source['data'] as List);
      } else {
        normalized.addAll(source.values);
      }
    }

    return normalized
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<void> loadUserData() async {
    try {
      try {
        await _authRepository.getProfile();
      } catch (_) {}
      final prefs = await SharedPreferences.getInstance();
      final hasCrossAccess = (prefs.getInt('wo_cross_access') ?? 0) == 1;
      final hasNativeAccess = (prefs.getInt('wo_mtc') ?? 0) == 1 ||
          (prefs.getInt('wo_mtc_all') ?? 0) == 1;
      isReadOnlyCrossViewer.value = hasCrossAccess && !hasNativeAccess;
      hasWoExecutorPermission.value = (prefs.getInt('wo_executor') ?? 0) == 1;
      userDivisionCode.value = prefs.getString('division_code') ?? '';
      userPosition.value = prefs.getString('id_position') ?? '';
      userFullname.value = prefs.getString('fullname') ?? '';
      userId.value = prefs.getString('id_user') ?? '';

      print('User Data Loaded:');
      print('   - Division Code: ${userDivisionCode.value}');
      print('   - Position: ${userPosition.value}');
      print('   - Name: ${userFullname.value}');
    } catch (e) {
      print('Error loading user data: $e');
    }
  }

  Future<void> loadAllData({bool silent = false}) async {
    await loadWoDetail(silent: silent);
    await Future.wait([
      loadExecutors(silent: silent),
      loadLabor(silent: silent),
      loadMaterial(silent: silent),
      loadMaterialRequests(silent: silent),
      loadApprovalHistory(),
    ]);
  }

  Future<void> loadWoDetail({bool silent = false}) async {
    if (woNumber == null) return;

    try {
      if (!silent) isLoading.value = true;
      final bundle = await _woMtcRepository.getWoDetailBundle(woNumber!);
      final header = (bundle['header'] as Map<String, dynamic>? ?? {});
      detailExtras.value = (bundle['extras'] as Map<String, dynamic>? ?? {});

      final result = WorkOrderMtc.fromJson(header);
      woDetail.value = result;
      if (silent && isPartExecutionDirty.value) return;
      preventiveParts.value = _mapListFromRaw(detailExtras['preventive_parts'])
          .map((item) => wo_model.PreventivePartExecution.fromJson(item))
          .toList();
      if (isPreventiveWo) {
        partExecutionRows.value =
            await _woMtcRepository.getPartExecution(woNumber!);
        preventiveParts.value = partExecutionRows;
      } else {
        partExecutionRows.clear();
      }
      isPartExecutionDirty.value = false;
      if (!silent) _applyInitialDetailTab();
      print('WO Detail Loaded: ${result.woNumber} - ${result.status}');
    } catch (e) {
      print('Error loading WO detail: $e');
      if (!silent) _showError('Gagal memuat detail WO: ${e.toString()}');
    } finally {
      if (!silent) isLoading.value = false;
    }
  }

  void updatePartExecutionRow(int index, wo_model.PreventivePartExecution row) {
    if (index < 0 || index >= partExecutionRows.length) return;
    partExecutionRows[index] = row;
    preventiveParts.value = partExecutionRows.toList();
    isPartExecutionDirty.value = true;
  }

  void togglePartExecutionDone(int index, bool isDone) {
    if (index < 0 || index >= partExecutionRows.length) return;
    updatePartExecutionRow(
        index,
        partExecutionRows[index].copyWith(
          maintenanceStatus: isDone ? 'DONE' : 'PENDING',
        ));
  }

  Future<void> savePartExecution() async {
    if (!canUpdatePreventivePart || woNumber == null) return;
    try {
      isProcessing.value = true;
      await _woMtcRepository.savePartExecution(
        woNumber: woNumber!,
        rows: partExecutionRows.toList(),
      );
      isPartExecutionDirty.value = false;
      await loadAllData();
      _showSuccess('Part preventive tersimpan');
    } catch (e) {
      _showError('Gagal menyimpan part preventive: $e');
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> uploadPartExecutionMedia(int index, String filePath) async {
    if (!canUpdatePreventivePart ||
        woNumber == null ||
        index < 0 ||
        index >= partExecutionRows.length) return;
    final row = partExecutionRows[index];
    try {
      isProcessing.value = true;
      final media = await _woMtcRepository.uploadPartExecutionMedia(
        woNumber: woNumber!,
        customDetailId: row.customDetailId,
        partMesin: row.partMesin,
        filePath: filePath,
      );
      updatePartExecutionRow(
          index,
          row.copyWith(
            executionMedia: [...row.executionMedia, media],
          ));
      _showSuccess('Media part berhasil diupload');
    } catch (e) {
      _showError('Gagal upload media part: $e');
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> loadExecutors({bool silent = false}) async {
    if (woNumber == null) return;

    try {
      final result = await _woMtcRepository.getExecutorList(woNumber!);
      if (result.isNotEmpty) {
        executors.value = result;
      } else {
        final raw = _mapListFromRaw(detailExtras['executors']);
        if (raw.isNotEmpty) {
          executors.value = raw.map(Executor.fromJson).toList();
        } else {
          final jobExecutor = woHeader?.jobExecutor?.trim() ?? '';
          if (jobExecutor.isNotEmpty) {
            final fallback = jobExecutor
                .split(',')
                .map((e) => e.trim())
                .where((e) => e.isNotEmpty)
                .map((code) => Executor.fromJson({
                      'id': 0,
                      'wo_number': woNumber,
                      'job_executor': code,
                      'job_explanation': '',
                      'status': 'WAITING',
                    }))
                .toList();
            executors.value = fallback;
          } else {
            executors.clear();
          }
        }
      }
      print('Executors Loaded: ${result.length} items');
    } catch (e) {
      print('Error loading executors: $e');
      if (silent) return;
      final raw = _mapListFromRaw(detailExtras['executors']);
      if (raw.isNotEmpty) {
        executors.value = raw.map(Executor.fromJson).toList();
      } else {
        executors.clear();
      }
    }
  }

  Future<void> loadLabor({bool silent = false}) async {
    if (woNumber == null) return;

    try {
      final result = await _woMtcRepository.getLaborList(woNumber!);
      if (result.isNotEmpty) {
        labor.value = result;
      } else {
        final raw = _mapListFromRaw(detailExtras['labor']);
        if (raw.isNotEmpty) {
          labor.value = raw.map(Labor.fromJson).toList();
        } else {
          labor.clear();
        }
      }
      print('Labor Loaded: ${result.length} items');
    } catch (e) {
      print('Error loading labor: $e');
      if (silent) return;
      final raw = _mapListFromRaw(detailExtras['labor']);
      if (raw.isNotEmpty) {
        labor.value = raw.map(Labor.fromJson).toList();
      } else {
        labor.clear();
      }
    }
  }

  Future<void> loadMaterial({bool silent = false}) async {
    if (woNumber == null) return;

    try {
      final result = await _woMtcRepository.getMaterialList(woNumber!);
      if (result.isNotEmpty) {
        material.value = result;
      } else {
        final raw = _mapListFromRaw(detailExtras['material']);
        if (raw.isNotEmpty) {
          material.value = raw.map(MaterialMtc.fromJson).toList();
        } else {
          material.clear();
        }
      }
      print('Material Loaded: ${result.length} items');
    } catch (e) {
      print('Error loading material: $e');
      if (silent) return;
      final raw = _mapListFromRaw(detailExtras['material']);
      if (raw.isNotEmpty) {
        material.value = raw.map(MaterialMtc.fromJson).toList();
      } else {
        material.clear();
      }
    }
  }

  Future<void> loadApprovalHistory() async {
    if (woNumber == null) return;

    try {
      final result = await _woMtcRepository.getApprovalHistory(woNumber!);
      approvalHistory.value = result;
      print('Approval History Loaded: ${result.length} items');
    } catch (e) {
      print('Error loading approval history: $e');
    }
  }

  Future<void> loadMaterialRequests({bool silent = false}) async {
    if (woNumber == null) return;

    bool matchesExecutor(MaterialRequest item) {
      final divCode = userDivisionCode.value.trim();
      if (divCode.isEmpty) return true;
      if (item.jobExecutor.trim().isEmpty) return true;
      return item.jobExecutor.trim() == divCode;
    }

    bool isOthers(MaterialRequest item) =>
        item.level.trim().toLowerCase() == 'others';

    try {
      final receivedRaw = await _woMtcRepository.getMaterialReceived(woNumber!);

      final received = receivedRaw.where((item) => !isOthers(item)).toList();
      final receivedOthersForMe = receivedRaw
          .where((item) => isOthers(item) && matchesExecutor(item))
          .toList();

      List<MaterialRequest> purchase = [];
      bool purchaseLoaded = false;

      try {
        purchase = await _woMtcRepository.getMaterialPurchase(woNumber!);
        purchaseLoaded = true;
      } catch (e) {
        print('Warning loading purchase material: $e');
      }

      final purchaseFiltered = purchase
          .where((item) => isOthers(item) && matchesExecutor(item))
          .toList();
      final purchaseUsed =
          purchaseLoaded ? purchaseFiltered : receivedOthersForMe;

      final merged = <String, MaterialRequest>{};
      String makeKey(MaterialRequest item) =>
          '${item.id ?? ''}|${item.requestCode}|${item.part}|${item.level}|${item.date ?? ''}';

      for (final item in [...received, ...purchaseUsed]) {
        merged[makeKey(item)] = item;
      }

      if (merged.isNotEmpty) {
        materialRequests.value = merged.values.toList();
      } else {
        final fromMaterialRequests =
            _materialRequestsFromRaw(detailExtras['material_requests']);
        final fromMaterialReceived =
            _materialRequestsFromRaw(detailExtras['material_received']);
        final fromMaterialPurchase =
            _materialRequestsFromRaw(detailExtras['material_purchase']);
        final fallbackRaw = [
          ...fromMaterialRequests,
          ...fromMaterialReceived,
          ...fromMaterialPurchase,
        ];
        final fallback = fallbackRaw
            .where((item) => !isOthers(item) || matchesExecutor(item))
            .toList();

        if (fallback.isNotEmpty) {
          final dedup = <String, MaterialRequest>{};
          String makeKey(MaterialRequest item) =>
              '${item.id ?? ''}|${item.requestCode}|${item.part}|${item.level}|${item.date ?? ''}';
          for (final item in fallback) {
            dedup[makeKey(item)] = item;
          }
          materialRequests.value = dedup.values.toList();
        } else {
          materialRequests.clear();
        }
      }
      print('Material Requests Loaded: ${materialRequests.length} items');
    } catch (e) {
      print('Error loading material requests: $e');
      if (silent) return;
      final fromMaterialRequests =
          _materialRequestsFromRaw(detailExtras['material_requests']);
      final fromMaterialReceived =
          _materialRequestsFromRaw(detailExtras['material_received']);
      final fromMaterialPurchase =
          _materialRequestsFromRaw(detailExtras['material_purchase']);
      final fallbackRaw = [
        ...fromMaterialRequests,
        ...fromMaterialReceived,
        ...fromMaterialPurchase,
      ];
      final fallback = fallbackRaw
          .where((item) => !isOthers(item) || matchesExecutor(item))
          .toList();
      if (fallback.isNotEmpty) {
        materialRequests.value = fallback;
      } else {
        materialRequests.clear();
      }
    }
  }

  Future<void> refresh() async {
    await loadAllData();
  }

  Future<void> addJobExplanation({
    required String explanation,
    String status = 'IN_PROGRESS',
    int isExternal = 0,
    required List<String> servicePhotoPaths,
  }) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;
      if (servicePhotoPaths.isEmpty) {
        throw Exception('Bukti foto service wajib diupload');
      }

      await _woMtcRepository.addJobExplanation(
        woNumber!,
        explanation,
        status,
        isExternal: isExternal,
        servicePhotoPaths: servicePhotoPaths,
      );

      _showSuccess('Job explanation berhasil ditambahkan');
      await refresh();
    } catch (e) {
      print('Error adding job explanation: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> addLabor({
    required List<String> trades,
    required int men,
    required double hours,
  }) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.addLaborMany(woNumber!, trades, men, hours);

      _showSuccess('Labor berhasil ditambahkan');
      await loadLabor();
    } catch (e) {
      print('Error adding labor: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> removeLabor(Labor laborItem) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.removeLabor(laborItem.idDetailLabor, woNumber!);

      _showSuccess('Labor berhasil dihapus');
      await loadLabor();
    } catch (e) {
      print('Error removing labor: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> addMaterial({
    required String material,
    required double qty,
    required String unit,
    required String pr,
  }) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.addMaterial(woNumber!, material, qty, unit, pr);

      _showSuccess('Material berhasil ditambahkan');
      await loadMaterial();
      await loadMaterialRequests();
    } catch (e) {
      print('Error adding material: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> removeMaterial(MaterialMtc materialItem) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.removeMaterial(
          materialItem.idDetailMaterial, woNumber!);

      _showSuccess('Material berhasil dihapus');
      await loadMaterial();
      await loadMaterialRequests();
    } catch (e) {
      print('Error removing material: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<List<String>> searchMaterialSuggestions(String keyword) async {
    return _woMtcRepository.searchMaterialSuggestions(keyword);
  }

  Future<String?> getMaterialUom(String partName) async {
    return _woMtcRepository.getMaterialUom(partName);
  }

  Future<List<String>> getLaborPicOptions() async {
    return _woMtcRepository.getLaborPicOptions();
  }

  Future<void> requestMaterial(List<MaterialRequestItem> items) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      final payload = MaterialRequestPayload(
        woNumber: woNumber!,
        materials: items,
      );

      await _woMtcRepository.requestMaterial(payload);

      _showSuccess('Material request berhasil disubmit');
      await refresh();
    } catch (e) {
      print('Error requesting material: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> approveWo(String comment) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.approveWo(woNumber!, comment, 'approve');

      _showSuccess('WO berhasil di-approve');
      await refresh();
    } catch (e) {
      print('Error approving WO: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> completeWo(String comment) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.completeWo(woNumber!, comment);

      _showSuccess('WO berhasil di-complete');
      await refresh();
    } catch (e) {
      print('Error completing WO: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> closeWo(String comment) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.closeWo(woNumber!, comment);

      _showSuccess('WO berhasil di-close');
      Get.back(result: true);
    } catch (e) {
      print('Error closing WO: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> voidWo(String reason) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.voidWo(woNumber!, reason);

      _showSuccess('WO berhasil di-void');
      Get.back(result: true);
    } catch (e) {
      print('Error voiding WO: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> createSubWo(String subTo) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      final result = await _woMtcRepository.createSubWo(woNumber!, subTo);

      final subWoNumber = result['data']?['sub_wo_number'] ?? '';
      _showSuccess('Sub WO berhasil dibuat: $subWoNumber');
      await refresh();
    } catch (e) {
      print('Error creating sub WO: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }

  Future<void> viewAssetHistory() async {
    final idEquipment = woHeader?.idEquipment;
    if (idEquipment == null) return;

    try {
      Get.dialog(
        const Center(child: CircularProgressIndicator()),
        barrierDismissible: false,
      );

      final history = await _woMtcRepository.getAssetHistory(idEquipment);

      Get.back();

      Get.bottomSheet(
        Container(
          height: Get.height * 0.7,
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Asset History',
                  style: Get.textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
              ),
              const Divider(),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: history.length,
                  itemBuilder: (context, index) {
                    final wo = history[index];
                    return Card(
                      child: ListTile(
                        title: Text(wo.woNumber),
                        subtitle: Text(
                            '${formatDisplayDate(wo.date)} - ${wo.jobTitle}'),
                        trailing: Chip(
                          label: Text(wo.status),
                          backgroundColor: _getStatusColor(wo.status),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
        isScrollControlled: true,
      );
    } catch (e) {
      Get.back();
      print('Error viewing asset history: $e');
      _showError(e.toString());
    }
  }

  Color _getStatusColor(String status) {
    final woStatus = WoStatus.fromCode(status);
    if (woStatus == null) return Colors.grey;

    if (woStatus.isOpen) return Colors.blue;
    if (woStatus.isInProgress) return Colors.orange;
    if (woStatus.isClosed) return Colors.green;
    if (woStatus.isRejected) return Colors.red;

    return Colors.grey;
  }

  void _showSuccess(String message) {
    Get.snackbar(
      'Sukses',
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.green,
      colorText: Colors.white,
      duration: const Duration(seconds: 2),
    );
  }

  void _showError(String message) {
    Get.snackbar(
      'Error',
      message.replaceAll('Exception: ', ''),
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.red,
      colorText: Colors.white,
      duration: const Duration(seconds: 3),
    );
  }

  double getTotalManHours() {
    return labor.fold(0.0, (sum, item) => sum + item.getTotalManHours());
  }

  String getStatusLabel() {
    return currentStatus?.label ?? woHeader?.status ?? 'Unknown';
  }

  Color getStatusColor() {
    return _getStatusColor(woHeader?.status ?? '');
  }

  Future<void> uploadAttachment(String filePath) async {
    if (woNumber == null) return;

    try {
      isProcessing.value = true;

      await _woMtcRepository.uploadAttachment(woNumber!, filePath);

      _showSuccess('File uploaded successfully');
      await refresh();
    } catch (e) {
      print('Error uploading attachment: $e');
      _showError(e.toString());
    } finally {
      isProcessing.value = false;
    }
  }


  bool isImageAttachment(String filename) {
    final lower = filename.toLowerCase();
    return lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.bmp');
  }

  String _sanitizeFilename(String value) {
    final safe = value.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
    return safe.isEmpty ? 'attachment' : safe;
  }

  Future<Uint8List> _downloadAttachmentBytes(String filename) async {
    final response = await _apiService.get(
      ApiConstants.openAttachmentWoMtc,
      queryParameters: {'filename': filename},
      options: Options(
        responseType: ResponseType.bytes,
        validateStatus: (status) => status != null && status < 500,
      ),
    );

    if (response.statusCode != 200) {
      throw Exception('Attachment tidak ditemukan (${response.statusCode})');
    }

    final data = response.data;
    if (data is Uint8List) {
      return data;
    }
    if (data is List<int>) {
      return Uint8List.fromList(data);
    }
    throw Exception('Format attachment tidak valid');
  }

  Future<void> openAttachmentFile(String filename) async {
    final clean = filename.trim();
    if (clean.isEmpty || clean == '#') {
      _showError('Attachment tidak valid');
      return;
    }

    try {
      isProcessing.value = true;
      final bytes = await _downloadAttachmentBytes(clean);

      if (isImageAttachment(clean)) {
        Get.dialog(
          Dialog(
            insetPadding: const EdgeInsets.all(12),
            child: Stack(
              children: [
                InteractiveViewer(
                  minScale: 0.5,
                  maxScale: 4,
                  child: Image.memory(
                    bytes,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const SizedBox(
                      height: 220,
                      child: Center(child: Text('Gagal memuat gambar')),
                    ),
                  ),
                ),
                Positioned(
                  right: 0,
                  top: 0,
                  child: IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Get.back(),
                  ),
                ),
              ],
            ),
          ),
        );
        return;
      }

      if (MediaPickerHelper.isPdf(clean)) {
        Get.to(() => PdfViewerPage(title: clean, bytes: bytes));
        return;
      }

      final tempDir = await getTemporaryDirectory();
      final filePath = '${tempDir.path}/${_sanitizeFilename(clean)}';
      final file = File(filePath);
      await file.writeAsBytes(bytes, flush: true);

      if (MediaPickerHelper.isVideo(clean)) {
        Get.to(() => VideoPlayerPage(title: clean, file: file));
        return;
      }

      final result = await OpenFile.open(filePath);
      if (result.type != ResultType.done) {
        _showError(
          result.message.isNotEmpty ? result.message : 'Gagal membuka file',
        );
      }
    } catch (e) {
      _showError('Gagal membuka attachment: $e');
    } finally {
      isProcessing.value = false;
    }
  }
}
