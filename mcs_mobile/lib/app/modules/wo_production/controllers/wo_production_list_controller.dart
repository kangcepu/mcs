import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/services/push_notification_service.dart';
import '../../../data/repositories/wo_production_repository.dart';
import '../../../data/models/wo_model.dart';
import '../../../data/models/dashboard_stats_model.dart';
import '../../../data/models/wo_constants.dart';

class WoProductionListController extends GetxController
    with GetSingleTickerProviderStateMixin, WidgetsBindingObserver {
  final WoProductionRepository _woProductionRepository = WoProductionRepository();
  static const Duration _realtimeInterval = Duration(seconds: 20);
  static const List<String> _tabTypes = <String>[
    'preventive',
    'corrective',
    'project',
  ];

  late TabController tabController;

  final isLoading = false.obs;
  final isLoadingMore = false.obs;
  final isLoadingDashboard = false.obs;

  final allWoList = <WorkOrder>[].obs;
  final filteredWoList = <WorkOrder>[].obs;

  final dashboardStats = Rx<DashboardStats?>(null);

  final currentPage = 0.obs;
  final limit = 20;
  final hasMore = true.obs;
  final total = 0.obs;

  final selectedStatus = Rx<WoStatus?>(null);
  final selectedTypeWo = Rx<WoType?>(null);
  final selectedPriority = Rx<WoPriority?>(null);
  final selectedCompany = ''.obs;
  final searchQuery = ''.obs;
  final showOldestUnfinishedOnly = false.obs;

  final canCreateWo = false.obs;
  final canViewWo = false.obs;

  final userDivisionId = ''.obs;
  final userDivisionCode = ''.obs;
  final userDivisionName = ''.obs;
  final userPosition = ''.obs;

  final searchController = TextEditingController();
  Timer? _realtimeTimer;
  StreamSubscription<Map<String, dynamic>>? _notificationSubscription;

  final activeTab = 0.obs;
  final tabCounts = <String, int>{}.obs;

  @override
  void onInit() {
    super.onInit();
    WidgetsBinding.instance.addObserver(this);
    _listenNotificationEvents();
    tabController = TabController(length: _tabTypes.length, vsync: this);
    tabController.addListener(() {
      if (tabController.indexIsChanging) return;
      activeTab.value = tabController.index;
      refresh(showLoader: false, showError: false);
    });
    _initialize();
  }

  Future<void> _initialize() async {
    await checkPermissions();
    await loadUserData();
    await Future.wait([
      loadDashboard(),
      loadAllTabs(),
      loadTabCounts(),
    ]);
    _startRealtimeUpdates();
  }

  void _startRealtimeUpdates() {
    _realtimeTimer?.cancel();
    _realtimeTimer = Timer.periodic(_realtimeInterval, (_) async {
      if (!Get.isRegistered<WoProductionListController>()) {
        return;
      }
      if (isLoading.value || isLoadingMore.value) {
        return;
      }
      await refresh(showLoader: false, showError: false);
    });
  }

  void _listenNotificationEvents() {
    _notificationSubscription?.cancel();
    _notificationSubscription =
        PushNotificationService.instance.messageStream.listen((payload) async {
      final type = payload['type']?.toString().trim().toLowerCase() ?? '';
      if (type == 'daily_control_comment') {
        return;
      }
      if (isLoading.value || isLoadingMore.value) {
        return;
      }
      await refresh(showLoader: false, showError: false);
    });
  }

  @override
  void onClose() {
    _notificationSubscription?.cancel();
    _realtimeTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    searchController.dispose();
    tabController.dispose();
    super.onClose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        !isLoading.value &&
        !isLoadingMore.value) {
      refresh(showLoader: false, showError: false);
    }
  }

  Future<void> loadUserData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      userDivisionId.value = prefs.getString('id_division') ?? '';
      userDivisionCode.value = prefs.getString('division_code') ?? '';
      userDivisionName.value = prefs.getString('division_name') ?? '';
      userPosition.value = prefs.getString('id_position') ?? '';
    } catch (e) {
      print('Error loading user data: $e');
    }
  }

  Future<void> checkPermissions() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      final woProductionPerm = prefs.getInt('wo_preventive') ?? 0;
      canViewWo.value = woProductionPerm == 1;

      final createWoPerm = prefs.getInt('scanning_create_wo') ?? 0;
      canCreateWo.value = createWoPerm == 1;

      print(
          'WO Production Permissions - View: ${canViewWo.value}, Create: ${canCreateWo.value}');
    } catch (e) {
      print('Error checking permissions: $e');
    }
  }

  Future<void> loadDashboard({bool showLoader = true}) async {
    if (!canViewWo.value) return;

    try {
      if (showLoader) {
        isLoadingDashboard.value = true;
      }

      final result = await _woProductionRepository.getDashboardStats(
        company:
            selectedCompany.value.isNotEmpty ? selectedCompany.value : null,
      );

      if (result['status'] == true && result['data'] != null) {
        dashboardStats.value = DashboardStats.fromJson(result['data']);
      }
    } catch (e) {
      print('Error loading dashboard: $e');
    } finally {
      if (showLoader) {
        isLoadingDashboard.value = false;
      }
    }
  }

  Future<void> loadAllTabs({
    bool showLoader = true,
    bool showError = true,
  }) async {
    await loadAllWoList(showLoader: showLoader, showError: showError);
    applyFilter();
  }

  Future<void> loadAllWoList({
    bool isRefresh = false,
    bool showLoader = true,
    bool showError = true,
  }) async {
    try {
      if (!canViewWo.value) {
        if (showError) {
          _showWarningSnackbar(
              'Anda tidak memiliki izin untuk melihat Work Order Production');
        }
        return;
      }

      if (isRefresh) {
        currentPage.value = 0;
        hasMore.value = true;
      }

      if (showLoader) {
        isLoading.value = true;
      }

      final result = await _woProductionRepository.getWoList(
        limit: limit,
        offset: currentPage.value * limit,
        status: selectedStatus.value?.code,
        typeWo: _currentTypeWo(),
      );

      final List<dynamic> items = result['items'] ?? [];
      total.value = result['total'] ?? 0;

      final List<WorkOrder> newWoList =
          items.map((json) => WorkOrder.fromJson(json)).toList();

      if (isRefresh) {
        allWoList.value = newWoList;
      } else {
        allWoList.addAll(newWoList);
      }

      hasMore.value = allWoList.length < total.value;
    } catch (e) {
      print('Load All WO Error: $e');
      if (showError) {
        _showErrorSnackbar(e.toString().replaceAll('Exception: ', ''));
      }
    } finally {
      if (showLoader) {
        isLoading.value = false;
      }
    }
  }

  Future<void> loadMore() async {
    if (isLoadingMore.value || !hasMore.value) return;

    try {
      isLoadingMore.value = true;
      currentPage.value++;

      await loadAllWoList();
      applyFilter();
    } finally {
      isLoadingMore.value = false;
    }
  }

  @override
  @override
  Future<void> refresh({
    bool showLoader = true,
    bool showError = true,
  }) async {
    await Future.wait([
      loadDashboard(showLoader: showLoader),
      loadAllTabs(showLoader: showLoader, showError: showError),
      loadTabCounts(),
    ]);
  }

  Future<void> loadTabCounts() async {
    if (!canViewWo.value) return;

    final types = ['preventive', 'corrective', 'project'];
    final nextCounts = <String, int>{};

    await Future.wait(
      types.map((type) async {
        try {
          final result = await _woProductionRepository.getWoList(
            limit: 1,
            offset: 0,
            typeWo: type,
          );
          nextCounts[type] = int.tryParse('${result['total'] ?? 0}') ?? 0;
        } catch (_) {
          nextCounts[type] = 0;
        }
      }),
    );

    tabCounts.assignAll(nextCounts);
  }

  int getTabCount(String type) => tabCounts[type] ?? 0;

  void filterByStatus(WoStatus? status) {
    selectedStatus.value = status;
    refresh();
  }

  void filterByPriority(WoPriority? priority) {
    selectedPriority.value = priority;
    applyFilter();
  }

  void filterByCompany(String company) {
    selectedCompany.value = company;
    refresh();
  }

  void clearAllFilters() {
    selectedStatus.value = null;
    selectedPriority.value = null;
    selectedCompany.value = '';
    searchQuery.value = '';
    showOldestUnfinishedOnly.value = false;
    searchController.clear();
    applyFilter();
  }

  void search(String query) {
    searchQuery.value = query;
    applyFilter();
  }

  void toggleOldestUnfinishedFilter() {
    showOldestUnfinishedOnly.value = !showOldestUnfinishedOnly.value;
    applyFilter();
  }

  List<WorkOrder> _buildBaseFilteredList() {
    List<WorkOrder> sourceList = allWoList;

    List<WorkOrder> filtered = sourceList;

    if (activeTab.value == 0) {
      filtered = filtered
          .where((wo) => _normalizeTypeWo(wo.typeWo) == 'preventive')
          .toList();
    } else if (activeTab.value == 1) {
      filtered = filtered
          .where((wo) => _normalizeTypeWo(wo.typeWo) == 'corrective')
          .toList();
    } else if (activeTab.value == 2) {
      filtered = filtered
          .where((wo) => _normalizeTypeWo(wo.typeWo) == 'project')
          .toList();
    }

    filtered = filtered.where((wo) => !_shouldHideFromList(wo.status)).toList();

    if (selectedPriority.value != null) {
      filtered = filtered
          .where((wo) => wo.priority == selectedPriority.value!.code)
          .toList();
    }

    if (selectedStatus.value != null) {
      filtered = filtered
          .where((wo) => wo.status == selectedStatus.value!.code)
          .toList();
    }

    if (searchQuery.value.isNotEmpty) {
      final query = searchQuery.value.toLowerCase();
      filtered = filtered.where((wo) {
        return wo.woNumber.toLowerCase().contains(query) ||
            wo.jobTitle.toLowerCase().contains(query) ||
            (wo.assetName?.toLowerCase().contains(query) ?? false) ||
            (wo.company?.toLowerCase().contains(query) ?? false);
      }).toList();
    }

    return filtered;
  }

  void applyFilter() {
    List<WorkOrder> filtered = _buildBaseFilteredList();

    if (showOldestUnfinishedOnly.value) {
      filtered = filtered.where((wo) => _isUnfinishedStatus(wo.status)).toList()
        ..sort((a, b) => _resolveWoDate(a).compareTo(_resolveWoDate(b)));
    }

    filteredWoList.value = filtered;
  }

  WorkOrder? get oldestUnfinishedWo {
    final filtered = _buildBaseFilteredList()
        .where((wo) => _isUnfinishedStatus(wo.status))
        .toList()
      ..sort((a, b) => _resolveWoDate(a).compareTo(_resolveWoDate(b)));
    if (filtered.isEmpty) {
      return null;
    }
    return filtered.first;
  }

  bool get hasOldestUnfinishedWo => oldestUnfinishedWo != null;

  String get oldestUnfinishedWoNumberLabel =>
      oldestUnfinishedWo?.woNumber.trim().isNotEmpty == true
          ? oldestUnfinishedWo!.woNumber.trim()
          : '-';

  String get oldestUnfinishedDateLabel {
    final wo = oldestUnfinishedWo;
    if (wo == null) {
      return '-';
    }
    return _formatDateLabel(_resolveWoDate(wo));
  }

  String get oldestUnfinishedSummaryLabel {
    final wo = oldestUnfinishedWo;
    if (wo == null) {
      return 'Belum ada WO belum selesai';
    }
    return '$oldestUnfinishedDateLabel | ${wo.woNumber}';
  }

  void goToDetail(WorkOrder wo) async {
    final result = await Get.toNamed('/wo_production/detail', arguments: wo.woNumber);

    if (result == true) {
      refresh();
    }
  }

  void goToCreate() {
    if (!canCreateWo.value) {
      _showWarningSnackbar('Anda tidak memiliki izin untuk membuat Work Order');
      return;
    }

    Get.toNamed('/wo_production/create')?.then((result) {
      if (result == true) {
        refresh();
      }
    });
  }

  Color getStatusColor(String status) {
    final woStatus = WoStatus.fromCode(status);
    if (woStatus == null) return Colors.grey;

    if (woStatus.isOpen) return Colors.blue;
    if (woStatus.isInProgress) return Colors.orange;
    if (woStatus.isClosed) return Colors.green;
    if (woStatus.isRejected) return Colors.red;

    return Colors.grey;
  }

  String getStatusLabel(String status) {
    final woStatus = WoStatus.fromCode(status);
    return woStatus?.label ?? status;
  }

  IconData getStatusIcon(String status) {
    final woStatus = WoStatus.fromCode(status);
    if (woStatus == null) return Icons.help_outline;

    if (woStatus.isOpen) return Icons.pending_outlined;
    if (woStatus.isInProgress) return Icons.engineering_outlined;
    if (woStatus.isClosed) return Icons.check_circle_outline;
    if (woStatus.isRejected) return Icons.cancel_outlined;

    return Icons.help_outline;
  }

  String getTypeLabel(String type) {
    switch (_normalizeTypeWo(type)) {
      case 'preventive':
        return 'PREVENTIVE';
      case 'corrective':
        return 'CORRECTIVE';
      case 'project':
        return 'PROJECT';
      default:
        return type.toUpperCase();
    }
  }

  String _normalizeTypeWo(String? type) {
    final normalized = (type ?? '').toUpperCase().trim();
    if ([
      'PREVENTIVE',
      'PREVENTIVE MAINTENANCE',
      'PREV MAINTENANCE',
      'PM',
    ].contains(normalized)) {
      return 'preventive';
    }
    if ([
      'CORRECTIVE',
      'CORRECTIVE MAINTENANCE',
      'CM',
    ].contains(normalized)) {
      return 'corrective';
    }
    if (normalized == 'PROJECT') {
      return 'project';
    }
    return normalized.toLowerCase();
  }

  String? _currentTypeWo() {
    if (activeTab.value < 0 || activeTab.value >= _tabTypes.length) {
      return null;
    }
    return _tabTypes[activeTab.value];
  }

  String getPriorityLabel(String priority) {
    final woPriority = WoPriority.fromCode(priority);
    return woPriority?.code ?? priority;
  }

  bool _isUnfinishedStatus(String status) {
    final woStatus = WoStatus.fromCode(status);
    if (woStatus == null) {
      final normalized = status.toUpperCase().trim();
      return normalized != 'CLOSED' &&
          normalized != 'COMPLETE' &&
          normalized != 'DONE' &&
          normalized != 'COMPLETE_EXECUTOR' &&
          normalized != 'COMPLETE EXECUTOR' &&
          normalized != 'NEED_CLOSED' &&
          normalized != 'VOID' &&
          normalized != 'DECLINE';
    }
    return !woStatus.isClosed && !woStatus.isRejected;
  }

  bool _shouldHideFromList(String status) {
    final normalized = status.toUpperCase().trim();
    return normalized == 'DONE' ||
        normalized == 'COMPLETE_EXECUTOR' ||
        normalized == 'COMPLETE EXECUTOR';
  }

  DateTime _resolveWoDate(WorkOrder wo) {
    return _parseDateValue(wo.date) ??
        _parseDateValue(wo.createdAt) ??
        _parseDateValue(wo.updatedAt) ??
        DateTime(2100);
  }

  DateTime? _parseDateValue(String? raw) {
    final value = (raw ?? '').trim();
    if (value.isEmpty) {
      return null;
    }

    return DateTime.tryParse(value);
  }

  String _formatDateLabel(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    final year = value.year.toString().padLeft(4, '0');
    return '$day/$month/$year';
  }

  Color getPriorityColor(String priority) {
    final woPriority = WoPriority.fromCode(priority);
    if (woPriority == null) return Colors.grey;

    switch (woPriority) {
      case WoPriority.normal:
        return Colors.green;
      case WoPriority.emergency:
        return Colors.red;
    }
  }

  List<WorkOrder> getWoByStatus(WoStatus status) {
    return allWoList.where((wo) => wo.status == status.code).toList();
  }

  int getCountByStatus(WoStatus status) {
    return getWoByStatus(status).length;
  }

  void _showErrorSnackbar(String message) {
    if (Get.isSnackbarOpen) return;

    Future.delayed(Duration.zero, () {
      Get.snackbar(
        'Error',
        message,
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
        duration: const Duration(seconds: 3),
        margin: const EdgeInsets.all(16),
      );
    });
  }

  void _showWarningSnackbar(String message) {
    if (Get.isSnackbarOpen) return;

    Future.delayed(Duration.zero, () {
      Get.snackbar(
        'Akses Ditolak',
        message,
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.orange,
        colorText: Colors.white,
        duration: const Duration(seconds: 3),
        margin: const EdgeInsets.all(16),
      );
    });
  }
}

