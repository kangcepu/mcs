import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/services/permission_service.dart';
import '../../../data/providers/api_service.dart';
import '../utils/ai_image_analysis_export.dart';

const _activeStatuses = {'QUEUED', 'PROCESSING', 'RETRY_WAIT'};

String _errorMessage(Object error, [String fallback = 'Permintaan gagal.']) {
  if (error is DioException && error.response?.data is Map) {
    return (error.response!.data as Map)['message']?.toString() ?? fallback;
  }
  return fallback;
}

Map<String, dynamic>? _responseMap(dynamic response) {
  final body = response.data;
  final data = body is Map ? body['data'] : null;
  return data is Map ? Map<String, dynamic>.from(data) : null;
}

List<Map<String, dynamic>> _responseList(dynamic response) {
  final body = response.data;
  final data = body is Map ? body['data'] : null;
  return data is List
      ? data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
      : <Map<String, dynamic>>[];
}

Color _statusColor(String status) {
  switch (status) {
    case 'VERIFIED':
      return const Color(0xFF047857);
    case 'ANALYZED':
      return const Color(0xFF1D4ED8);
    case 'FAILED':
      return const Color(0xFFBE123C);
    case 'PROCESSING':
      return const Color(0xFF7C3AED);
    default:
      return const Color(0xFFB45309);
  }
}

String _statusLabel(String status) {
  switch (status) {
    case 'QUEUED':
      return 'Menunggu';
    case 'PROCESSING':
      return 'Menganalisis';
    case 'RETRY_WAIT':
      return 'Menunggu retry';
    case 'ANALYZED':
      return 'Selesai';
    case 'VERIFIED':
      return 'Terverifikasi';
    case 'FAILED':
      return 'Gagal';
    default:
      return status;
  }
}

class AiImageAnalysisPage extends StatefulWidget {
  const AiImageAnalysisPage({super.key});

  @override
  State<AiImageAnalysisPage> createState() => _AiImageAnalysisPageState();
}

class _AiImageAnalysisPageState extends State<AiImageAnalysisPage> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _rows = const [];
  bool _loading = true;
  bool _canCreate = false;
  bool _canRetry = false;
  bool _canVerify = false;
  Timer? _poller;
  Timer? _searchDebounce;

  bool get _hasActive => _rows
      .any((row) => _activeStatuses.contains(row['status']?.toString() ?? ''));

  @override
  void initState() {
    super.initState();
    _loadActionPermissions();
    _load();
    _poller = Timer.periodic(const Duration(seconds: 8), (_) {
      if (_hasActive) _load(silent: true);
    });
  }

  Future<void> _loadActionPermissions() async {
    final values = await Future.wait([
      PermissionService.hasAny(const ['ai_image_analysis_create']),
      PermissionService.hasAny(const ['ai_image_analysis_retry']),
      PermissionService.hasAny(const ['ai_image_analysis_verify']),
    ]);
    if (mounted) {
      setState(() {
        _canCreate = values[0];
        _canRetry = values[1];
        _canVerify = values[2];
      });
    }
  }

  @override
  void dispose() {
    _poller?.cancel();
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    try {
      final response =
          await ApiService().get('/v2/ai-image-analysis', queryParameters: {
        'q': _searchController.text.trim(),
        'per_page': 50,
      });
      if (mounted) setState(() => _rows = _responseList(response));
    } catch (error) {
      if (mounted && !silent) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_errorMessage(error, 'Gagal memuat hasil analisis.')),
          backgroundColor: Colors.red.shade700,
        ));
      }
    } finally {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  void _onSearch(String _) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 450), _load);
  }

  Future<void> _create() async {
    final id = await Navigator.of(context).push<int>(
      MaterialPageRoute(builder: (_) => const AiImageCapturePage()),
    );
    if (!mounted || id == null) return;
    await _load();
    if (!mounted) return;
    await Navigator.of(context).push<void>(MaterialPageRoute(
      builder: (_) => AiImageAnalysisDetailPage(
        id: id,
        canRetry: _canRetry,
        canVerify: _canVerify,
      ),
    ));
    await _load(silent: true);
  }

  Future<void> _openDetail(int id) async {
    await Navigator.of(context).push<void>(MaterialPageRoute(
      builder: (_) => AiImageAnalysisDetailPage(
        id: id,
        canRetry: _canRetry,
        canVerify: _canVerify,
      ),
    ));
    await _load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analisis Gambar AI'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded))
        ],
      ),
      floatingActionButton: _canCreate
          ? FloatingActionButton.extended(
              onPressed: _create,
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Baca Foto'),
            )
          : null,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
          child: TextField(
            controller: _searchController,
            onChanged: _onSearch,
            decoration: InputDecoration(
              hintText: 'Cari mesin, aktivitas, atau teks OCR...',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _searchController.text.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        _searchController.clear();
                        _load();
                      },
                      icon: const Icon(Icons.close_rounded)),
            ),
          ),
        ),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: _hasActive
              ? Container(
                  key: const ValueKey('active'),
                  margin: const EdgeInsets.fromLTRB(14, 0, 14, 8),
                  padding: const EdgeInsets.all(11),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFBFDBFE)),
                  ),
                  child: const Row(children: [
                    SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'AI sedang bekerja di background. Hasil diperbarui otomatis.',
                        style:
                            TextStyle(fontSize: 12, color: Color(0xFF1E40AF)),
                      ),
                    ),
                  ]),
                )
              : const SizedBox.shrink(key: ValueKey('idle')),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _rows.isEmpty
                  ? _EmptyAnalysis(onCreate: _canCreate ? _create : null)
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(14, 4, 14, 100),
                        itemCount: _rows.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, index) {
                          final row = _rows[index];
                          return _AnalysisCard(
                            row: row,
                            onTap: () =>
                                _openDetail(int.tryParse('${row['id']}') ?? 0),
                          );
                        },
                      ),
                    ),
        ),
      ]),
    );
  }
}

