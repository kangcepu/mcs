import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';

import '../../../data/repositories/reports_repository.dart';

class ReportQrController extends GetxController {
  static const int _perPage = 15;

  final ReportsRepository _repository = ReportsRepository();

  final searchController = TextEditingController();
  final scrollController = ScrollController();

  final assets = <Map<String, dynamic>>[].obs;
  final isLoading = false.obs;
  final isLoadingMore = false.obs;
  final errorMessage = ''.obs;
  final total = 0.obs;
  final query = ''.obs;

  Timer? _debounce;
  int _page = 1;
  bool _hasMore = false;
  int _token = 0;

  @override
  void onInit() {
    super.onInit();
    scrollController.addListener(() {
      final c = scrollController;
      if (c.hasClients && c.position.pixels >= c.position.maxScrollExtent - 280) {
        loadMore();
      }
    });
    load();
  }

  @override
  void onClose() {
    _debounce?.cancel();
    searchController.dispose();
    scrollController.dispose();
    super.onClose();
  }

  String _msg(Object e) => e.toString().replaceFirst('Exception: ', '');

  static String read(Map<String, dynamic> row, List<String> keys) {
    for (final key in keys) {
      final v = row[key];
      if (v != null && '$v'.trim().isNotEmpty) return '$v'.trim();
    }
    return '';
  }

  void onSearchChanged(String value) {
    query.value = value.trim();
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), load);
  }

  void clearSearch() {
    searchController.clear();
    onSearchChanged('');
  }

  Future<void> load() async {
    final token = ++_token;
    isLoading.value = true;
    errorMessage.value = '';
    try {
      final result = await _repository.assets(
        q: query.value,
        perPage: _perPage,
        activeOnly: true,
      );
      if (token != _token) return;
      assets.assignAll(result.rows);
      total.value = result.total;
      _page = result.page;
      _hasMore = result.hasMore;
    } catch (e) {
      if (token != _token) return;
      assets.clear();
      errorMessage.value = _msg(e);
    } finally {
      if (token == _token) isLoading.value = false;
    }
  }

  Future<void> loadMore() async {
    if (!_hasMore || isLoading.value || isLoadingMore.value) return;
    final token = _token;
    isLoadingMore.value = true;
    try {
      final result = await _repository.assets(
        q: query.value,
        page: _page + 1,
        perPage: _perPage,
        activeOnly: true,
      );
      if (token != _token) return;
      assets.addAll(result.rows);
      _page = result.page;
      _hasMore = result.hasMore;
    } catch (e) {
      if (token == _token) _snack('Gagal memuat aset', _msg(e), error: true);
    } finally {
      isLoadingMore.value = false;
    }
  }

  Future<Map<String, dynamic>> fetchQr(String assetCode) =>
      _repository.qr(assetCode);

  Future<void> copyText(String text, String successMessage) async {
    await Clipboard.setData(ClipboardData(text: text));
    _snack('Tersalin', successMessage);
  }

  Future<void> saveAndOpenLabel(GlobalKey boundaryKey, String assetCode) async {
    try {
      final boundary = boundaryKey.currentContext?.findRenderObject()
          as RenderRepaintBoundary?;
      if (boundary == null) throw Exception('Label belum siap');
      final image = await boundary.toImage(pixelRatio: 5);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw Exception('Gagal membuat gambar label');
      final dir = await getTemporaryDirectory();
      final safe = assetCode.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
      final file = File('${dir.path}/label-qr-$safe.png');
      await file.writeAsBytes(data.buffer.asUint8List(), flush: true);
      final result = await OpenFile.open(file.path, type: 'image/png');
      if (result.type != ResultType.done) {
        _snack('Label tersimpan', 'Lokasi file: ${file.path}');
      }
    } catch (e) {
      _snack('Gagal menyiapkan label', _msg(e), error: true);
    }
  }

  void _snack(String title, String message, {bool error = false}) {
    Get.snackbar(
      title,
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor: error ? Colors.red : null,
      colorText: error ? Colors.white : null,
    );
  }
}
