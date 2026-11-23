import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/services/permission_service.dart';
import '../../../data/providers/api_service.dart';
import '../../ai_image_analysis/utils/ai_image_analysis_export.dart';

class TabletAiImageAnalysisPage extends StatefulWidget {
  const TabletAiImageAnalysisPage({super.key});

  @override
  State<TabletAiImageAnalysisPage> createState() =>
      _TabletAiImageAnalysisPageState();
}

class _TabletAiImageAnalysisPageState extends State<TabletAiImageAnalysisPage> {
  bool _loading = true;
  String _search = '';
  List<Map<String, dynamic>> _rows = const [];
  Timer? _poller;
  bool _canCreate = false;
  bool _canRetry = false;
  bool _canVerify = false;

  @override
  void initState() {
    super.initState();
    _loadActionPermissions();
    _load();
    _poller = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_rows.any((row) => const ['QUEUED', 'PROCESSING', 'RETRY_WAIT']
          .contains(row['status']?.toString()))) {
        _load(silent: true);
      }
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
    super.dispose();
  }

  List<Map<String, dynamic>> _list(dynamic response) {
    final body = response.data;
    final data = body is Map ? body['data'] : null;
    return data is List
        ? data
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
        : [];
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final response = await ApiService().get('/v2/ai-image-analysis',
          queryParameters: {'q': _search, 'per_page': 100});
      if (mounted) setState(() => _rows = _list(response));
    } on DioException catch (error) {
      if (mounted) {
        _snack(
            (error.response?.data as Map?)?['message']?.toString() ??
                'Gagal memuat pembacaan gambar.',
            error: true);
      }
    } finally {
      if (mounted && !silent) setState(() => _loading = false);
    }
  }

  void _snack(String message, {bool error = false}) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(message),
          backgroundColor:
              error ? Colors.red.shade700 : Colors.green.shade700));

  Future<void> _create() async {
    final created = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (_) => const _AiImageUploadDialog());
    if (created == true) {
      _snack('Foto masuk antrean. Analisis berjalan di background.');
      await _load();
    }
  }

  Future<void> _detail(int id) async {
    showDialog<void>(
        context: context,
        builder: (_) => _AiImageDetailDialog(
              id: id,
              onVerified: _load,
              canRetry: _canRetry,
              canVerify: _canVerify,
            ));
  }

  Color _statusColor(String status) => status == 'VERIFIED'
      ? const Color(0xFF047857)
      : status == 'ANALYZED'
          ? const Color(0xFF1D4ED8)
          : status == 'FAILED'
              ? const Color(0xFFBE123C)
              : const Color(0xFFB45309);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Pembacaan Gambar AI',
                    style:
                        TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                SizedBox(height: 3),
                Text(
                    'Foto panel/HMI menjadi teks, parameter, temuan, dan rekomendasi teknis.',
                    style: TextStyle(color: Color(0xFF64748B)))
              ])),
          if (_canCreate)
            FilledButton.icon(
                onPressed: _create,
                icon: const Icon(Icons.camera_alt_outlined),
                label: const Text('Baca Foto')),
        ]),
        const SizedBox(height: 18),
        TextField(
            decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: 'Cari mesin, kalibrasi, atau teks OCR...',
                suffixIcon: IconButton(
                    icon: const Icon(Icons.refresh), onPressed: _load),
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                filled: true,
                fillColor: Colors.white),
            onChanged: (value) => _search = value,
            onSubmitted: (_) => _load()),
        const SizedBox(height: 14),
        Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _rows.isEmpty
                    ? const Center(
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.document_scanner_outlined,
                            size: 48, color: Color(0xFF94A3B8)),
                        SizedBox(height: 10),
                        Text('Belum ada pembacaan gambar.',
                            style: TextStyle(color: Color(0xFF64748B)))
                      ]))
                    : GridView.builder(
                        gridDelegate:
                            const SliverGridDelegateWithMaxCrossAxisExtent(
                                maxCrossAxisExtent: 520,
                                mainAxisExtent: 150,
                                crossAxisSpacing: 12,
                                mainAxisSpacing: 12),
                        itemCount: _rows.length,
                        itemBuilder: (_, index) {
                          final row = _rows[index];
                          final status = row['status']?.toString() ?? '';
                          return InkWell(
                              onTap: () =>
                                  _detail(int.tryParse('${row['id']}') ?? 0),
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                  decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                          color: const Color(0xFFE2E8F0))),
                                  padding: const EdgeInsets.all(12),
                                  child: Row(children: [
                                    ClipRRect(
                                        borderRadius: BorderRadius.circular(9),
                                        child: Image.network(
                                            ApiConstants.mediaUrl(
                                                row['image_url']?.toString()),
                                            width: 130,
                                            height: 124,
                                            fit: BoxFit.cover,
                                            errorBuilder: (_, __, ___) =>
                                                const SizedBox(
                                                    width: 130,
                                                    child: Icon(Icons
                                                        .broken_image_outlined)))),
                                    const SizedBox(width: 12),
                                    Expanded(
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                          Row(children: [
                                            Expanded(
                                                child: Text(
                                                    row['activity_name']
                                                            ?.toString() ??
                                                        '-',
                                                    maxLines: 1,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                        fontWeight:
                                                            FontWeight.w700))),
                                            Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 7,
                                                        vertical: 3),
                                                decoration: BoxDecoration(
                                                    color: _statusColor(status)
                                                        .withValues(alpha: .1),
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                            20)),
                                                child: Text(status,
                                                    style: TextStyle(
                                                        fontSize: 10,
                                                        fontWeight:
                                                            FontWeight.w700,
                                                        color: _statusColor(
                                                            status))))
                                          ]),
                                          const SizedBox(height: 6),
                                          Text(
                                              row['asset_code']?.toString() ??
                                                  '-',
                                              style: const TextStyle(
                                                  color: Color(0xFF2563EB),
                                                  fontWeight: FontWeight.w600)),
                                          Text(
                                              row['asset_name']?.toString() ??
                                                  '-',
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                  fontSize: 12,
                                                  color: Color(0xFF64748B))),
                                          const SizedBox(height: 7),
                                          Text(
                                              row['analysis_summary']
                                                      ?.toString() ??
                                                  row['error_message']
                                                      ?.toString() ??
                                                  'Sedang diproses...',
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                  fontSize: 12,
                                                  color: Color(0xFF475569)))
                                        ]))
                                  ])));
                        })),
      ]),
    );
  }
}