class _AnalysisCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final VoidCallback onTap;
  const _AnalysisCard({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final status = row['status']?.toString() ?? '';
    final active = _activeStatuses.contains(status);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFE2E8F0)),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.network(
                ApiConstants.mediaUrl(row['image_url']?.toString()),
                width: 92,
                height: 92,
                cacheWidth: 240,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  width: 92,
                  height: 92,
                  color: const Color(0xFFF1F5F9),
                  child: const Icon(Icons.broken_image_outlined),
                ),
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Expanded(
                      child: Text(row['activity_name']?.toString() ?? '-',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                    _LiveStatusBadge(status: status),
                  ]),
                  const SizedBox(height: 4),
                  Text(row['asset_code']?.toString() ?? '-',
                      style: const TextStyle(
                          color: Color(0xFF2563EB),
                          fontSize: 12,
                          fontWeight: FontWeight.w700)),
                  Text(row['asset_name']?.toString() ?? '-',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Color(0xFF64748B), fontSize: 11)),
                  const SizedBox(height: 7),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    child: Text(
                      active
                          ? 'Percobaan ${row['retry_count'] ?? 0} · analisis berjalan...'
                          : row['analysis_summary']?.toString() ??
                              row['error_message']?.toString() ??
                              'Belum ada hasil.',
                      key: ValueKey('$status-${row['retry_count']}'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11, color: Color(0xFF475569)),
                    ),
                  ),
                ],
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _LiveStatusBadge extends StatefulWidget {
  final String status;
  const _LiveStatusBadge({required this.status});

  @override
  State<_LiveStatusBadge> createState() => _LiveStatusBadgeState();
}

class _LiveStatusBadgeState extends State<_LiveStatusBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 850));
    _sync();
  }

  @override
  void didUpdateWidget(covariant _LiveStatusBadge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.status != widget.status) _sync();
  }

  void _sync() {
    if (_activeStatuses.contains(widget.status)) {
      _controller.repeat(reverse: true);
    } else {
      _controller.stop();
      _controller.value = 1;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(widget.status);
    return FadeTransition(
      opacity: Tween<double>(begin: .55, end: 1).animate(_controller),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .1),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(_statusLabel(widget.status),
            style: TextStyle(
                color: color, fontSize: 9, fontWeight: FontWeight.w800)),
      ),
    );
  }
}

