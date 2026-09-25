import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'dart:async';
import '../../../core/services/push_notification_service.dart';
import '../../../core/services/realtime_service.dart';
import '../../../data/models/user_model.dart';
import '../../../data/repositories/dashboard_repository.dart';
import '../../../data/repositories/daily_control_repository.dart';
import '../../../data/repositories/approval_repository.dart';
import '../../../data/repositories/wo_repository.dart';
import '../../../data/repositories/wo_ga_repository.dart';
import '../../../data/repositories/wo_mtc_repository.dart';
import '../../../data/repositories/wo_operational_repository.dart';
import '../../../data/repositories/wo_production_repository.dart';
import '../../../data/repositories/auth_repository.dart';
import '../../../core/constants/api_constants.dart';
import '../../../data/providers/update_provider.dart';
import '../../../core/widgets/update_dialog.dart';
import 'notification_controller.dart';

class MenuItem {
  final String title;
  final String subtitle;
  final IconData? icon;
  final String? imagePath;
  final String? imageUrl;
  final Color color;
  final String route;
  final bool enabled;
  final String permissionKey;

  MenuItem({
    required this.title,
    required this.subtitle,
    this.icon,
    this.imagePath,
    this.imageUrl,
    required this.color,
    required this.route,
    this.enabled = true,
    this.permissionKey = '',
  });
}

