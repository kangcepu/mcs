import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../data/repositories/reports_repository.dart';

class ReportAssetHistoryController extends GetxController {
  static const int _assetPerPage = 20;
  static const int _historyPerPage = 30;
  static const int minQueryLength = 2;

  static const Map<String, String> _statusLabel = {
    'WAIT_KA_DIV': 'Menunggu Ka. Divisi',
    'WAIT_KA_DIV_ITIS': 'Menunggu Ka. ITIS',
    'WAIT_KA_DIV_MTC': 'Menunggu Ka. MTC',
    'WAIT_KA_DIV_HRGA': 'Menunggu Ka. HRGA',
    'WAIT_KA_DEPT_MESO': 'Menunggu Ka. Dept MESO',
    'WAIT_EXECUTOR_ADMIN': 'Menunggu Admin Eksekutor',
    'IN_PROGRESS_EXECUTOR': 'Dikerjakan',
    'WAITING_PARTS': 'Menunggu Part',
    'PARTS_RECEIVED': 'Part Diterima',
    'COMPLETE_EXECUTOR': 'Selesai Eksekutor',
    'NEED_CLOSED': 'Perlu Ditutup',
    'COMPLETE': 'Selesai',
    'CLOSED': 'Ditutup',
    'VOID': 'Void',
    'REJECT': 'Ditolak',
    'DECLINE': 'Ditolak',
    'FROM_MAINTENANCE': 'Dari Maintenance',
    'FORWARD_TO_MESO': 'Diteruskan ke MESO',
  };