class _EmptyAnalysis extends StatelessWidget {
  final VoidCallback? onCreate;
  const _EmptyAnalysis({required this.onCreate});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.document_scanner_outlined,
                size: 58, color: Color(0xFF94A3B8)),
            const SizedBox(height: 12),
            const Text('Belum ada analisis gambar',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 5),
            const Text('Ambil foto panel mesin untuk membaca parameter.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF64748B))),
            if (onCreate != null) ...[
              const SizedBox(height: 15),
              FilledButton.icon(
                  onPressed: onCreate,
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Baca Foto')),
            ],
          ]),
        ),
      );
}

class AiImageCapturePage extends StatefulWidget {
  const AiImageCapturePage({super.key});

  @override
  State<AiImageCapturePage> createState() => _AiImageCapturePageState();
}

class _AiImageCapturePageState extends State<AiImageCapturePage> {
  final _assetSearch = TextEditingController();
  Timer? _assetDebounce;
  List<Map<String, dynamic>> _assets = const [];
  Map<String, dynamic>? _asset;
  final List<XFile> _photos = [];
  final List<Uint8List> _previews = [];
  bool _searching = false;
  bool _submitting = false;

  @override
  void dispose() {
    _assetDebounce?.cancel();
    _assetSearch.dispose();
    super.dispose();
  }

  void _searchChanged(String value) {
    _assetDebounce?.cancel();
    if (value.trim().length < 2) {
      setState(() => _assets = const []);
      return;
    }
    _assetDebounce = Timer(const Duration(milliseconds: 450), _searchAsset);
  }

