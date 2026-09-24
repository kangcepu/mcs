import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/constants/api_constants.dart';
import '../../../data/providers/api_service.dart';
import '../../../data/repositories/reports_repository.dart';

class AssetFilterOption {
  final String value;
  final String label;

  const AssetFilterOption(this.value, this.label);
}

class ReportAssetController extends GetxController {
  static const int _pageSize = 50;

  final ReportsRepository _repository = ReportsRepository();
  final ApiService _api = ApiService();

  late final String reportKey;
  late final String title;

  final items = <Map<String, dynamic>>[].obs;
  final isLoading = false.obs;
  final isLoadingMore = false.obs;
  final isExporting = false.obs;
  final errorMessage = RxnString();

  final total = 0.obs;
  final activeCount = 0.obs;
  final page = 1.obs;
  final totalPages = 1.obs;

  final query = ''.obs;
  final company = ''.obs;
  final location = ''.obs;
  final category = ''.obs;
  final status = ''.obs;

  final companyOptions = <AssetFilterOption>[].obs;
  final locationOptions = <AssetFilterOption>[].obs;
  final categoryOptions = <AssetFilterOption>[].obs;

  final TextEditingController searchController = TextEditingController();
  final ScrollController scrollController = ScrollController();
  Timer? _debounce;

  bool get hasMore => page.value < totalPages.value;

  int get activeFilterCount => [
        company.value,
        location.value,
        category.value,
        status.value,
      ].where((v) => v.isNotEmpty).length;

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    reportKey = args is Map && args['report'] is String
        ? args['report'] as String
        : 'assets';
    title = args is Map && args['title'] is String
        ? args['title'] as String
        : 'Report Assets';
    scrollController.addListener(_onScroll);
    _loadOptions();
    reload();
  }

  @override
  void onClose() {
    _debounce?.cancel();
    searchController.dispose();
    scrollController.dispose();
    super.onClose();
  }

  void _onScroll() {
    if (!scrollController.hasClients) return;
    final position = scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 240) {
      loadMore();
    }
  }

  Future<void> _loadOptions() async {
    try {
      final response = await _api.get('${ApiConstants.assets}/options');
      final body = response.data;
      if (body is! Map || body['data'] is! Map) return;
      final data = body['data'] as Map;
      List<AssetFilterOption> parse(dynamic raw) => raw is List
          ? raw
              .whereType<Map>()
              .map((e) => AssetFilterOption(
                    '${e['value'] ?? ''}',
                    '${e['label'] ?? e['value'] ?? ''}',
                  ))
              .where((o) => o.value.trim().isNotEmpty)
              .toList()
          : <AssetFilterOption>[];
      companyOptions.assignAll(parse(data['companies']));
      locationOptions.assignAll(parse(data['locations']));
      categoryOptions.assignAll(parse(data['categories']));
    } catch (_) {}
  }

  Map<String, dynamic> get _params => {
        'q': query.value,
        'company': company.value,
        'location': location.value,
        'category': category.value,
        'active': status.value,
      };

  void onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      query.value = value.trim();
      reload();
    });
  }

  void applyFilters({
    required String company,
    required String location,
    required String category,
    required String status,
  }) {
    this.company.value = company;
    this.location.value = location;
    this.category.value = category;
    this.status.value = status;
    reload();
  }

  void resetFilters() {
    applyFilters(company: '', location: '', category: '', status: '');
  }

  Future<void> reload() async {
    isLoading.value = true;
    errorMessage.value = null;
    try {
      final result = await _repository.fetch(
        reportKey,
        _params,
        page: 1,
        perPage: _pageSize,
      );
      items.assignAll(result.rows);
      page.value = result.page;
      totalPages.value = result.totalPages;
      total.value = result.total;
      await _loadActiveCount(result.total);
    } catch (e) {
      items.clear();
      total.value = 0;
      activeCount.value = 0;
      errorMessage.value = '$e'.replaceFirst('Exception: ', '');
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> _loadActiveCount(int matching) async {
    if (status.value == 'active') {
      activeCount.value = matching;
      return;
    }
    if (status.value == 'inactive') {
      activeCount.value = 0;
      return;
    }
    try {
      final result = await _repository.fetch(
        reportKey,
        {..._params, 'active': 'active'},
        page: 1,
        perPage: 10,
      );
      activeCount.value = result.total;
    } catch (_) {
      activeCount.value = 0;
    }
  }

  Future<void> loadMore() async {
    if (isLoading.value || isLoadingMore.value || !hasMore) return;
    isLoadingMore.value = true;
    try {
      final result = await _repository.fetch(
        reportKey,
        _params,
        page: page.value + 1,
        perPage: _pageSize,
      );
      items.addAll(result.rows);
      page.value = result.page;
      totalPages.value = result.totalPages;
    } catch (e) {
      Get.snackbar(
        'Gagal memuat',
        '$e'.replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFDC2626),
        colorText: Colors.white,
      );
    } finally {
      isLoadingMore.value = false;
    }
  }

  Future<void> export(String format) async {
    if (isExporting.value) return;
    isExporting.value = true;
    try {
      await _repository.downloadAndOpen(
        reportKey,
        _params,
        format: format,
        fileName: title.replaceAll(' ', '_'),
      );
    } catch (e) {
      Get.snackbar(
        'Export gagal',
        '$e'.replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFDC2626),
        colorText: Colors.white,
      );
    } finally {
      isExporting.value = false;
    }
  }

  String read(Map<String, dynamic> row, List<String> keys) {
    for (final key in keys) {
      final value = row[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
    return '';
  }

  bool isActive(Map<String, dynamic> row) =>
      '${row['active'] ?? ''}'.toLowerCase() == 'active';
}