class _AiImageUploadDialog extends StatefulWidget {
  const _AiImageUploadDialog();
  @override
  State<_AiImageUploadDialog> createState() => _AiImageUploadDialogState();
}

class _AiImageUploadDialogState extends State<_AiImageUploadDialog> {
  final _assetSearch = TextEditingController();
  List<Map<String, dynamic>> _assets = const [];
  Map<String, dynamic>? _asset;
  final List<XFile> _photos = [];
  bool _busy = false;

  @override
  void dispose() {
    _assetSearch.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _list(dynamic response) {
    final body = response.data;
    final data = body is Map ? body['data'] : null;
    return data is List
        ? data
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList()
        : [];
  }

  String _error(Object error) =>
      error is DioException && error.response?.data is Map
          ? (error.response!.data as Map)['message']?.toString() ??
              'Permintaan gagal.'
          : 'Tidak dapat terhubung ke server.';

  Future<void> _search() async {
    if (_assetSearch.text.trim().length < 2) return;
    setState(() => _busy = true);
    try {
      _assets = _list(await ApiService().get('/v2/ai-image-analysis/assets',
          queryParameters: {'q': _assetSearch.text.trim()}));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(_error(error))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pick(ImageSource source) async {
    final remaining = 8 - _photos.length;
    if (remaining <= 0) return;
    final images = source == ImageSource.gallery
        ? await ImagePicker()
            .pickMultiImage(imageQuality: 88, maxWidth: 2000, limit: remaining)
        : <XFile?>[
            await ImagePicker()
                .pickImage(source: source, imageQuality: 88, maxWidth: 2000)
          ];
    if (mounted) {
      setState(() => _photos.addAll(images.whereType<XFile>().take(remaining)));
    }
  }

  Future<void> _submit() async {
    if (_asset == null || _photos.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Pilih asset dan ambil minimal satu foto.')));
      return;
    }
    setState(() => _busy = true);
    try {
      final data = FormData.fromMap({
        'asset_id': '${_asset!['asset_id']}',
        'asset_code': '${_asset!['asset_code']}',
        'images': await Future.wait(_photos.map((photo) =>
            MultipartFile.fromFile(photo.path, filename: photo.name)))
      });
      await ApiService().post('/v2/ai-image-analysis',
          data: data,
          options: Options(
              contentType: 'multipart/form-data',
              receiveTimeout: const Duration(seconds: 30),
              sendTimeout: const Duration(seconds: 30)));
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(_error(error)),
            backgroundColor: Colors.red.shade700));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: const Text('Analisis Foto Asset'),
          content: SizedBox(
              width: 760,
              child: SingleChildScrollView(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text('Asset / Mesin',
                        style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    if (_asset != null)
                      ListTile(
                          tileColor: const Color(0xFFEFF6FF),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8)),
                          title: Text('${_asset!['asset_code']}',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text('${_asset!['asset_name']}'),
                          trailing: TextButton(
                              onPressed: _busy
                                  ? null
                                  : () => setState(() => _asset = null),
                              child: const Text('Ganti')))
                    else ...[
                      Row(children: [
                        Expanded(
                            child: TextField(
                                controller: _assetSearch,
                                onSubmitted: (_) => _search(),
                                decoration: const InputDecoration(
                                    hintText: 'Cari kode atau nama mesin...',
                                    border: OutlineInputBorder()))),
                        const SizedBox(width: 8),
                        IconButton.filledTonal(
                            onPressed: _busy ? null : _search,
                            icon: const Icon(Icons.search))
                      ]),
                      if (_assets.isNotEmpty)
                        Container(
                            margin: const EdgeInsets.only(top: 6),
                            constraints: const BoxConstraints(maxHeight: 180),
                            decoration: BoxDecoration(
                                border:
                                    Border.all(color: const Color(0xFFE2E8F0)),
                                borderRadius: BorderRadius.circular(8)),
                            child: ListView(
                                shrinkWrap: true,
                                children: _assets
                                    .map((item) => ListTile(
                                        dense: true,
                                        title: Text(
                                            '${item['asset_code']} · ${item['asset_name']}'),
                                        subtitle: Text(
                                            '${item['company_name']} · ${item['location_name']}'),
                                        onTap: () => setState(() {
                                              _asset = item;
                                              _assets = [];
                                            })))
                                    .toList()))
                    ],
                    const SizedBox(height: 14),
                    Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                            borderRadius: BorderRadius.circular(10)),
                        child: Column(children: [
                          Icon(
                              _photos.isEmpty
                                  ? Icons.image_outlined
                                  : Icons.check_circle_outline,
                              size: 38,
                              color: _photos.isEmpty
                                  ? const Color(0xFF64748B)
                                  : const Color(0xFF059669)),
                          const SizedBox(height: 6),
                          Text(
                              _photos.isEmpty
                                  ? 'Belum ada foto'
                                  : '${_photos.length} dari 8 foto dipilih',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis),
                          if (_photos.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: List.generate(
                                    _photos.length,
                                    (index) => InputChip(
                                        label: Text('Foto ${index + 1}'),
                                        onDeleted: _busy
                                            ? null
                                            : () => setState(() =>
                                                _photos.removeAt(index))))),
                          ],
                          const SizedBox(height: 10),
                          Wrap(spacing: 10, children: [
                            OutlinedButton.icon(
                                onPressed: _busy || _photos.length >= 8
                                    ? null
                                    : () => _pick(ImageSource.camera),
                                icon: const Icon(Icons.camera_alt_outlined),
                                label: const Text('Kamera')),
                            OutlinedButton.icon(
                                onPressed: _busy || _photos.length >= 8
                                    ? null
                                    : () => _pick(ImageSource.gallery),
                                icon: const Icon(Icons.photo_library_outlined),
                                label: const Text('Galeri'))
                          ])
                        ]))
                  ]))),
          actions: [
            TextButton(
                onPressed: _busy ? null : () => Navigator.pop(context),
                child: const Text('Batal')),
            FilledButton.icon(
                onPressed: _busy ? null : _submit,
                icon: _busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.auto_awesome),
                label: Text(_busy ? 'Mengunggah...' : 'Analisis di Background'))
          ]);
}