  Future<void> _searchAsset() async {
    if (_assetSearch.text.trim().length < 2) return;
    setState(() => _searching = true);
    try {
      final response = await ApiService().get('/v2/ai-image-analysis/assets',
          queryParameters: {'q': _assetSearch.text.trim()});
      if (mounted) setState(() => _assets = _responseList(response));
    } catch (error) {
      if (mounted) _showError(_errorMessage(error, 'Pencarian asset gagal.'));
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _pick(ImageSource source) async {
    final remaining = 8 - _photos.length;
    if (remaining <= 0) return;
    final picked = source == ImageSource.gallery
        ? await ImagePicker().pickMultiImage(
            imageQuality: 82, maxWidth: 1600, maxHeight: 1600, limit: remaining)
        : <XFile?>[
            await ImagePicker().pickImage(
                source: source,
                imageQuality: 82,
                maxWidth: 1600,
                maxHeight: 1600,
                preferredCameraDevice: CameraDevice.rear)
          ];
    final images = picked.whereType<XFile>().take(remaining).toList();
    if (images.isEmpty) return;
    final bytes = await Future.wait(images.map((image) => image.readAsBytes()));
    if (mounted) {
      setState(() {
        _photos.addAll(images);
        _previews.addAll(bytes);
      });
    }
  }

  void _showError(String message) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
      );

  Future<void> _submit() async {
    if (_asset == null || _photos.isEmpty) {
      _showError('Pilih asset dan ambil minimal satu foto.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final form = FormData.fromMap({
        'asset_id': '${_asset!['asset_id']}',
        'asset_code': '${_asset!['asset_code']}',
        'images': await Future.wait(_photos.map((photo) =>
            MultipartFile.fromFile(photo.path, filename: photo.name))),
      });
      final response = await ApiService().post('/v2/ai-image-analysis',
          data: form,
          options: Options(
            contentType: 'multipart/form-data',
            sendTimeout: const Duration(seconds: 30),
            receiveTimeout: const Duration(seconds: 30),
          ));
      final item = _responseMap(response);
      final id = int.tryParse('${item?['id'] ?? ''}');
      if (id == null) throw StateError('ID analisis tidak diterima.');
      if (mounted) Navigator.pop(context, id);
    } catch (error) {
      if (mounted) _showError(_errorMessage(error, 'Upload foto gagal.'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Analisis Foto Asset')),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(14, 8, 14, 12),
        child: FilledButton.icon(
          onPressed: _submitting ? null : _submit,
          icon: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.auto_awesome_rounded),
          label: Text(_submitting ? 'Mengunggah...' : 'Mulai Analisis'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const Text('Asset / Mesin',
              style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 7),
          if (_asset != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFBFDBFE)),
              ),
              child: Row(children: [
                const Icon(Icons.precision_manufacturing_outlined,
                    color: Color(0xFF2563EB)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${_asset!['asset_code']}',
                            style:
                                const TextStyle(fontWeight: FontWeight.w800)),
                        Text('${_asset!['asset_name']}',
                            style: const TextStyle(
                                fontSize: 12, color: Color(0xFF64748B))),
                      ]),
                ),
                TextButton(
                    onPressed: _submitting
                        ? null
                        : () => setState(() => _asset = null),
                    child: const Text('Ganti')),
              ]),
            )
          else ...[
            TextField(
              controller: _assetSearch,
              onChanged: _searchChanged,
              decoration: InputDecoration(
                hintText: 'Cari kode atau nama mesin...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searching
                    ? const Padding(
                        padding: EdgeInsets.all(14),
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : null,
              ),
            ),
            if (_assets.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 6),
                constraints: const BoxConstraints(maxHeight: 210),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: _assets.length,
                  separatorBuilder: (_, __) =>
                      const Divider(height: 1, indent: 12, endIndent: 12),
                  itemBuilder: (_, index) {
                    final item = _assets[index];
                    return ListTile(
                      dense: true,
                      title: Text(
                          '${item['asset_code']} · ${item['asset_name']}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                          '${item['company_name'] ?? '-'} · ${item['location_name'] ?? '-'}'),
                      onTap: () => setState(() {
                        _asset = item;
                        _assets = const [];
                      }),
                    );
                  },
                ),
              ),
          ],
          const SizedBox(height: 16),
          Row(children: [
            const Expanded(
                child: Text('Foto asset',
                    style: TextStyle(fontWeight: FontWeight.w800))),
            Text('${_photos.length}/8',
                style: const TextStyle(color: Color(0xFF64748B))),
          ]),
          const SizedBox(height: 8),
          if (_previews.isEmpty)
            Container(
                height: 110,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFCBD5E1))),
                child: const Text('Belum ada foto',
                    style: TextStyle(color: Color(0xFF64748B))))
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3, crossAxisSpacing: 7, mainAxisSpacing: 7),
              itemCount: _previews.length,
              itemBuilder: (_, index) => Stack(fit: StackFit.expand, children: [
                ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.memory(_previews[index],
                        fit: BoxFit.cover, gaplessPlayback: true)),
                Positioned(
                    right: 3,
                    top: 3,
                    child: IconButton.filled(
                        onPressed: _submitting
                            ? null
                            : () => setState(() {
                                  _photos.removeAt(index);
                                  _previews.removeAt(index);
                                }),
                        icon: const Icon(Icons.close, size: 15),
                        style: IconButton.styleFrom(
                            minimumSize: const Size(28, 28),
                            padding: EdgeInsets.zero))),
              ]),
            ),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: FilledButton.tonalIcon(
                onPressed: _submitting || _photos.length >= 8
                    ? null
                    : () => _pick(ImageSource.camera),
                icon: const Icon(Icons.camera_alt_outlined),
                label: const Text('Kamera'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _submitting || _photos.length >= 8
                    ? null
                    : () => _pick(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Galeri'),
              ),
            ),
          ]),
          const SizedBox(height: 12),
          const Text(
            'Tambahkan beberapa sudut atau layar dari asset yang sama. Proses berjalan di background sehingga aplikasi tetap ringan.',
            style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
          ),
        ],
      ),
    );
  }
}

class AiImageAnalysisDetailPage extends StatefulWidget {
  final int id;
  final bool canRetry;
  final bool canVerify;
  const AiImageAnalysisDetailPage({
    super.key,
    required this.id,
    required this.canRetry,
    required this.canVerify,
  });

  @override
  State<AiImageAnalysisDetailPage> createState() =>
      _AiImageAnalysisDetailPageState();
}

class _AiImageAnalysisDetailPageState extends State<AiImageAnalysisDetailPage> {
  Map<String, dynamic>? _item;
  bool _loading = true;
  bool _actionBusy = false;
  String? _exporting;
  Timer? _poller;

  bool get _active =>
      _activeStatuses.contains(_item?['status']?.toString() ?? '');

