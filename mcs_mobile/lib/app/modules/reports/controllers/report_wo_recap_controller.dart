import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/routes/app_routes.dart';
import '../../../core/services/realtime_service.dart';
import '../../../data/providers/api_service.dart';
import '../../../data/repositories/reports_repository.dart';

class RecapOption {
  final String value;
  final String label;

  const RecapOption(this.value, this.label);
}

class RecapKpi {
  final int total;
  final int waiting;
  final int progress;
  final int closed;
  final int rejected;
  final int emergency;
  final bool truncated;

  const RecapKpi({
    this.total = 0,
    this.waiting = 0,
    this.progress = 0,
    this.closed = 0,
    this.rejected = 0,
    this.emergency = 0,
    this.truncated = false,
  });
}

class ReportWoRecapController extends GetxController with RealtimeRefresh {
  static const String _report = 'recap-work-orders';
  static const String _optionsPath = '/v2/work-orders/options';
  static const int _pageSize = 30;
  static const int _kpiPageSize = 500;
  static const int _kpiMaxPages = 20;

  static const Map<String, List<String>> modulePermissions = {
    'meso': ['wo_mtc', 'wo_mtc_all', 'wo_cross_access'],
    'maintenance': ['wo_operational', 'wo_mtc_all', 'wo_cross_access'],
    'production': ['wo_preventive', 'wo_cross_access'],
    'is': ['wo_it', 'wo_cross_access'],
    'ga': ['wo_ga', 'wo_cross_access'],
  };

  static const Map<String, String> moduleLabels = {
    'meso': 'MESO',
    'maintenance': 'Maintenance',
    'production': 'Production',
    'is': 'IS',
    'ga': 'GA',
  };

  static const Map<String, String> moduleDetailRoutes = {
    'meso': AppRoutes.woMtcDetail,
    'maintenance': AppRoutes.woOperationalDetail,
    'production': AppRoutes.woProductionDetail,
    'is': AppRoutes.woDetail,
    'ga': AppRoutes.woGaDetail,
  };

  static const List<RecapOption> _defaultTypes = [
    RecapOption('CORRECTIVE MAINTENANCE', 'Corrective Maintenance'),
    RecapOption('PREVENTIVE MAINTENANCE', 'Preventive Maintenance'),
    RecapOption('PROJECT', 'Project'),
  ];

  final ReportsRepository _repository = ReportsRepository();
  final ApiService _api = ApiService();

  final ScrollController scrollController = ScrollController();
  final TextEditingController searchController = TextEditingController();

  final isReady = false.obs;
  final allowedModules = <String>[].obs;
  final activeModule = ''.obs;

  final company = ''.obs;
  final idDivision = ''.obs;
  final typeWo = ''.obs;
  final jobExecutor = ''.obs;
  final priority = ''.obs;
  final status = ''.obs;
  final dateFrom = ''.obs;
  final dateTo = ''.obs;
  final query = ''.obs;

  final companies = <RecapOption>[].obs;
  final divisions = <RecapOption>[].obs;
  final types = <RecapOption>[].obs;
  final priorities = <RecapOption>[].obs;
  final statuses = <RecapOption>[].obs;

  final rows = <Map<String, dynamic>>[].obs;
  final isLoading = false.obs;
  final isLoadingMore = false.obs;
  final errorMessage = ''.obs;
  final total = 0.obs;
  final hasMore = false.obs;
  int _page = 1;
  int _listSeq = 0;

  final kpi = const RecapKpi().obs;
  final isKpiLoading = false.obs;
  final kpiError = ''.obs;
  int _kpiSeq = 0;

  final exporting = ''.obs;

  Timer? _debounce;

  @override
  void onInit() {
    super.onInit();
    scrollController.addListener(_onScroll);
    _bootstrap();
    bindRealtime(
      const ['wo'],
      _silentRefresh,
      debounce: const Duration(seconds: 2),
    );
  }

  Future<void> _silentRefresh() async {
    if (!isReady.value || activeModule.value.isEmpty) return;
    if (isLoading.value || isLoadingMore.value) return;
    await Future.wait([loadFirstPage(silent: true), loadKpi(silent: true)]);
  }

