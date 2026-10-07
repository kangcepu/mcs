import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/routes/app_routes.dart';
import '../../../core/services/realtime_service.dart';
import '../../../data/models/approval_center_model.dart';
import '../../../data/repositories/approval_repository.dart';

class ApprovalController extends GetxController with RealtimeRefresh {
  final ApprovalRepository _repository = ApprovalRepository();

  final isLoading = false.obs;
  final isProcessing = false.obs;
  final processingItemKey = ''.obs;
  final selectedCategory = ''.obs;
  final loadingSections = <String, bool>{}.obs;
  final loadedSections = <String, bool>{}.obs;

  final summary = const ApprovalSummary(
    woApprovals: 0,
    woClosings: 0,
    mutations: 0,
    materials: 0,
  ).obs;

  final woApprovals = <ApprovalItem>[].obs;
  final woClosings = <ApprovalItem>[].obs;
  final mutations = <ApprovalItem>[].obs;
  final materials = <ApprovalItem>[].obs;

  @override
  void onInit() {
    super.onInit();
    refreshAll();
    bindRealtime(const ['approval', 'wo', 'asset-mutation'], _silentRefresh);
  }

  Future<void> _silentRefresh() async {
    if (isLoading.value || isProcessing.value) return;
    try {
      final loaded = loadedSections.entries
          .where((entry) => entry.value == true)
          .map((entry) => entry.key)
          .toList();
      final nextSummary = await _repository.getSummary();
      final results = await Future.wait<List<ApprovalItem>?>(
        loaded.map((section) => _fetchSection(section)),
      );
      summary.value = nextSummary;
      for (var i = 0; i < loaded.length; i++) {
        final items = results[i];
        if (items == null) continue;
        switch (loaded[i]) {
          case 'wo_approvals':
            woApprovals.assignAll(items);
            break;
          case 'wo_closings':
            woClosings.assignAll(items);
            break;
          case 'mutations':
            mutations.assignAll(items);
            break;
          case 'materials':
            materials.assignAll(items);
            break;
        }
      }
    } catch (_) {}
  }

  Future<List<ApprovalItem>?> _fetchSection(String section) async {
    try {
      switch (section) {
        case 'wo_approvals':
          return await _repository.getWoApprovals();
        case 'wo_closings':
          return await _repository.getWoClosings();
        case 'mutations':
          return await _repository.getMutations();
        case 'materials':
          return await _repository.getMaterials();
      }
    } catch (_) {}
    return null;
  }

  Future<void> refreshAll({List<String>? keepSectionsLoaded}) async {
    final sectionsToReload = (keepSectionsLoaded ?? const <String>[])
        .where((section) => section.trim().isNotEmpty)
        .toSet()
        .toList();

    try {
      isLoading.value = true;
      summary.value = await _repository.getSummary();
      woApprovals.clear();
      woClosings.clear();
      mutations.clear();
      materials.clear();
      loadedSections.clear();
      loadingSections.clear();

      for (final section in sectionsToReload) {
        await ensureSectionLoaded(section);
      }
    } catch (e) {
      _showSnackbar(
        title: 'Approval',
        message: e.toString().replaceFirst('Exception: ', ''),
        backgroundColor: Colors.red,
      );
    } finally {
      isLoading.value = false;
    }
  }

  String itemKey(ApprovalItem item) =>
      '${item.actionType}|${item.woNumber.isNotEmpty ? item.woNumber : item.docNo}';

  RxList<ApprovalItem>? _listFor(String actionType) {
    switch (actionType) {
      case 'approve_wo':
        return woApprovals;
      case 'close_wo':
        return woClosings;
      case 'approve_mutation':
        return mutations;
      default:
        return null;
    }
  }

  void _adjustSummary(String actionType, String moduleKey, int delta) {
    final current = summary.value;
    final categories = Map<String, int>.from(current.categories);
    final category = _mapModuleToCategory(moduleKey);
    if (category.isNotEmpty) {
      categories[category] = (categories[category] ?? 0) + delta;
      if (categories[category]! < 0) categories[category] = 0;
    }
    switch (actionType) {
      case 'approve_wo':
        summary.value = ApprovalSummary(
          woApprovals: (current.woApprovals + delta).clamp(0, 1 << 30),
          woClosings: current.woClosings,
          mutations: current.mutations,
          materials: current.materials,
          categories: categories,
        );
        break;
      case 'close_wo':
        summary.value = ApprovalSummary(
          woApprovals: current.woApprovals,
          woClosings: (current.woClosings + delta).clamp(0, 1 << 30),
          mutations: current.mutations,
          materials: current.materials,
          categories: categories,
        );
        break;
      case 'approve_mutation':
        summary.value = ApprovalSummary(
          woApprovals: current.woApprovals,
          woClosings: current.woClosings,
          mutations: (current.mutations + delta).clamp(0, 1 << 30),
          materials: current.materials,
          categories: categories,
        );
        break;
    }
  }