  @override
  void initState() {
    super.initState();
    _load();
    _poller = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_active) _load(silent: true);
    });
  }

  @override
  void dispose() {
    _poller?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    try {
      final response =
          await ApiService().get('/v2/ai-image-analysis/${widget.id}');
      final item = _responseMap(response);
      if (mounted && item != null) setState(() => _item = item);
    } catch (error) {
      if (mounted && !silent) _showError(_errorMessage(error));
    } finally {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  void _showError(String message) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
      );

  Future<void> _retry() async {
    setState(() => _actionBusy = true);
    try {
      await ApiService()
          .post('/v2/ai-image-analysis/${widget.id}/retry', data: {});
      await _load();
    } catch (error) {
      if (mounted) _showError(_errorMessage(error, 'Analisis ulang gagal.'));
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _verify() async {
    setState(() => _actionBusy = true);
    try {
      await ApiService().patch('/v2/ai-image-analysis/${widget.id}/verify',
          data: {'note': 'Hasil OCR diperiksa melalui aplikasi mobile.'});
      await _load();
    } catch (error) {
      if (mounted) _showError(_errorMessage(error, 'Verifikasi gagal.'));
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _export(String format) async {
    final item = _item;
    if (item == null) return;
    setState(() => _exporting = format);
    try {
      await exportAiImageAnalysis(
          widget.id, '${item['analysis_number'] ?? widget.id}', format);
    } catch (error) {
      if (mounted) _showError(_errorMessage(error, 'Export $format gagal.'));
    } finally {
      if (mounted) setState(() => _exporting = null);
    }
  }

  String _date(dynamic value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '');
    return parsed == null
        ? '-'
        : DateFormat('dd MMM yyyy, HH:mm').format(parsed);
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final status = item?['status']?.toString() ?? '';
    final values = item?['values'] is List
        ? List<dynamic>.from(item!['values'] as List)
        : <dynamic>[];
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(item?['analysis_number']?.toString() ?? 'Hasil Analisis'),
          actions: [
            IconButton(
                onPressed: _load, icon: const Icon(Icons.refresh_rounded))
          ],
        ),
        bottomNavigationBar: item == null
            ? null
            : SafeArea(
                minimum: const EdgeInsets.fromLTRB(14, 6, 14, 10),
                child: Row(children: [
                  if (const ['ANALYZED', 'VERIFIED'].contains(status)) ...[
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed:
                            _exporting == null ? () => _export('xlsx') : null,
                        icon: _exporting == 'xlsx'
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.table_view_outlined),
                        label: const Text('Excel'),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed:
                            _exporting == null ? () => _export('pdf') : null,
                        icon: _exporting == 'pdf'
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.picture_as_pdf_outlined),
                        label: const Text('PDF'),
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],
                  if (widget.canRetry &&
                      !const ['VERIFIED', 'ANALYZED', 'PROCESSING']
                          .contains(status))
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _actionBusy ? null : _retry,
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Analisa Ulang'),
                      ),
                    ),
                  if (widget.canVerify && status == 'ANALYZED')
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _actionBusy ? null : _verify,
                        icon: const Icon(Icons.verified_outlined),
                        label: const Text('Verifikasi Hasil'),
                      ),
                    ),
                ]),
              ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : item == null
                ? const Center(child: Text('Data tidak ditemukan.'))
                : Column(children: [
                    _CompactDetailHeader(
                      item: item,
                      status: status,
                      dateLabel: _date(item['created_at']),
                    ),
                    AnimatedSize(
                      duration: const Duration(milliseconds: 250),
                      child: _active
                          ? Padding(
                              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                              child: _LiveProcessingPanel(item: item),
                            )
                          : const SizedBox.shrink(),
                    ),
                    if ((item['error_message']?.toString() ?? '').isNotEmpty)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                        padding: const EdgeInsets.all(9),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF1F2),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFFECDD3)),
                        ),
                        child: Text(
                            'Kesalahan terakhir: ${item['error_message']}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 11, color: Color(0xFFBE123C))),
                      ),
                    Container(
                      color: Colors.white,
                      child: TabBar(
                        labelColor: Theme.of(context).colorScheme.primary,
                        unselectedLabelColor: const Color(0xFF64748B),
                        labelStyle: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w800),
                        tabs: [
                          const Tab(text: 'Ringkasan'),
                          Tab(text: 'Parameter (${values.length})'),
                          const Tab(text: 'Teks OCR'),
                        ],
                      ),
                    ),
                    Expanded(
                      child: TabBarView(children: [
                        _SummaryTab(item: item, onRefresh: _load),
                        _ParameterTab(values: values, onRefresh: _load),
                        _OcrTab(item: item, onRefresh: _load),
                      ]),
                    ),
                  ]),
      ),
    );
  }
}