  @override
  void onClose() {
    _debounce?.cancel();
    scrollController.dispose();
    searchController.dispose();
    super.onClose();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    bool has(List<String> keys) =>
        keys.any((key) => (prefs.getInt(key) ?? 0) == 1);
    final modules = modulePermissions.entries
        .where((entry) => has(entry.value))
        .map((entry) => entry.key)
        .toList();
    allowedModules.assignAll(modules);
    activeModule.value = modules.isNotEmpty ? modules.first : '';
    isReady.value = true;
    if (modules.isEmpty) return;
    unawaited(_loadOptions());
    await reload();
  }

  Future<void> _loadOptions() async {
    types.assignAll(_defaultTypes);
    try {
      final options = await _repository.recapOptions();
      companies.assignAll(_parseValueLabel(options['companies']));
      divisions.assignAll(_parseValueLabel(options['divisions']));
    } catch (_) {}
    try {
      final response = await _api.get(_optionsPath);
      final body = response.data;
      if (body is Map && body['data'] is Map) {
        final data = body['data'] as Map;
        final fetchedTypes = _parseCodeLabel(data['types']);
        if (fetchedTypes.isNotEmpty) types.assignAll(fetchedTypes);
        priorities.assignAll(_parseCodeLabel(data['priorities']));
        statuses.assignAll(_parseCodeLabel(data['statuses']));
      }
    } catch (_) {}
  }