class HomeController extends GetxController
    with WidgetsBindingObserver, RealtimeRefresh {
  final DashboardRepository _dashboardRepository = DashboardRepository();
  final DailyControlRepository _dailyControlRepository =
      DailyControlRepository();
  final ApprovalRepository _approvalRepository = ApprovalRepository();
  final WoRepository _woRepository = WoRepository();
  final WoGaRepository _woGaRepository = WoGaRepository();
  final WoMtcRepository _woMtcRepository = WoMtcRepository();
  final WoOperationalRepository _woOperationalRepository =
      WoOperationalRepository();
  final WoProductionRepository _woProductionRepository =
      WoProductionRepository();
  final AuthRepository _authRepository = AuthRepository();

  late NotificationController notificationController;
  late UpdateProvider updateProvider;

  final Rx<User?> currentUser = Rx<User?>(null);
  final userName = ''.obs;
  final userDivision = ''.obs;
  final userDivisionCode = ''.obs;
  final userAvatar = ''.obs;
  final userAvatarUrl = ''.obs;
  final userInitials = 'MK'.obs;

  final openWoCount = 0.obs;
  final progressWoCount = 0.obs;
  final closeWoCount = 0.obs;
  final preventiveWoCount = 0.obs;
  final correctiveWoCount = 0.obs;
  final projectWoCount = 0.obs;
  final dailyControlUnreadCount = 0.obs;
  final moduleCounts = <String, int>{}.obs;
  final isLoadingStats = false.obs;
  StreamSubscription<Map<String, dynamic>>? _notificationSubscription;
  Timer? _updateCheckDebounce;

  final RxList<MenuItem> menuItems = <MenuItem>[
    MenuItem(
      title: 'WO MTC',
      subtitle: '',
      imagePath: 'assets/mtc.png',
      color: const Color(0xFF00b894),
      route: '/wo_operational/list',
      enabled: true,
      permissionKey: 'wo_operational',
    ),
    MenuItem(
      title: 'WO MESO',
      subtitle: '',
      imagePath: 'assets/meso.png',
      color: const Color(0xFF8e44ad),
      route: '/wo_mtc/list',
      enabled: true,
      permissionKey: 'wo_mtc',
    ),
    MenuItem(
      title: 'WO IS',
      subtitle: '',
      imagePath: 'assets/it.png',
      color: const Color(0xFF1976D2),
      route: '/wo/list',
      enabled: true,
      permissionKey: 'wo_it',
    ),
    MenuItem(
      title: 'WO GA',
      subtitle: '',
      icon: Icons.apartment_rounded,
      color: const Color(0xFF16A085),
      route: '/wo_ga/list',
      enabled: true,
      permissionKey: 'wo_ga',
    ),
    MenuItem(
      title: 'WO Produksi',
      subtitle: '',
      icon: Icons.precision_manufacturing_rounded,
      color: const Color(0xFF8B4513),
      route: '/wo_production/list',
      enabled: true,
      permissionKey: 'wo_preventive',
    ),
    MenuItem(
      title: 'WO VOID',
      subtitle: '',
      icon: Icons.block_outlined,
      color: const Color(0xFFDC2626),
      route: '/wo_void',
      enabled: true,
      permissionKey: 'wo_void',
    ),
    MenuItem(
      title: 'Approval',
      subtitle: '',
      icon: Icons.approval_rounded,
      color: const Color(0xFF2563EB),
      route: '/approval',
      enabled: true,
      permissionKey: 'approval_access',
    ),
    MenuItem(
      title: 'Daily Control',
      subtitle: '',
      icon: Icons.event_note_rounded,
      color: const Color(0xFF2a5298),
      route: '/daily_control',
      enabled: true,
      permissionKey: 'daily_control',
    ),
    MenuItem(
      title: 'Stock Opname',
      subtitle: '',
      icon: Icons.inventory,
      color: const Color(0xFF4facfe),
      route: '/stock_opname/list',
      enabled: true,
      permissionKey: '',
    ),
    MenuItem(
      title: 'Asset',
      subtitle: '',
      icon: Icons.inventory_2_outlined,
      color: const Color(0xFF4F46E5),
      route: '/reports/asset',
      enabled: true,
      permissionKey: 'asset_access',
    ),
    MenuItem(
      title: 'Scan QR Asset',
      subtitle: '',
      icon: Icons.qr_code_scanner_rounded,
      color: const Color(0xFF0F766E),
      route: '/scanning',
      enabled: true,
      permissionKey: 'asset_access',
    ),
    MenuItem(
      title: 'Asset Mutation',
      subtitle: '',
      icon: Icons.swap_horiz_rounded,
      color: const Color(0xFF06B6D4),
      route: '/reports/asset_mutation',
      enabled: true,
      permissionKey: 'asset_mutation_access',
    ),
    MenuItem(
      title: 'Report',
      subtitle: '',
      icon: Icons.bar_chart,
      color: const Color(0xFFfa709a),
      route: '/reports',
      enabled: true,
      permissionKey: 'report_access',
    ),
  ].obs;

  List<MenuItem> get visibleMenuItems {
    return menuItems.where((item) => item.enabled).toList();
  }

  @override
  void onInit() {
    super.onInit();
    WidgetsBinding.instance.addObserver(this);
    notificationController = Get.put(NotificationController());
    updateProvider = Get.find<UpdateProvider>();
    _listenNotificationEvents();
    loadUserData();
    loadWoStats();
    loadModuleCounts();
    refreshDailyControlUnreadCount();
    if (Get.isRegistered<RealtimeService>()) {
      RealtimeService.to.ensureStarted();
    }
    bindRealtime(
      const ['wo', 'approval', 'daily-control', 'asset-mutation', 'dashboard'],
      _refreshLiveCounts,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduleUpdateCheck(const Duration(milliseconds: 600));
    });
  }

  void _listenNotificationEvents() {
    _notificationSubscription?.cancel();
    _notificationSubscription =
        PushNotificationService.instance.messageStream.listen((payload) async {
      final type = payload['type']?.toString().trim().toLowerCase() ?? '';
      if (type == 'daily_control_comment') {
        await refreshDailyControlUnreadCount();
        return;
      }

      await notificationController.loadNotifications();
      await loadWoStats();
      await loadModuleCounts();
    });
  }

  @override
  void onClose() {
    WidgetsBinding.instance.removeObserver(this);
    _notificationSubscription?.cancel();
    _updateCheckDebounce?.cancel();
    Get.delete<NotificationController>();
    super.onClose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      loadUserData(refreshProfile: true);
      refreshDailyControlUnreadCount();
      loadModuleCounts();
      _scheduleUpdateCheck();
    }
  }

  void _scheduleUpdateCheck(
      [Duration delay = const Duration(milliseconds: 250)]) {
    _updateCheckDebounce?.cancel();
    _updateCheckDebounce = Timer(delay, () {
      checkForUpdate();
    });
  }

  Future<void> checkForUpdate() async {
    try {
      await updateProvider.checkForUpdate();

      if (updateProvider.updateAvailable.value &&
          !(Get.isDialogOpen ?? false)) {
        Get.dialog(
          UpdateDialog(
            forceUpdate:
                updateProvider.latestVersion.value?.forceUpdate ?? false,
          ),
          barrierDismissible:
              !(updateProvider.latestVersion.value?.forceUpdate ?? false),
        );
      }
    } catch (e) {
      debugPrint('Error checking for update: $e');
    }
  }

  void manualCheckUpdate() {
    checkForUpdate();
  }

  Future<void> loadUserData({bool refreshProfile = true}) async {
    try {
      final prefs = await SharedPreferences.getInstance();

      if (refreshProfile && (prefs.getString('token') ?? '').isNotEmpty) {
        try {
          await _authRepository.getProfile();
        } catch (e) {
          debugPrint('Permission profile refresh failed: $e');
        }
      }

      final userJson = prefs.getString('user_data');

      if (userJson != null && userJson.isNotEmpty) {
        final userMap = json.decode(userJson);
        currentUser.value = User.fromJson(userMap);

        userName.value = _normalizeDisplayValue(
          currentUser.value?.fullname,
          fallback: 'Guest User',
        );
        userDivision.value = _normalizeDisplayValue(
          currentUser.value?.division?.divisionName,
          fallback: 'No Division',
        );
        userDivisionCode.value = _normalizeDisplayValue(
          currentUser.value?.division?.divisionCode,
          fallback: '',
        );
        userAvatar.value = currentUser.value?.avatar ?? '';

        userAvatarUrl.value = ApiConstants.getAvatarUrl(userAvatar.value);

        _generateInitials();
        _updateMenuPermissions();
      } else {
        final fullname = prefs.getString('fullname');
        final divisionName = prefs.getString('division_name');
        final divisionCode = prefs.getString('division_code');
        final avatarFilename = prefs.getString('avatar');

        if (fullname != null && fullname.isNotEmpty) {
          userName.value = _normalizeDisplayValue(
            fullname,
            fallback: 'Guest User',
          );
          userDivision.value = _normalizeDisplayValue(
            divisionName,
            fallback: 'No Division',
          );
          userDivisionCode.value = _normalizeDisplayValue(
            divisionCode,
            fallback: '',
          );
          userAvatar.value = avatarFilename ?? '';
          userAvatarUrl.value = ApiConstants.getAvatarUrl(avatarFilename);

          _generateInitials();
          _loadPermissionsFromPrefs(prefs);
        } else {
          userName.value = 'Guest User';
          userDivision.value = 'No Division';
          userInitials.value = 'GU';
        }
      }
    } catch (e) {
      debugPrint('Error loading user data: $e');
      userName.value = 'Error Loading';
      userDivision.value = 'Please login again';
    }
    loadWoStats();
    loadModuleCounts();
    refreshDailyControlUnreadCount();
  }

  bool shouldShowModuleCount(String route) {
    return route == '/wo_operational/list' ||
        route == '/wo_mtc/list' ||
        route == '/wo/list' ||
        route == '/wo_ga/list' ||
        route == '/wo_production/list' ||
        route == '/approval';
  }

  int getModuleCount(String route) {
    return moduleCounts[route] ?? 0;
  }

  bool _isManagementUser(
    SharedPreferences prefs, {
    Map<String, dynamic>? userData,
  }) {
    final rawUserData = userData ?? _readRawUserData(prefs);
    final userManagement = _parseIntValue(
      rawUserData['user_management'] ??
          rawUserData['is_management'] ??
          rawUserData['management'],
    );
    if (userManagement == 1) {
      return true;
    }

    final position = (rawUserData['id_position'] ??
            rawUserData['position'] ??
            prefs.getString('id_position') ??
            '')
        .toString()
        .trim()
        .toUpperCase();
    return position == 'SUPER';
  }

  Map<String, dynamic> _readRawUserData(SharedPreferences prefs) {
    final raw = prefs.getString('user_data');
    if (raw == null || raw.trim().isEmpty) {
      return <String, dynamic>{};
    }

    try {
      final decoded = json.decode(raw);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
    } catch (_) {}

    return <String, dynamic>{};
  }

  String _resolveWoScope(SharedPreferences prefs) {
    final divisionCode = userDivisionCode.value.trim().toUpperCase();
    final canWoOperational = (prefs.getInt('wo_operational') ?? 0) == 1;
    final canWoMtc = (prefs.getInt('wo_mtc') ?? 0) == 1;
    final canWoMtcAll = (prefs.getInt('wo_mtc_all') ?? 0) == 1;
    final canWoIt = (prefs.getInt('wo_it') ?? 0) == 1;
    final canWoGa = (prefs.getInt('wo_ga') ?? 0) == 1;
    final canWoProduction = (prefs.getInt('wo_preventive') ?? 0) == 1;

    if (divisionCode == 'ITS' || divisionCode.contains('ITS')) {
      return 'it';
    }

    if (divisionCode.contains('MKL') ||
        divisionCode.contains('ELC') ||
        divisionCode.contains('SPL') ||
        divisionCode.contains('OTO') ||
        divisionCode.contains('MESO')) {
      return 'mtc';
    }

    if (divisionCode.contains('GA')) {
      return 'ga';
    }

    if (divisionCode.contains('MTC') || divisionCode.contains('MAINT')) {
      return 'operational';
    }

    if (canWoIt) return 'it';
    if (canWoMtc || canWoMtcAll) return 'mtc';
    if (canWoGa) return 'ga';
    if (canWoOperational) return 'operational';
    if (canWoProduction) return 'production';
    return 'unknown';
  }

  Future<int> _loadTypeCountByScope(String scope, String type) async {
    switch (scope) {
      case 'mtc':
        final result = await _woMtcRepository.getWoList(
          limit: 1,
          offset: 0,
          typeWo: type,
        );
        return _parseIntValue(result['total']);
      case 'it':
        final result = await _woRepository.getWoList(
          limit: 1,
          offset: 0,
          typeWo: type,
        );
        return _parseIntValue(result['total']);
      case 'ga':
        final result = await _woGaRepository.getWoList(
          limit: 1,
          offset: 0,
          typeWo: type,
        );
        return _parseIntValue(result['total']);
      case 'production':
        final result = await _woProductionRepository.getWoList(
          limit: 1,
          offset: 0,
          typeWo: type,
        );
        return _parseIntValue(result['total']);
      case 'operational':
        final result = await _woOperationalRepository.getWoList(
          page: 1,
          limit: 1,
          typeWo: type,
        );
        return result.total;
      default:
        return 0;
    }
  }

  Future<int> _loadManagementTypeCount(
    SharedPreferences prefs,
    String type,
  ) async {
    final futures = <Future<int>>[];
    final hasCrossWoAccess = (prefs.getInt('wo_cross_access') ?? 0) == 1;

    if ((prefs.getInt('wo_operational') ?? 0) == 1 || hasCrossWoAccess) {
      futures.add(_loadTypeCountByScope('operational', type));
    }
    if ((prefs.getInt('wo_mtc') ?? 0) == 1 ||
        (prefs.getInt('wo_mtc_all') ?? 0) == 1 ||
        hasCrossWoAccess) {
      futures.add(_loadTypeCountByScope('mtc', type));
    }
    if ((prefs.getInt('wo_it') ?? 0) == 1) {
      futures.add(_loadTypeCountByScope('it', type));
    }
    if ((prefs.getInt('wo_ga') ?? 0) == 1) {
      futures.add(_loadTypeCountByScope('ga', type));
    }
    if ((prefs.getInt('wo_preventive') ?? 0) == 1) {
      futures.add(_loadTypeCountByScope('production', type));
    }

    if (futures.isEmpty) {
      return 0;
    }

    final results = await Future.wait(futures);
    return results.fold<int>(0, (sum, item) => sum + item);
  }

  Future<int> _loadCrossMtcMesoTypeCount(String type) async {
    final results = await Future.wait<int>([
      _loadTypeCountByScope('operational', type),
      _loadTypeCountByScope('mtc', type),
    ]);

    return results.fold<int>(0, (sum, item) => sum + item);
  }

  Future<int> _loadWoMtcModuleCount() async {
    final types = ['preventive', 'corrective', 'project'];
    var total = 0;

    await Future.wait(
      types.map((type) async {
        final result = await _woMtcRepository.getWoList(
          limit: 1,
          offset: 0,
          typeWo: type,
        );
        total += _parseIntValue(result['total']);
      }),
    );

    return total;
  }

  Future<int> _loadWoItModuleCount() async {
    final types = ['preventive', 'corrective', 'project'];
    var total = 0;

    await Future.wait(
      types.map((type) async {
        final result = await _woRepository.getWoList(
          limit: 1,
          offset: 0,
          typeWo: type,
        );
        total += _parseIntValue(result['total']);
      }),
    );

    return total;
  }

  Future<int> _loadWoGaModuleCount() async {
    final types = ['preventive', 'corrective', 'project'];
    var total = 0;

    await Future.wait(
      types.map((type) async {
        final result = await _woGaRepository.getWoList(
          limit: 1,
          offset: 0,
          typeWo: type,
        );
        total += _parseIntValue(result['total']);
      }),
    );

    return total;
  }

  Future<int> _loadWoProductionModuleCount() async {
    final types = ['preventive', 'corrective', 'project'];
    var total = 0;

    await Future.wait(
      types.map((type) async {
        final result = await _woProductionRepository.getWoList(
          limit: 1,
          offset: 0,
          typeWo: type,
        );
        total += _parseIntValue(result['total']);
      }),
    );

    return total;
  }

  Future<int> _loadWoOperationalModuleCount() async {
    final types = ['preventive', 'corrective', 'project'];
    var total = 0;

    await Future.wait(
      types.map((type) async {
        final result = await _woOperationalRepository.getWoList(
          page: 1,
          limit: 1,
          typeWo: type,
        );
        total += result.total;
      }),
    );

    return total;
  }

  Future<void> loadModuleCounts() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      final canWoOperational = (prefs.getInt('wo_operational') ?? 0) == 1;
      final canWoMtc = (prefs.getInt('wo_mtc') ?? 0) == 1;
      final canWoMtcAll = (prefs.getInt('wo_mtc_all') ?? 0) == 1;
      final canCrossWo = (prefs.getInt('wo_cross_access') ?? 0) == 1;
      final canWoIt = (prefs.getInt('wo_it') ?? 0) == 1;
      final canWoGa = (prefs.getInt('wo_ga') ?? 0) == 1;
      final canWoProduction = (prefs.getInt('wo_preventive') ?? 0) == 1;
      final canViewAllApproval = (prefs.getInt('approval_all') ?? 0) == 1;
      final canApproval = canWoOperational ||
          canWoMtc ||
          canWoIt ||
          canWoGa ||
          canWoProduction ||
          canViewAllApproval ||
          (prefs.getInt('approval_asset_mutation') ?? 0) == 1;

      final nextCounts = <String, int>{};

      final futures = <Future<void>>[];

      if (canWoOperational || canCrossWo) {
        futures.add(
          _loadWoOperationalModuleCount()
              .then(
            (result) => nextCounts['/wo_operational/list'] = result,
          )
              .catchError((_) {
            nextCounts['/wo_operational/list'] = 0;
          }),
        );
      }

      if (canWoMtc || canWoMtcAll || canCrossWo) {
        futures.add(
          _loadWoMtcModuleCount()
              .then(
            (result) => nextCounts['/wo_mtc/list'] = result,
          )
              .catchError((_) {
            nextCounts['/wo_mtc/list'] = 0;
          }),
        );
      }

      if (canWoIt) {
        futures.add(
          _loadWoItModuleCount()
              .then(
            (result) => nextCounts['/wo/list'] = result,
          )
              .catchError((_) {
            nextCounts['/wo/list'] = 0;
          }),
        );
      }

      if (canWoGa) {
        futures.add(
          _loadWoGaModuleCount()
              .then(
            (result) => nextCounts['/wo_ga/list'] = result,
          )
              .catchError((_) {
            nextCounts['/wo_ga/list'] = 0;
          }),
        );
      }

      if (canWoProduction) {
        futures.add(
          _loadWoProductionModuleCount()
              .then(
            (result) => nextCounts['/wo_production/list'] = result,
          )
              .catchError((_) {
            nextCounts['/wo_production/list'] = 0;
          }),
        );
      }

      if (canApproval) {
        futures.add(
          _approvalRepository
              .getSummary()
              .then(
                (result) => nextCounts['/approval'] = result.total,
              )
              .catchError((_) {
            nextCounts['/approval'] = 0;
          }),
        );
      }

      await Future.wait(futures);
      moduleCounts.assignAll(nextCounts);
    } catch (e) {
      debugPrint('Error loading module counts: $e');
    }
  }

  Future<void> refreshDailyControlUnreadCount() async {
    try {
      final totalUnread = await _dailyControlRepository.getUnreadCount();

      final safeCount = totalUnread < 0 ? 0 : totalUnread;
      await PushNotificationService.instance.setDailyControlBadgeCount(
        safeCount,
      );
      dailyControlUnreadCount.value = safeCount;
    } catch (e) {
      final fallback =
          await PushNotificationService.instance.getDailyControlBadgeCount();
      dailyControlUnreadCount.value = fallback < 0 ? 0 : fallback;
      debugPrint('Error loading Daily Control unread count: $e');
    }
  }

  void _generateInitials() {
    final normalizedName = userName.value.trim();
    final nameParts = normalizedName
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();

    if (nameParts.length >= 2) {
      userInitials.value = '${nameParts[0][0]}${nameParts[1][0]}'.toUpperCase();
      return;
    }

    if (nameParts.isNotEmpty) {
      final firstPart = nameParts.first;
      userInitials.value = firstPart.length >= 2
          ? firstPart.substring(0, 2).toUpperCase()
          : firstPart[0].toUpperCase();
      return;
    }

    userInitials.value = 'U';
  }

  String _normalizeDisplayValue(String? value, {required String fallback}) {
    final normalized = (value ?? '').trim();
    return normalized.isEmpty ? fallback : normalized;
  }

  Future<void> _loadPermissionsFromPrefs(SharedPreferences prefs) async {
    final woIt = prefs.getInt('wo_it') ?? 0;
    final woGa = prefs.getInt('wo_ga') ?? 0;
    final woMtc = prefs.getInt('wo_mtc') ?? 0;
    final woMtcAll = prefs.getInt('wo_mtc_all') ?? 0;
    final woOperational = prefs.getInt('wo_operational') ?? 0;
    final woCrossAccess = prefs.getInt('wo_cross_access') ?? 0;
    final woPreventive = prefs.getInt('wo_preventive') ?? 0;
    final woVoid = prefs.getInt('wo_void') ?? 0;
    final dailyControl = prefs.getInt('daily_control') ?? 0;
    final privilageAsset = prefs.getInt('privilage_asset') ?? 0;
    final assetMutation = prefs.getInt('asset_mutation') ?? 0;
    final reportAssetMutation = prefs.getInt('report_asset_mutation') ?? 0;
    final approvalAssetMutation = prefs.getInt('approval_asset_mutation') ?? 0;
    final approvalAll = prefs.getInt('approval_all') ?? 0;
    final reportAsset = prefs.getInt('report_asset') ?? 0;
    final reportAssetHistory = prefs.getInt('report_asset_history') ?? 0;
    final listOfAsset = prefs.getInt('list_of_asset') ?? 0;
    final recapWo = prefs.getInt('recap_wo') ?? 0;
    final reportCr = prefs.getInt('report_cr') ?? 0;
    final reportSo = prefs.getInt('report_so') ?? 1;

    for (var i = 0; i < menuItems.length; i++) {
      final item = menuItems[i];
      if (item.permissionKey.isEmpty) continue;

      bool hasPermission = false;

      switch (item.permissionKey) {
        case 'wo_it':
          hasPermission = woIt == 1;
          break;
        case 'wo_ga':
          hasPermission = woGa == 1;
          break;
        case 'wo_mtc':
          hasPermission = woMtc == 1 || woMtcAll == 1 || woCrossAccess == 1;
          break;
        case 'wo_operational':
          hasPermission = woOperational == 1 || woCrossAccess == 1;
          break;
        case 'wo_preventive':
          hasPermission = woPreventive == 1;
          break;
        case 'wo_void':
          hasPermission = woVoid == 1;
          break;
        case 'daily_control':
          hasPermission = dailyControl == 1;
          break;
        case 'approval_access':
          hasPermission = woIt == 1 ||
              woGa == 1 ||
              woMtc == 1 ||
              woOperational == 1 ||
              woPreventive == 1 ||
              approvalAll == 1 ||
              approvalAssetMutation == 1;
          break;
        case 'asset_access':
          hasPermission =
              reportAsset == 1 || listOfAsset == 1 || privilageAsset == 1;
          break;
        case 'asset_mutation_access':
          hasPermission = assetMutation == 1 ||
              reportAssetMutation == 1 ||
              approvalAssetMutation == 1;
          break;
        case 'report_access':
          hasPermission = _hasAnyReportPermission(
            reportAssetHistory: reportAssetHistory,
            recapWo: recapWo,
            reportCr: reportCr,
            reportSo: reportSo,
          );
          break;
      }

      _setMenuItemPermissionState(i, item, hasPermission);
    }
  }

  void _updateMenuPermissions() {
    if (currentUser.value?.permissions == null) return;

    final permissions = currentUser.value!.permissions!;

    for (var i = 0; i < menuItems.length; i++) {
      final item = menuItems[i];
      if (item.permissionKey.isEmpty) continue;

      bool hasPermission = false;

      switch (item.permissionKey) {
        case 'wo_it':
          hasPermission = permissions.woIt == 1;
          break;
        case 'wo_ga':
          hasPermission = permissions.woGa == 1;
          break;
        case 'wo_mtc':
          hasPermission = permissions.woMtc == 1 ||
              permissions.woMtcAll == 1 ||
              permissions.woCrossAccess == 1;
          break;
        case 'wo_operational':
          hasPermission =
              permissions.woOperational == 1 || permissions.woCrossAccess == 1;
          break;
        case 'wo_preventive':
          hasPermission = permissions.woPreventive == 1;
          break;
        case 'wo_void':
          hasPermission = permissions.woVoid == 1;
          break;
        case 'daily_control':
          hasPermission = permissions.dailyControl == 1;
          break;
        case 'approval_access':
          hasPermission = permissions.woIt == 1 ||
              permissions.woGa == 1 ||
              permissions.woMtc == 1 ||
              permissions.woOperational == 1 ||
              permissions.woPreventive == 1 ||
              permissions.approvalAll == 1 ||
              permissions.approvalAssetMutation == 1;
          break;
        case 'asset_access':
          hasPermission = permissions.reportAsset == 1 ||
              permissions.listOfAsset == 1 ||
              permissions.privilageAsset == 1;
          break;
        case 'asset_mutation_access':
          hasPermission = permissions.assetMutation == 1 ||
              permissions.reportAssetMutation == 1 ||
              permissions.approvalAssetMutation == 1;
          break;
        case 'report_access':
          hasPermission = _hasAnyReportPermission(
            reportAssetHistory: permissions.reportAssetHistory,
            recapWo: permissions.recapWo,
            reportCr: permissions.reportCr,
            reportSo: permissions.reportSo,
          );
          break;
      }

      _setMenuItemPermissionState(i, item, hasPermission);
    }
  }

  bool _hasAnyReportPermission({
    required int reportAssetHistory,
    required int recapWo,
    required int reportCr,
    required int reportSo,
  }) {
    return reportAssetHistory == 1 ||
        recapWo == 1 ||
        reportCr == 1 ||
        reportSo == 1;
  }

  void _setMenuItemPermissionState(int index, MenuItem item, bool enabled) {
    if (item.enabled == enabled) return;
    menuItems[index] = MenuItem(
      title: item.title,
      subtitle: item.subtitle,
      icon: item.icon,
      imagePath: item.imagePath,
      imageUrl: item.imageUrl,
      color: item.color,
      route: item.route,
      enabled: enabled,
      permissionKey: item.permissionKey,
    );
  }

  Future<void> _refreshLiveCounts() async {
    await Future.wait<void>([
      loadWoStats(silent: true),
      loadModuleCounts(),
      refreshDailyControlUnreadCount(),
    ]);
  }

  Future<void> loadWoStats({bool silent = false}) async {
    try {
      if (!silent) isLoadingStats.value = true;
      final prefs = await SharedPreferences.getInstance();

      final results = await Future.wait<int>([
        _loadManagementTypeCount(prefs, 'preventive'),
        _loadManagementTypeCount(prefs, 'corrective'),
        _loadManagementTypeCount(prefs, 'project'),
      ]);

      preventiveWoCount.value = results[0];
      correctiveWoCount.value = results[1];
      projectWoCount.value = results[2];
    } catch (e) {
      if (!silent) {
        preventiveWoCount.value = 0;
        correctiveWoCount.value = 0;
        projectWoCount.value = 0;
      }
    } finally {
      isLoadingStats.value = false;
    }
  }

  int _parseIntValue(dynamic value) {
    if (value == null) return 0;
    if (value is int) return value;
    if (value is double) return value.toInt();
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }

  Future<void> navigateToModule(MenuItem item) async {
    try {
      if (!item.enabled) {
        Get.snackbar(
          'Coming Soon',
          'Modul ${item.title} sedang dalam pengembangan',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: Colors.orange,
          colorText: Colors.white,
          duration: const Duration(seconds: 2),
        );
        return;
      }

      await Get.toNamed(
        item.route,
        arguments: {'moduleTitle': item.title},
      );
      await refreshDailyControlUnreadCount();
      await loadModuleCounts();
    } catch (e) {
      Get.snackbar(
        'Error',
        'Gagal membuka ${item.title}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> logout() async {
    Get.dialog(
      AlertDialog(
        title: const Text('Konfirmasi'),
        content: const Text('Apakah Anda yakin ingin logout?'),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (Get.isRegistered<RealtimeService>()) RealtimeService.to.stop();
              await PushNotificationService.instance.unregisterCurrentToken();
              await PushNotificationService.instance
                  .clearDailyControlBadgeCount();
              final prefs = await SharedPreferences.getInstance();
              await PushNotificationService.clearPreferencesKeepingPermissionFlags(
                  prefs);

              Get.offAllNamed('/login');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}