class _CompactDetailHeader extends StatelessWidget {
  final Map<String, dynamic> item;
  final String status;
  final String dateLabel;
  const _CompactDetailHeader({
    required this.item,
    required this.status,
    required this.dateLabel,
  });

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(11),
            child: Image.network(
              ApiConstants.mediaUrl(item['image_url']?.toString()),
              width: 112,
              height: 96,
              cacheWidth: 360,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                width: 112,
                height: 96,
                color: const Color(0xFFF1F5F9),
                child: const Icon(Icons.broken_image_outlined),
              ),
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: Text('${item['asset_code'] ?? '-'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF2563EB))),
                ),
                _LiveStatusBadge(status: status),
              ]),
              const SizedBox(height: 3),
              Text('${item['asset_name'] ?? '-'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
              const SizedBox(height: 6),
              Text('${item['activity_name'] ?? '-'}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(dateLabel,
                  style:
                      const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
            ]),
          ),
        ]),
      );
}

class _SummaryTab extends StatelessWidget {
  final Map<String, dynamic> item;
  final Future<void> Function({bool silent}) onRefresh;
  const _SummaryTab({required this.item, required this.onRefresh});

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: () => onRefresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(12),
          children: [
            _Section(
              title: 'Analisis',
              child: Text(item['analysis_summary']?.toString() ?? '-',
                  style: const TextStyle(height: 1.4)),
            ),
            const SizedBox(height: 9),
            _Section(
              title: 'Informasi proses',
              child: Wrap(spacing: 16, runSpacing: 7, children: [
                _InfoChip(
                    label: 'Percobaan', value: '${item['retry_count'] ?? 0}'),
                _InfoChip(
                    label: 'Dibuat oleh',
                    value: '${item['created_by'] ?? '-'}'),
              ]),
            ),
            const SizedBox(height: 9),
            _RecommendationSection(
              title: 'Rekomendasi produk',
              items: item['suggested_products'] is List
                  ? List<dynamic>.from(item['suggested_products'])
                  : const [],
            ),
            const SizedBox(height: 9),
            _RecommendationSection(
              title: 'Bahan baku / consumable',
              items: item['required_materials'] is List
                  ? List<dynamic>.from(item['required_materials'])
                  : const [],
            ),
            if ((item['reference_note']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 9),
              _Section(
                title: 'Acuan / batas normal',
                child: Text(item['reference_note'].toString()),
              ),
            ],
          ],
        ),
      );
}

class _InfoChip extends StatelessWidget {
  final String label;
  final String value;
  const _InfoChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(fontSize: 9, color: Color(0xFF94A3B8))),
          Text(value,
              style:
                  const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        ],
      );
}

class _RecommendationSection extends StatelessWidget {
  final String title;
  final List<dynamic> items;
  const _RecommendationSection({required this.title, required this.items});

  @override
  Widget build(BuildContext context) => _Section(
        title: title,
        child: items.isEmpty
            ? const Text(
                'Belum ada rekomendasi terstruktur. Analisa ulang untuk mengisinya.',
                style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)))
            : Column(
                children: items.map((raw) {
                  final row = Map<String, dynamic>.from(raw as Map);
                  return Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 7),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(9)),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Expanded(
                                child: Text('${row['item_name'] ?? '-'}',
                                    style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w800))),
                            Text('${row['priority'] ?? 'MEDIUM'}',
                                style: const TextStyle(
                                    fontSize: 9, color: Color(0xFF64748B))),
                          ]),
                          if ('${row['specification'] ?? ''}'.isNotEmpty)
                            Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text('${row['specification']}',
                                    style: const TextStyle(fontSize: 11))),
                          Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text(
                                  'Perkiraan: ${row['estimated_quantity'] ?? '-'} ${row['unit'] ?? ''}',
                                  style: const TextStyle(
                                      fontSize: 10, color: Color(0xFF2563EB)))),
                          if ('${row['reason'] ?? ''}'.isNotEmpty)
                            Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text('${row['reason']}',
                                    style: const TextStyle(
                                        fontSize: 10,
                                        color: Color(0xFF64748B)))),
                        ]),
                  );
                }).toList(),
              ),
      );
}