  static const List<String> _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];

  final ReportsRepository _repository = ReportsRepository();

  final searchController = TextEditingController();
  final assetScroll = ScrollController();
  final historyScroll = ScrollController();

  final assets = <Map<String, dynamic>>[].obs;
  final assetsLoading = false.obs;
  final assetsLoadingMore = false.obs;
  final assetsError = ''.obs;
  final assetsTotal = 0.obs;
  final query = ''.obs;

  final selected = Rxn<Map<String, dynamic>>();
  final history = <Map<String, dynamic>>[].obs;
  final historyLoading = false.obs;
  final historyLoadingMore = false.obs;
  final historyError = ''.obs;
  final historyTotal = 0.obs;
  final exporting = ''.obs;

  Timer? _debounce;
  int _assetPage = 1;
  bool _assetHasMore = false;
  int _assetToken = 0;
  int _historyPage = 1;
  bool _historyHasMore = false;
  int _historyToken = 0;

  @override
  void onInit() {
    super.onInit();
    assetScroll.addListener(() {
      if (_nearEnd(assetScroll)) loadMoreAssets();
    });
    historyScroll.addListener(() {
      if (_nearEnd(historyScroll)) loadMoreHistory();
    });
  }

  @override
  void onClose() {
    _debounce?.cancel();
    searchController.dispose();
    assetScroll.dispose();
    historyScroll.dispose();
    super.onClose();
  }

  bool _nearEnd(ScrollController c) =>
      c.hasClients && c.position.pixels >= c.position.maxScrollExtent - 280;

  String _msg(Object e) => e.toString().replaceFirst('Exception: ', '');

  static String read(Map<String, dynamic> row, List<String> keys) {
    for (final key in keys) {
      final v = row[key];
      if (v != null && '$v'.trim().isNotEmpty) return '$v'.trim();
    }
    return '';
  }

  static String statusText(dynamic value) {
    final s = '${value ?? ''}'.trim().toUpperCase();
    if (s.isEmpty) return '-';
    final label = _statusLabel[s];
    if (label != null) return label;
    return s
        .replaceAll('_', ' ')
        .toLowerCase()
        .split(' ')
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }

  static String dateText(dynamic value) {
    final s = '${value ?? ''}'.trim();
    if (s.isEmpty || s.startsWith('0000')) return '-';
    final d = DateTime.tryParse(s.replaceFirst(' ', 'T'));
    if (d == null) return s;
    final local = s.contains('Z') || s.contains('+') ? d.toLocal() : d;
    return '${local.day.toString().padLeft(2, '0')} ${_months[local.month - 1]} ${local.year}';
  }

  void onSearchChanged(String value) {
    query.value = value.trim();
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), loadAssets);
  }

  void clearSearch() {
    searchController.clear();
    onSearchChanged('');
  }

  Future<void> loadAssets() async {
    final q = query.value;
    final token = ++_assetToken;
    if (q.length < minQueryLength) {
      assets.clear();
      assetsError.value = '';
      assetsTotal.value = 0;
      assetsLoading.value = false;
      assetsLoadingMore.value = false;
      return;
    }
    assetsLoading.value = true;
    assetsError.value = '';
    try {
      final result = await _repository.assets(q: q, perPage: _assetPerPage);
      if (token != _assetToken) return;
      assets.assignAll(result.rows);
      assetsTotal.value = result.total;
      _assetPage = result.page;
      _assetHasMore = result.hasMore;
    } catch (e) {
      if (token != _assetToken) return;
      assets.clear();
      assetsError.value = _msg(e);
    } finally {
      if (token == _assetToken) assetsLoading.value = false;
    }
  }

  Future<void> loadMoreAssets() async {
    if (!_assetHasMore || assetsLoading.value || assetsLoadingMore.value) {
      return;
    }
    final token = _assetToken;
    assetsLoadingMore.value = true;
    try {
      final result = await _repository.assets(
        q: query.value,
        page: _assetPage + 1,
        perPage: _assetPerPage,
      );
      if (token != _assetToken) return;
      assets.addAll(result.rows);
      _assetPage = result.page;
      _assetHasMore = result.hasMore;
    } catch (e) {
      if (token == _assetToken) _snack('Gagal memuat aset', _msg(e));
    } finally {
      assetsLoadingMore.value = false;
    }
  }

  void selectAsset(Map<String, dynamic> row) {
    selected.value = row;
    loadHistory();
  }

  void clearSelection() {
    _historyToken++;
    selected.value = null;
    history.clear();
    historyError.value = '';
    historyTotal.value = 0;
  }

  String get selectedCode => read(selected.value ?? {}, ['AssetCode']);

  String get selectedName => read(selected.value ?? {}, ['AssetName']);

  Future<void> loadHistory() async {
    final code = selectedCode;
    if (code.isEmpty) return;
    final token = ++_historyToken;
    historyLoading.value = true;
    historyError.value = '';
    try {
      final result = await _repository.fetch(
        'assets-history',
        {'asset_code': code},
        perPage: _historyPerPage,
      );
      if (token != _historyToken) return;
      history.assignAll(result.rows);
      historyTotal.value = result.total;
      _historyPage = result.page;
      _historyHasMore = result.hasMore;
    } catch (e) {
      if (token != _historyToken) return;
      history.clear();
      historyError.value = _msg(e);
    } finally {
      if (token == _historyToken) historyLoading.value = false;
    }
  }

  Future<void> loadMoreHistory() async {
    if (!_historyHasMore ||
        historyLoading.value ||
        historyLoadingMore.value) {
      return;
    }
    final token = _historyToken;
    historyLoadingMore.value = true;
    try {
      final result = await _repository.fetch(
        'assets-history',
        {'asset_code': selectedCode},
        page: _historyPage + 1,
        perPage: _historyPerPage,
      );
      if (token != _historyToken) return;
      history.addAll(result.rows);
      _historyPage = result.page;
      _historyHasMore = result.hasMore;
    } catch (e) {
      if (token == _historyToken) _snack('Gagal memuat riwayat', _msg(e));
    } finally {
      historyLoadingMore.value = false;
    }
  }

  Future<void> export(String format) async {
    final code = selectedCode;
    if (code.isEmpty || exporting.value.isNotEmpty) return;
    if (history.isEmpty) {
      _snack('Tidak ada data', 'Tidak ada data untuk diekspor');
      return;
    }
    exporting.value = format;
    try {
      await _repository.downloadAndOpen(
        'assets-history',
        {'asset_code': code},
        format: format,
        fileName: 'asset-history-${code.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}',
      );
    } catch (e) {
      _snack('Gagal ekspor', _msg(e));
    } finally {
      exporting.value = '';
    }
  }

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