class _AiImageDetailDialog extends StatefulWidget {
  final int id;
  final Future<void> Function() onVerified;
  final bool canRetry;
  final bool canVerify;
  const _AiImageDetailDialog({
    required this.id,
    required this.onVerified,
    required this.canRetry,
    required this.canVerify,
  });
  @override
  State<_AiImageDetailDialog> createState() => _AiImageDetailDialogState();
}

class _AiImageDetailDialogState extends State<_AiImageDetailDialog> {
  Map<String, dynamic>? _item;
  bool _loading = true;
  bool _verifying = false;
  bool _retrying = false;
  String? _exporting;
  Timer? _poller;
  @override
  void initState() {
    super.initState();
    _load();
    _poller = Timer.periodic(const Duration(seconds: 5), (_) {
      if (const ['QUEUED', 'PROCESSING', 'RETRY_WAIT']
          .contains(_item?['status']?.toString())) {
        _load(silent: true);
      }
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
      final body = response.data;
      if (body is Map && body['data'] is Map && mounted) {
        setState(() => _item = Map<String, dynamic>.from(body['data'] as Map));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _retry() async {
    setState(() => _retrying = true);
    try {
      await ApiService()
          .post('/v2/ai-image-analysis/${widget.id}/retry', data: {});
      await _load();
      await widget.onVerified();
    } on DioException catch (error) {
      if (mounted) {
        final body = error.response?.data;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(body is Map
                ? body['message']?.toString() ?? 'Analisis ulang gagal.'
                : 'Analisis ulang gagal.'),
            backgroundColor: Colors.red.shade700));
      }
    } finally {
      if (mounted) setState(() => _retrying = false);
    }
  }

  Future<void> _verify() async {
    setState(() => _verifying = true);
    try {
      await ApiService().patch('/v2/ai-image-analysis/${widget.id}/verify',
          data: {'note': 'Hasil OCR dan parameter telah diperiksa.'});
      await _load();
      await widget.onVerified();
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  Future<void> _export(String format) async {
    final item = _item;
    if (item == null) return;
    setState(() => _exporting = format);
    try {
      await exportAiImageAnalysis(
          widget.id, '${item['analysis_number'] ?? widget.id}', format);
    } on DioException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              (error.response?.data as Map?)?['message']?.toString() ??
                  'Export gagal.'),
          backgroundColor: Colors.red.shade700,
        ));
      }
    } finally {
      if (mounted) setState(() => _exporting = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final values = _item?['values'] is List
        ? List<dynamic>.from(_item!['values'])
        : <dynamic>[];
    final title = _item == null
        ? 'Detail Pembacaan'
        : _item!['analysis_number']?.toString() ?? 'Detail Pembacaan';
    return AlertDialog(
        title: Text(title),
        content: SizedBox(
            width: 900,
            height: 620,
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _item == null
                    ? const Center(child: Text('Data tidak ditemukan.'))
                    : SingleChildScrollView(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                            Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Image.network(
                                      ApiConstants.mediaUrl(
                                          _item!['image_url']?.toString()),
                                      width: 300,
                                      height: 220,
                                      fit: BoxFit.contain,
                                      errorBuilder: (_, __, ___) =>
                                          const SizedBox(
                                              width: 300,
                                              height: 220,
                                              child: Icon(Icons
                                                  .broken_image_outlined))),
                                  const SizedBox(width: 18),
                                  Expanded(
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                        Text(
                                            '${_item!['asset_code']} · ${_item!['asset_name']}',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w700)),
                                        const SizedBox(height: 4),
                                        Text(
                                            'Dibuat oleh ${_item!['created_by'] ?? '-'}',
                                            style: const TextStyle(
                                                fontSize: 12,
                                                color: Color(0xFF64748B))),
                                        const SizedBox(height: 8),
                                        Text(_item!['analysis_summary']
                                                ?.toString() ??
                                            (const [
                                              'QUEUED',
                                              'PROCESSING',
                                              'RETRY_WAIT'
                                            ].contains(_item!['status']
                                                    ?.toString())
                                                ? 'Analisis berjalan di background. Percobaan ${_item!['retry_count'] ?? 0}; layar ini diperbarui otomatis.'
                                                : '-')),
                                        if ((_item!['error_message']
                                                    ?.toString() ??
                                                '')
                                            .isNotEmpty) ...[
                                          const SizedBox(height: 8),
                                          Container(
                                              padding: const EdgeInsets.all(9),
                                              decoration: BoxDecoration(
                                                  color:
                                                      const Color(0xFFFFF1F2),
                                                  borderRadius:
                                                      BorderRadius.circular(8)),
                                              child: Text(
                                                  'Kesalahan terakhir: ${_item!['error_message']}',
                                                  style: const TextStyle(
                                                      color: Color(0xFFBE123C),
                                                      fontSize: 12)))
                                        ],
                                        const SizedBox(height: 12),
                                        const Text('Teks terbaca',
                                            style: TextStyle(
                                                fontWeight: FontWeight.w600)),
                                        Container(
                                            margin:
                                                const EdgeInsets.only(top: 5),
                                            padding: const EdgeInsets.all(10),
                                            constraints: const BoxConstraints(
                                                maxHeight: 120),
                                            decoration: BoxDecoration(
                                                color: const Color(0xFFF8FAFC),
                                                borderRadius:
                                                    BorderRadius.circular(8)),
                                            child: SingleChildScrollView(
                                                child: Text(
                                                    _item!['raw_text']
                                                            ?.toString() ??
                                                        '-',
                                                    style: const TextStyle(
                                                        fontSize: 12))))
                                      ]))
                                ]),
                            const SizedBox(height: 16),
                            const Text('Parameter hasil pembacaan',
                                style: TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: DataTable(
                                    columns: const [
                                      DataColumn(label: Text('Bagian')),
                                      DataColumn(label: Text('Parameter')),
                                      DataColumn(label: Text('Nilai')),
                                      DataColumn(label: Text('Confidence')),
                                      DataColumn(label: Text('Penilaian'))
                                    ],
                                    rows: values.map((raw) {
                                      final row = raw as Map;
                                      return DataRow(cells: [
                                        DataCell(Text(
                                            '${row['section_name'] ?? '-'}')),
                                        DataCell(Text(
                                            '${row['parameter_name'] ?? '-'}')),
                                        DataCell(Text(
                                            '${row['text_value'] ?? '-'} ${row['unit'] ?? ''}')),
                                        DataCell(Text(row['confidence'] == null
                                            ? '-'
                                            : '${((double.tryParse('${row['confidence']}') ?? 0) * 100).round()}%')),
                                        DataCell(
                                            Text('${row['assessment'] ?? '-'}'))
                                      ]);
                                    }).toList())),
                            const SizedBox(height: 16),
                            _TabletRecommendationGrid(item: _item!),
                          ]))),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Tutup')),
          if (_item != null &&
              const ['ANALYZED', 'VERIFIED']
                  .contains(_item!['status']?.toString())) ...[
            OutlinedButton.icon(
                onPressed: _exporting == null ? () => _export('xlsx') : null,
                icon: const Icon(Icons.table_view_outlined),
                label: Text(_exporting == 'xlsx' ? 'Membuat...' : 'Excel')),
            OutlinedButton.icon(
                onPressed: _exporting == null ? () => _export('pdf') : null,
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: Text(_exporting == 'pdf' ? 'Membuat...' : 'PDF')),
          ],
          if (widget.canRetry &&
              _item != null &&
              !const ['VERIFIED', 'ANALYZED', 'PROCESSING']
                  .contains(_item!['status']?.toString()))
            OutlinedButton.icon(
                onPressed: _retrying ? null : _retry,
                icon: _retrying
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.refresh),
                label: const Text('Analisa Ulang')),
          if (widget.canVerify && _item?['status'] == 'ANALYZED')
            FilledButton.icon(
                onPressed: _verifying ? null : _verify,
                icon: const Icon(Icons.verified_outlined),
                label: Text(_verifying ? 'Menyimpan...' : 'Verifikasi Hasil'))
        ]);
  }
}