  Future<void> handleAction(ApprovalItem item) async {
    if (isProcessing.value) {
      return;
    }

    final list = _listFor(item.actionType);
    if (list == null) {
      _showSnackbar(
        title: 'Approval',
        message: 'Aksi belum tersedia untuk item ini.',
        backgroundColor: Colors.orange,
      );
      return;
    }

    // Optimistic update: remove the item and decrement counters immediately
    // so the tap feels instant, then reconcile silently with the server.
    final index = list.indexWhere(
      (row) => row.woNumber == item.woNumber && row.docNo == item.docNo,
    );
    if (index != -1) list.removeAt(index);
    _adjustSummary(item.actionType, item.moduleKey, -1);

    try {
      isProcessing.value = true;
      processingItemKey.value = itemKey(item);

      if (item.actionType == 'approve_wo') {
        await _repository.approveWo(
          module: item.moduleKey,
          woNumber: item.woNumber,
        );
      } else if (item.actionType == 'close_wo') {
        await _repository.closeWo(
          module: item.moduleKey,
          woNumber: item.woNumber,
        );
      } else if (item.actionType == 'approve_mutation') {
        await _repository.approveMutation(docNo: item.docNo);
      }

      _showSnackbar(
        title: 'Approval',
        message: item.actionLabel.isNotEmpty
            ? '${item.actionLabel} berhasil.'
            : 'Aksi berhasil diproses.',
        backgroundColor: Colors.green,
      );
    } catch (e) {
      // Revert the optimistic change since the action failed server-side.
      if (index != -1) {
        list.insert(index.clamp(0, list.length), item);
      } else {
        list.add(item);
      }
      _adjustSummary(item.actionType, item.moduleKey, 1);
      _showSnackbar(
        title: 'Approval',
        message: e.toString().replaceFirst('Exception: ', ''),
        backgroundColor: Colors.red,
      );
    } finally {
      isProcessing.value = false;
      processingItemKey.value = '';
    }
    // Reconcile with the server after isProcessing clears so _silentRefresh
    // (which no-ops while a processing flag is set) actually runs.
    await _silentRefresh();
  }

  Future<void> openRelatedDetail(ApprovalItem item) async {
    if (item.woNumber.isEmpty) {
      return;
    }

    String? route;
    switch (item.moduleKey) {
      case 'wo_it':
        route = AppRoutes.woDetail;
        break;
      case 'wo_mtc':
        route = AppRoutes.woMtcDetail;
        break;
      case 'wo_operational':
        route = AppRoutes.woOperationalDetail;
        break;
      case 'wo_preventive':
        route = AppRoutes.woProductionDetail;
        break;
      case 'wo_ga':
        route = AppRoutes.woGaDetail;
        break;
    }

    if (route == null) {
      _showSnackbar(
        title: 'Approval',
        message: 'Detail untuk modul ini belum tersedia di mobile.',
        backgroundColor: Colors.orange,
      );
      return;
    }

    final result = await Get.toNamed(route, arguments: item.woNumber);
    if (result == true) {
      final sectionsToReload = loadedSections.entries
          .where((entry) => entry.value == true)
          .map((entry) => entry.key)
          .toList();
      await refreshAll(keepSectionsLoaded: sectionsToReload);
    }
  }

  int countOf(String section) {
    switch (section) {
      case 'wo_approvals':
        return _isSectionLoaded(section)
            ? filteredWoApprovals.length
            : summary.value.woApprovals;
      case 'wo_closings':
        return _isSectionLoaded(section)
            ? filteredWoClosings.length
            : summary.value.woClosings;
      case 'mutations':
        return _isSectionLoaded(section)
            ? mutations.length
            : summary.value.mutations;
      case 'materials':
        return _isSectionLoaded(section)
            ? filteredMaterials.length
            : summary.value.materials;
      default:
        return 0;
    }
  }