class _ParameterTab extends StatelessWidget {
  final List<dynamic> values;
  final Future<void> Function({bool silent}) onRefresh;
  const _ParameterTab({required this.values, required this.onRefresh});

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: () => onRefresh(),
        child: values.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('Belum ada parameter terbaca.')),
                ],
              )
            : ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 20),
                itemCount: values.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, index) => _ParameterCard(
                    row: Map<String, dynamic>.from(values[index] as Map)),
              ),
      );
}

class _OcrTab extends StatelessWidget {
  final Map<String, dynamic> item;
  final Future<void> Function({bool silent}) onRefresh;
  const _OcrTab({required this.item, required this.onRefresh});

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: () => onRefresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(12),
          children: [
            _Section(
              title: 'Teks terbaca',
              child: SelectableText(item['raw_text']?.toString() ?? '-',
                  style: const TextStyle(
                      fontFamily: 'monospace', fontSize: 12, height: 1.4)),
            ),
          ],
        ),
      );
}

class _LiveProcessingPanel extends StatelessWidget {
  final Map<String, dynamic> item;
  const _LiveProcessingPanel({required this.item});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFEFF6FF),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFBFDBFE)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.auto_awesome, size: 18, color: Color(0xFF2563EB)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _statusLabel(item['status']?.toString() ?? ''),
                style: const TextStyle(
                    color: Color(0xFF1E40AF), fontWeight: FontWeight.w800),
              ),
            ),
            Text('Percobaan ${item['retry_count'] ?? 0}',
                style: const TextStyle(fontSize: 11, color: Color(0xFF1E40AF))),
          ]),
          const SizedBox(height: 10),
          const ClipRRect(
            borderRadius: BorderRadius.all(Radius.circular(20)),
            child: LinearProgressIndicator(minHeight: 5),
          ),
          const SizedBox(height: 7),
          const Text(
              'Boleh tinggalkan halaman ini; proses tetap berjalan di server.',
              style: TextStyle(fontSize: 11, color: Color(0xFF1E40AF))),
        ]),
      );
}

class _Section extends StatelessWidget {
  final String title;
  final Widget child;
  const _Section({required this.title, required this.child});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (title.isNotEmpty) ...[
            Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 7),
          ],
          child,
        ]),
      );
}

class _ParameterCard extends StatelessWidget {
  final Map<String, dynamic> row;
  const _ParameterCard({required this.row});

  @override
  Widget build(BuildContext context) {
    final assessment = row['assessment']?.toString() ?? 'UNASSESSED';
    final color = assessment == 'CRITICAL'
        ? const Color(0xFFBE123C)
        : assessment == 'WARNING'
            ? const Color(0xFFB45309)
            : assessment == 'NORMAL'
                ? const Color(0xFF047857)
                : const Color(0xFF64748B);
    final confidence = double.tryParse('${row['confidence'] ?? ''}');
    return ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
      childrenPadding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
      dense: true,
      visualDensity: const VisualDensity(horizontal: -2, vertical: -3),
      leading: Container(
        width: 8,
        height: 34,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(8),
        ),
      ),
      title: Text(row['parameter_name']?.toString() ?? '-',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
      subtitle: Text(row['section_name']?.toString() ?? '-',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 9, color: Color(0xFF94A3B8))),
      trailing: SizedBox(
        width: 112,
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('${row['text_value'] ?? '-'} ${row['unit'] ?? ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style:
                  const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          Text(assessment,
              maxLines: 1,
              textAlign: TextAlign.right,
              style: TextStyle(
                  fontSize: 8, fontWeight: FontWeight.w800, color: color)),
        ]),
      ),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            '${confidence == null ? 'Confidence -' : 'Confidence ${(confidence * 100).round()}%'}${(row['assessment_note']?.toString() ?? '').isEmpty ? '' : '\n${row['assessment_note']}'}',
            style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)),
          ),
        ),
      ],
    );
  }
}