class _TabletRecommendationGrid extends StatelessWidget {
  final Map<String, dynamic> item;
  const _TabletRecommendationGrid({required this.item});

  @override
  Widget build(BuildContext context) =>
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
            child: _items('Rekomendasi produk', item['suggested_products'])),
        const SizedBox(width: 12),
        Expanded(
            child:
                _items('Bahan baku / consumable', item['required_materials'])),
      ]);

  Widget _items(String title, dynamic rawItems) {
    final items = rawItems is List ? rawItems : const [];
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE2E8F0))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (items.isEmpty)
          const Text(
              'Belum ada rekomendasi terstruktur. Analisa ulang untuk mengisinya.',
              style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)))
        else
          ...items.map((raw) {
            final row = raw as Map;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        '${row['item_name'] ?? '-'} · ${row['priority'] ?? 'MEDIUM'}',
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700)),
                    Text('${row['specification'] ?? '-'}',
                        style: const TextStyle(
                            fontSize: 11, color: Color(0xFF475569))),
                    Text(
                        'Perkiraan ${row['estimated_quantity'] ?? '-'} ${row['unit'] ?? ''}',
                        style: const TextStyle(
                            fontSize: 11, color: Color(0xFF2563EB))),
                  ]),
            );
          }),
      ]),
    );
  }
}