  List<ApprovalItem> itemsOf(String section) {
    switch (section) {
      case 'wo_approvals':
        return filteredWoApprovals;
      case 'wo_closings':
        return filteredWoClosings;
      case 'mutations':
        return mutations;
      case 'materials':
        return filteredMaterials;
      default:
        return const <ApprovalItem>[];
    }
  }

  List<ApprovalItem> get filteredWoApprovals => _filterByCategory(woApprovals);

  List<ApprovalItem> get filteredWoClosings => _filterByCategory(woClosings);

  List<ApprovalItem> get filteredMaterials => _filterByCategory(materials);

  List<ApprovalItem> _filterByCategory(List<ApprovalItem> items) {
    final category = selectedCategory.value.trim();
    if (category.isEmpty) {
      return items;
    }

    return items
        .where((item) => _mapModuleToCategory(item.moduleKey) == category)
        .toList();
  }

  void toggleCategory(String key) {
    if (selectedCategory.value == key) {
      selectedCategory.value = '';
      return;
    }

    selectedCategory.value = key;
  }

  bool isSectionLoading(String section) => loadingSections[section] == true;

  bool isSectionLoaded(String section) => _isSectionLoaded(section);

  Future<void> ensureSectionLoaded(String section) async {
    if (_isSectionLoaded(section) || isSectionLoading(section)) {
      return;
    }

    loadingSections[section] = true;
    try {
      switch (section) {
        case 'wo_approvals':
          woApprovals.assignAll(await _repository.getWoApprovals());
          break;
        case 'wo_closings':
          woClosings.assignAll(await _repository.getWoClosings());
          break;
        case 'mutations':
          mutations.assignAll(await _repository.getMutations());
          break;
        case 'materials':
          materials.assignAll(await _repository.getMaterials());
          break;
      }
      loadedSections[section] = true;
    } catch (e) {
      _showSnackbar(
        title: 'Approval',
        message: e.toString().replaceFirst('Exception: ', ''),
        backgroundColor: Colors.red,
      );
    } finally {
      loadingSections[section] = false;
    }
  }

  bool _isSectionLoaded(String section) => loadedSections[section] == true;

  List<ApprovalCategorySummary> get woCategorySummaries {
    return [
      ApprovalCategorySummary(
        key: 'MTC',
        label: 'MTC',
        count: summary.value.categoryCount('MTC'),
        color: const Color(0xFF2563EB),
      ),
      ApprovalCategorySummary(
        key: 'MESO',
        label: 'MESO',
        count: summary.value.categoryCount('MESO'),
        color: const Color(0xFF7C3AED),
      ),
      ApprovalCategorySummary(
        key: 'IS',
        label: 'IS',
        count: summary.value.categoryCount('IS'),
        color: const Color(0xFF0EA5E9),
      ),
      ApprovalCategorySummary(
        key: 'GA',
        label: 'GA',
        count: summary.value.categoryCount('GA'),
        color: const Color(0xFF059669),
      ),
      ApprovalCategorySummary(
        key: 'PRO',
        label: 'PROD',
        count: summary.value.categoryCount('PRO'),
        color: const Color(0xFFD97706),
      ),
    ];
  }

  // Must mirror backend's moduleToCat in approval-center.ts getCategoryCounts,
  // otherwise the category strip counts disagree with what the filter shows.
  String _mapModuleToCategory(String moduleKey) {
    switch (moduleKey.trim().toLowerCase()) {
      case 'wo_operational':
        return 'MTC';
      case 'wo_mtc':
        return 'MESO';
      case 'wo_it':
        return 'IS';
      case 'wo_ga':
        return 'GA';
      case 'wo_preventive':
        return 'PRO';
      default:
        return '';
    }
  }

  void _showSnackbar({
    required String title,
    required String message,
    required Color backgroundColor,
  }) {
    if (Get.isSnackbarOpen) return;
    Get.snackbar(
      title,
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: backgroundColor,
      colorText: Colors.white,
      margin: const EdgeInsets.all(16),
      duration: const Duration(seconds: 3),
    );
  }
}

class ApprovalCategorySummary {
  final String key;
  final String label;
  final int count;
  final Color color;

  const ApprovalCategorySummary({
    required this.key,
    required this.label,
    required this.count,
    required this.color,
  });
}