  List<RecapOption> _parseValueLabel(dynamic raw) {
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => RecapOption('${e['value'] ?? ''}', '${e['label'] ?? ''}'))
        .where((o) => o.value.isNotEmpty)
        .toList();
  }

  List<RecapOption> _parseCodeLabel(dynamic raw) {
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => RecapOption('${e['code'] ?? ''}', '${e['label'] ?? ''}'))
        .where((o) => o.value.isNotEmpty)
        .toList();
  }

  Map<String, dynamic> get filterParams => {
        'module': activeModule.value,
        'company': company.value,
        'id_division': idDivision.value,
        'type_wo': typeWo.value,
        'job_executor': jobExecutor.value.trim(),
        'priority': priority.value,
        'status': status.value,
        'date_from': dateFrom.value,
        'date_to': dateTo.value,
        'q': query.value.trim(),
      };

  int get activeFilterCount => [
        company.value,
        idDivision.value,
        typeWo.value,
        jobExecutor.value.trim(),
        priority.value,
        status.value,
        dateFrom.value,
        dateTo.value,
      ].where((v) => v.isNotEmpty).length;

  Future<void> reload() async {
    await Future.wait([loadFirstPage(), loadKpi()]);
  }

  Future<void> loadFirstPage({bool silent = false}) async {
    final seq = ++_listSeq;
    if (!silent) {
      isLoading.value = true;
      errorMessage.value = '';
    }
    try {
      final params = filterParams;
      final pages = silent ? _page.clamp(1, 10) : 1;
      final loaded = <Map<String, dynamic>>[];
      var result = await _repository.fetch(
        _report,
        params,
        page: 1,
        perPage: _pageSize,
      );
      if (seq != _listSeq) return;
      loaded.addAll(result.rows);
      for (var next = 2; next <= pages && result.hasMore; next++) {
        result = await _repository.fetch(
          _report,
          params,
          page: next,
          perPage: _pageSize,
        );
        if (seq != _listSeq) return;
        loaded.addAll(result.rows);
      }
      rows.assignAll(loaded);
      total.value = result.total;
      hasMore.value = result.hasMore;
      _page = result.page;
      if (silent) errorMessage.value = '';
    } catch (e) {
      if (seq != _listSeq) return;
      if (silent) return;
      rows.clear();
      total.value = 0;
      hasMore.value = false;
      errorMessage.value = _message(e);
    } finally {
      if (seq == _listSeq) isLoading.value = false;
    }
  }

  Future<void> loadMore() async {
    if (isLoading.value || isLoadingMore.value || !hasMore.value) return;
    final seq = _listSeq;
    isLoadingMore.value = true;
    try {
      final result = await _repository.fetch(
        _report,
        filterParams,
        page: _page + 1,
        perPage: _pageSize,
      );
      if (seq != _listSeq) return;
      rows.addAll(result.rows);
      total.value = result.total;
      hasMore.value = result.hasMore;
      _page = result.page;
    } catch (e) {
      if (seq != _listSeq) return;
      _snack('Gagal memuat data', _message(e));
    } finally {
      isLoadingMore.value = false;
    }
  }

  Future<void> loadKpi({bool silent = false}) async {
    final seq = ++_kpiSeq;
    if (!silent) {
      isKpiLoading.value = true;
      kpiError.value = '';
    }
    try {
      final params = filterParams;
      var waiting = 0;
      var progress = 0;
      var closed = 0;
      var rejected = 0;
      var emergency = 0;
      var count = 0;
      var truncated = false;
      var page = 1;
      while (true) {
        final result = await _repository.fetch(
          _report,
          params,
          page: page,
          perPage: _kpiPageSize,
        );
        if (seq != _kpiSeq) return;
        for (final row in result.rows) {
          final s = '${row['status'] ?? ''}'.toUpperCase();
          if (s.startsWith('WAIT')) {
            waiting++;
          } else if (s == 'CLOSED') {
            closed++;
          } else if (s == 'REJECT' || s == 'DECLINE' || s == 'VOID') {
            rejected++;
          } else {
            progress++;
          }
          if ('${row['priority'] ?? ''}'.toUpperCase() == 'EMERGENCY') {
            emergency++;
          }
          count++;
        }
        if (result.rows.isEmpty || !result.hasMore) break;
        if (page >= _kpiMaxPages) {
          truncated = true;
          break;
        }
        page++;
      }
      kpi.value = RecapKpi(
        total: count,
        waiting: waiting,
        progress: progress,
        closed: closed,
        rejected: rejected,
        emergency: emergency,
        truncated: truncated,
      );
    } catch (e) {
      if (seq != _kpiSeq) return;
      if (silent) return;
      kpi.value = const RecapKpi();
      kpiError.value = _message(e);
    } finally {
      if (seq == _kpiSeq) isKpiLoading.value = false;
    }
  }

  void _onScroll() {
    if (!scrollController.hasClients) return;
    final position = scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 320) {
      loadMore();
    }
  }

  void selectModule(String module) {
    if (module == activeModule.value) return;
    activeModule.value = module;
    reload();
  }

  void onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () {
      if (query.value == value.trim()) return;
      query.value = value.trim();
      reload();
    });
  }

  void clearSearch() {
    searchController.clear();
    _debounce?.cancel();
    if (query.value.isEmpty) return;
    query.value = '';
    reload();
  }

  void applyFilters({
    required String company,
    required String idDivision,
    required String typeWo,
    required String jobExecutor,
    required String priority,
    required String status,
    required String dateFrom,
    required String dateTo,
  }) {
    this.company.value = company;
    this.idDivision.value = idDivision;
    this.typeWo.value = typeWo;
    this.jobExecutor.value = jobExecutor;
    this.priority.value = priority;
    this.status.value = status;
    this.dateFrom.value = dateFrom;
    this.dateTo.value = dateTo;
    reload();
  }

  void resetFilters() {
    _debounce?.cancel();
    searchController.clear();
    query.value = '';
    applyFilters(
      company: '',
      idDivision: '',
      typeWo: '',
      jobExecutor: '',
      priority: '',
      status: '',
      dateFrom: '',
      dateTo: '',
    );
  }

  Future<void> openDetail(Map<String, dynamic> row) async {
    final woNumber = '${row['wo_number'] ?? ''}'.trim();
    if (woNumber.isEmpty) return;
    final moduleKey = '${row['module'] ?? activeModule.value}'.toLowerCase();
    final route =
        moduleDetailRoutes[moduleKey] ?? moduleDetailRoutes[activeModule.value];
    if (route == null) return;
    await Get.toNamed(route, arguments: woNumber);
  }

  Future<void> export(String format) async {
    if (exporting.value.isNotEmpty) return;
    if (total.value == 0) {
      _snack('Export', 'Tidak ada data untuk diexport');
      return;
    }
    exporting.value = format;
    try {
      final stamp = DateTime.now().toIso8601String().substring(0, 10);
      await _repository.downloadAndOpen(
        _report,
        filterParams,
        format: format,
        fileName: 'recap-wo-${activeModule.value}-$stamp',
      );
    } catch (e) {
      _snack('Gagal export', _message(e));
    } finally {
      exporting.value = '';
    }
  }

  String _message(Object e) => e.toString().replaceFirst('Exception: ', '');

  void _snack(String title, String message) {
    Get.snackbar(
      title,
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: Colors.red,
      colorText: Colors.white,
    );
  }
}
