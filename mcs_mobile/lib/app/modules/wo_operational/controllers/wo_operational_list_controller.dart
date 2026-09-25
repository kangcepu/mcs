import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import '../../../core/services/push_notification_service.dart';
import '../../../core/services/realtime_service.dart';
import '../../../data/repositories/wo_operational_repository.dart';
import '../../../data/models/dashboard_stats_model.dart' as dashboard_model;
import '../../../data/models/work_order_model.dart';
import '../../../data/models/wo_constants.dart';
import '../utils/wo_operational_status_mapper.dart';

class WoOperationalListController extends GetxController
    with GetSingleTickerProviderStateMixin, WidgetsBindingObserver, RealtimeRefresh {
  final WoOperationalRepository _woRepository = WoOperationalRepository();
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

  final dashboardStats = Rx<dashboard_model.DashboardStats?>(null);

  final currentPage = 1.obs;
  final totalPages = 0.obs;
  final limit = 20;
  final hasMore = true.obs;
  final total = 0.obs;

  final selectedStatus = Rx<WoStatus?>(null);
  final selectedPriority = Rx<WoPriority?>(null);
  final selectedCompany = ''.obs;
  final searchQuery = ''.obs;
  final showOldestUnfinishedOnly = false.obs;
  final oldestUnfinishedItem = Rx<WorkOrder?>(null);

  final canCreateWo = false.obs;
  final canViewWo = false.obs;

  final userDivisionId = ''.obs;
  final userDivisionCode = ''.obs;
  final userDivisionName = ''.obs;
  final userPosition = ''.obs;

  final searchController = TextEditingController();

  final activeTab = 0.obs;
  final tabCounts = <String, int>{}.obs;
  Timer? _searchDebounce;
  Timer? _realtimeTimer;
  StreamSubscription<Map<String, dynamic>>? _notificationSubscription;

  @override
  void onInit() {
    super.onInit();
    WidgetsBinding.instance.addObserver(this);
    _listenNotificationEvents();
    tabController = TabController(length: _tabTypes.length, vsync: this);
    tabController.addListener(() {
      if (tabController.indexIsChanging) return;
      if (activeTab.value == tabController.index) return;
      activeTab.value = tabController.index;
      refreshList();
    });
    _initialize();
    bindRealtime(const ['wo', 'wo:maintenance'], _silentRefresh);
  }

  Future<void> _silentRefresh() async {
    if (!canViewWo.value) return;
    for (var i = 0; i < 25 && (isLoading.value || isLoadingMore.value); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    if (isLoading.value || isLoadingMore.value) return;

    final typeWo = _currentTypeWo();
    final status = selectedStatus.value?.code;
    final search = searchQuery.value;
    final company = selectedCompany.value;
    final oldestFirst = showOldestUnfinishedOnly.value;
    final pages = currentPage.value < 1 ? 1 : currentPage.value;
    final fetchLimit = (pages * limit).clamp(limit, 200).toInt();

    try {
      final result = await _woRepository.getWoList(
        page: 1,
        limit: fetchLimit,
        status: status,
        search: search.isNotEmpty ? search : null,
        company: company.isNotEmpty ? company : null,
        typeWo: typeWo,
        sortOrder: oldestFirst ? 'asc' : 'desc',
      );

      if (isLoading.value ||
          isLoadingMore.value ||
          typeWo != _currentTypeWo() ||
          status != selectedStatus.value?.code ||
          search != searchQuery.value ||
          company != selectedCompany.value ||
          oldestFirst != showOldestUnfinishedOnly.value) {
        return;
      }

      total.value = result.total;
      totalPages.value = (result.total / limit).ceil();
      currentPage.value = fetchLimit ~/ limit;
      hasMore.value = result.items.length < result.total &&
          result.items.length >= fetchLimit;
      allWoList.value = result.items;
      applyFilter();
    } catch (e) {
      debugPrint('Silent WO refresh error: $e');
    }

    await refreshRealtimeSummary();
  }

  Future<void> _initialize() async {
    await checkPermissions();
    await loadUserData();
    await Future.wait([
      loadDashboard(),
      loadAllWoList(isRefresh: true),
      loadTabCounts(),
      loadOldestUnfinishedWo(),
    ]);
    applyFilter();
    _startRealtimeUpdates();
  }

  void _startRealtimeUpdates() {
    _realtimeTimer?.cancel();
    _realtimeTimer = Timer.periodic(_realtimeInterval, (_) async {
      if (!Get.isRegistered<WoOperationalListController>()) {
        return;
      }
      if (isLoading.value || isLoadingMore.value) {
        return;
      }
      await refreshRealtimeSummary();
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
      await refreshRealtimeSummary();
    });
  }

  @override
  void onClose() {
    _searchDebounce?.cancel();
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
      refreshList(showLoader: false, showError: false);
    }
  }

  String _currentTypeWo() {
    final index = activeTab.value;
    if (index < 0 || index >= _tabTypes.length) return _tabTypes.first;
    return _tabTypes[index];
  }

  Future<void> loadUserData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      userDivisionId.value = prefs.getString('id_division') ??
          prefs.getString('division_id') ??
          '';
      userDivisionCode.value = prefs.getString('division_code') ?? '';
      userDivisionName.value = prefs.getString('division_name') ?? '';
      userPosition.value = prefs.getString('id_position') ?? '';
    } catch (e) {
      debugPrint('Error loading user data: $e');
    }
  }

  Future<void> checkPermissions() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      final woPerm = prefs.getInt('wo_operational') ?? 0;
      final crossAccessPerm = prefs.getInt('wo_cross_access') ?? 0;
      canViewWo.value = woPerm == 1 || crossAccessPerm == 1;

      final createWoPerm = prefs.getInt('scanning_create_wo') ?? 0;
      canCreateWo.value = woPerm == 1 && createWoPerm == 1;
    } catch (e) {
      debugPrint('Error checking permissions: $e');
    }
  }

  Future<void> loadDashboard({bool showLoader = true}) async {
    if (!canViewWo.value) return;

    try {
      if (showLoader) {
        isLoadingDashboard.value = true;
      }

      final result = await _woRepository.getDashboardStats(
        company:
            selectedCompany.value.isNotEmpty ? selectedCompany.value : null,
      );

      if (result['status'] == true && result['data'] != null) {
        dashboardStats.value =
            dashboard_model.DashboardStats.fromJson(result['data']);
      }
    } catch (e) {
      debugPrint('Error loading dashboard: $e');
    } finally {
      if (showLoader) {
        isLoadingDashboard.value = false;
      }
    }
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
              'Anda tidak memiliki izin untuk melihat Work Order MTC');
        }
        return;
      }

      if (isRefresh) {
        currentPage.value = 1;
        hasMore.value = true;
      }

      if (showLoader) {
        isLoading.value = true;
      }

      final result = await _woRepository.getWoList(
        page: currentPage.value,
        limit: limit,
        status: selectedStatus.value?.code,
        search: searchQuery.value.isNotEmpty ? searchQuery.value : null,
        company:
            selectedCompany.value.isNotEmpty ? selectedCompany.value : null,
        typeWo: _currentTypeWo(),
        sortOrder: showOldestUnfinishedOnly.value ? 'asc' : 'desc',
      );

      final newWoList = result.items;
      total.value = result.total;
      totalPages.value = result.totalPages;

      if (isRefresh) {
        allWoList.value = newWoList;
      } else {
        allWoList.addAll(newWoList);
      }

      hasMore.value = currentPage.value < totalPages.value;
    } catch (e) {
      debugPrint('Load WO Operational Error: $e');
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

  Future<void> loadTabCounts() async {
    if (!canViewWo.value) return;

    final types = ['preventive', 'corrective', 'project'];
    final nextCounts = <String, int>{};

    await Future.wait(
      types.map((type) async {
        try {
          final result = await _woRepository.getWoList(
            page: 1,
            limit: 1,
            typeWo: type,
          );
          nextCounts[type] = result.total;
        } catch (_) {
          nextCounts[type] = 0;
        }
      }),
    );

    tabCounts.assignAll(nextCounts);
  }

  int getTabCount(String type) => tabCounts[type] ?? 0;

  // Do not replace paginated list items from a background timer: doing so
  // resets the reader to page one. Explicit refreshes still reload the list.
  Future<void> refreshRealtimeSummary() async {
    await Future.wait([
      loadDashboard(showLoader: false),
      loadTabCounts(),
      loadOldestUnfinishedWo(),
    ]);
  }

  Future<void> refreshList({
    bool showLoader = true,
    bool showError = true,
  }) async {
    await Future.wait([
      loadDashboard(showLoader: showLoader),
      loadAllWoList(
        isRefresh: true,
        showLoader: showLoader,
        showError: showError,
      ),
      loadOldestUnfinishedWo(),
    ]);
    applyFilter();
  }

  void filterByStatus(WoStatus? status) {
    selectedStatus.value = status;
    refreshList();
  }

  void filterByPriority(WoPriority? priority) {
    selectedPriority.value = priority;
    applyFilter();
  }

  void filterByCompany(String company) {
    selectedCompany.value = company;
    refreshList();
  }

  void clearAllFilters() {
    selectedStatus.value = null;
    selectedPriority.value = null;
    selectedCompany.value = '';
    searchQuery.value = '';
    showOldestUnfinishedOnly.value = false;
    searchController.clear();
    refreshList();
  }

  void search(String query) {
    searchQuery.value = query.trim();
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 450), () {
      refreshList();
    });
  }

  Future<void> toggleOldestUnfinishedFilter() async {
    showOldestUnfinishedOnly.value = !showOldestUnfinishedOnly.value;
    await refreshList();
  }

  Future<void> loadOldestUnfinishedWo() async {
    if (!canViewWo.value) return;

    try {
      final result = await _woRepository.getWoList(
        page: 1,
        limit: 1,
        status: selectedStatus.value?.code,
        company:
            selectedCompany.value.isNotEmpty ? selectedCompany.value : null,
        typeWo: _currentTypeWo(),
        sortOrder: 'asc',
      );
      oldestUnfinishedItem.value =
          result.items.isEmpty ? null : result.items.first;
    } catch (_) {
      oldestUnfinishedItem.value = null;
    }
  }

  List<WorkOrder> _buildBaseFilteredList() {
    List<WorkOrder> filtered =
        allWoList.where((wo) => _isUnfinishedStatus(wo.status)).toList();

    // Server already scopes list by type_wo and search query.

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
    return oldestUnfinishedItem.value;
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
    final result =
        await Get.toNamed('/wo_operational/detail', arguments: wo.woNumber);

    if (result == true) {
      refreshList();
    }
  }

  void goToCreate() {
    if (!canCreateWo.value) {
      _showWarningSnackbar('Anda tidak memiliki izin untuk membuat Work Order');
      return;
    }

    Get.toNamed('/wo_operational/create')?.then((result) {
      if (result == true) {
        refreshList();
      }
    });
  }

  Color getStatusColor(String status) {
    return WoOperationalStatusMapper.badgeTextColor(status);
  }

  String getStatusLabel(String status) {
    return WoOperationalStatusMapper.mapStatusDisplay(status);
  }

  IconData getStatusIcon(String status) {
    final normalized = status.toUpperCase();
    if (normalized.contains('WAIT')) return Icons.pending_outlined;
    if (normalized.contains('PROGRESS')) return Icons.engineering_outlined;
    if (normalized.contains('CLOSE') || normalized.contains('DONE')) {
      return Icons.check_circle_outline;
    }
    if (normalized.contains('REJECT') || normalized.contains('DECLINE')) {
      return Icons.cancel_outlined;
    }
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

  void _showErrorSnackbar(String message) {
    Get.snackbar(
      'Error',
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.red,
      colorText: Colors.white,
      duration: const Duration(seconds: 3),
    );
  }

  void _showWarningSnackbar(String message) {
    Get.snackbar(
      'Warning',
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.orange,
      colorText: Colors.white,
      duration: const Duration(seconds: 3),
    );
  }
}
