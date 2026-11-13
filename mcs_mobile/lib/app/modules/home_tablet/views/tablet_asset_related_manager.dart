import 'dart:io';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/utils/api_error_helper.dart';
import '../../../data/providers/api_service.dart';

const _ink = Color(0xFF0F172A);
const _muted = Color(0xFF64748B);
const _line = Color(0xFFE2E8F0);

class TabletAssetRelatedManager extends StatefulWidget {
  final String assetCode;
  final List<Map<String, dynamic>> children;
  final List<Map<String, dynamic>> groups;
  final bool canWrite;
  final ValueChanged<String> onOpenAsset;
  final Future<void> Function() onChanged;

  const TabletAssetRelatedManager({
    super.key,
    required this.assetCode,
    required this.children,
    required this.groups,
    required this.canWrite,
    required this.onOpenAsset,
    required this.onChanged,
  });

  @override
  State<TabletAssetRelatedManager> createState() =>
      _TabletAssetRelatedManagerState();
}

class _TabletAssetRelatedManagerState extends State<TabletAssetRelatedManager> {
  bool _busy = false;

  String _text(dynamic value, [String fallback = '-']) {
    final result = value?.toString().trim() ?? '';
    return result.isEmpty ? fallback : result;
  }

  int _number(dynamic value) => int.tryParse('${value ?? 0}') ?? 0;

  void _message(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor:
          error ? const Color(0xFFBE123C) : const Color(0xFF166534),
    ));
  }

  Future<void> _run(Future<void> Function() task, String success) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await task();
      await widget.onChanged();
      _message(success);
    } catch (error) {
      _message(ApiErrorHelper.toUserMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final groupedIds = <int>{};
    for (final group in widget.groups) {
      for (final item in _maps(group['items'])) {
        final id = _number(item['linked_asset_id']);
        if (id > 0) groupedIds.add(id);
      }
    }
    final standalone = widget.children
        .where((row) => !groupedIds.contains(_number(row['AssetID'])))
        .toList();

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Aset Terkait',
                style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w800, color: _ink)),
            SizedBox(height: 3),
            Text(
                'Kelola komponen, Asset Code / QR, foto, dan relasi aset seperti pada web.',
                style: TextStyle(fontSize: 11.5, color: _muted)),
          ]),
        ),
        if (widget.canWrite)
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton.icon(
                onPressed: _busy ? null : _importExcel,
                icon: const Icon(Icons.upload_file, size: 17),
                label: const Text('Import Excel')),
            OutlinedButton.icon(
                onPressed: _busy ? null : _addManual,
                icon: const Icon(Icons.add, size: 17),
                label: const Text('Tambah Manual')),
            FilledButton.icon(
                onPressed: _busy ? null : _attachExisting,
                icon: const Icon(Icons.link, size: 17),
                label: const Text('Tautkan Aset Existing')),
          ]),
      ]),
      const SizedBox(height: 14),
      if (widget.groups.isEmpty && standalone.isEmpty)
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 42),
          decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _line)),
          child: const Column(children: [
            Icon(Icons.hub_outlined, size: 38, color: Color(0xFFCBD5E1)),
            SizedBox(height: 10),
            Text('Belum ada aset terkait', style: TextStyle(color: _muted))
          ]),
        )
      else
        Container(
          decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _line)),
          clipBehavior: Clip.antiAlias,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: 1230,
              child: Column(children: [
                _header(),
                for (final group in widget.groups) ...[
                  _groupHeader(_text(group['child_name'], 'Tanpa kategori')),
                  for (final item in _maps(group['items']))
                    _row(item, nested: true),
                ],
                for (final item in standalone) _row(item),
              ]),
            ),
          ),
        ),
    ]);
  }

  Widget _header() => Container(
        color: const Color(0xFFF8FAFC),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: const Row(children: [
          Expanded(flex: 4, child: _Header('ASET / KOMPONEN')),
          Expanded(flex: 2, child: _Header('KATEGORI / FREKUENSI')),
          Expanded(flex: 2, child: _Header('LOKASI / PIC')),
          SizedBox(width: 90, child: _Header('FOTO 1')),
          SizedBox(width: 90, child: _Header('FOTO 2')),
          SizedBox(width: 105, child: _Header('STATUS')),
          SizedBox(width: 220, child: _Header('AKSI')),
        ]),
      );

  Widget _groupHeader(String title) => Container(
        width: double.infinity,
        color: const Color(0xFFF1F5F9),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Text(title,
            style: const TextStyle(
                fontSize: 12.5, fontWeight: FontWeight.w700, color: _ink)),
      );

  Widget _row(Map<String, dynamic> item, {bool nested = false}) {
    final code = _text(item['AssetCode'] ?? item['asset_code'], '');
    final linked = code.isNotEmpty;
    final name =
        _text(item['item_name'] ?? item['AssetName'] ?? item['asset_name']);
    final id = _number(item['id']);
    final active = '${item['active']}'.toLowerCase() == 'active';
    return Container(
      color: linked ? Colors.white : const Color(0xFFFFFBEB),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      child: Row(children: [
        Expanded(
          flex: 4,
          child: Padding(
            padding: EdgeInsets.only(left: nested ? 18 : 0),
            child: InkWell(
              onTap: linked ? () => widget.onOpenAsset(code) : null,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: linked ? const Color(0xFF1D4ED8) : _ink)),
                    Text(linked ? code : 'Asset Code / QR belum diisi',
                        style: TextStyle(
                            fontSize: 10.5,
                            color: linked
                                ? const Color(0xFF94A3B8)
                                : const Color(0xFFD97706))),
                  ]),
            ),
          ),
        ),
        Expanded(
            flex: 2,
            child: _cell(_text(item['CategoryAsset'] ?? item['frequency']))),
        Expanded(
            flex: 2,
            child: _cell(nested
                ? _text(item['pic'], _text(item['LocationAsset']))
                : _text(item['LocationAsset'], _text(item['pic'])))),
        SizedBox(width: 90, child: _photoCell(item, id, 1)),
        SizedBox(width: 90, child: _photoCell(item, id, 2)),
        SizedBox(
            width: 105,
            child:
                Text(linked ? (active ? 'Aktif' : 'Nonaktif') : 'Belum tertaut',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: linked && active
                            ? const Color(0xFF15803D)
                            : linked
                                ? _muted
                                : const Color(0xFFD97706)))),
        SizedBox(
            width: 220,
            child: widget.canWrite
                ? _actions(item, name, code, linked, id)
                : const Text('-',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: _muted))),
      ]),
    );
  }

  Widget _cell(String text) => Text(text,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 11.5, color: _muted));

  Widget _photoCell(Map<String, dynamic> item, int id, int slot) {
    final raw = _text(item['photo_${slot}_url'], '');
    final url = raw.isEmpty ? '' : ApiConstants.mediaUrl(raw);
    if (url.isNotEmpty) {
      return Row(children: [
        InkWell(
            onTap: () => _showPhoto(url),
            child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: Image.network(url,
                    width: 38,
                    height: 38,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        const Icon(Icons.broken_image_outlined)))),
        if (widget.canWrite && id > 0)
          PopupMenuButton<String>(
              padding: EdgeInsets.zero,
              iconSize: 18,
              onSelected: (value) => value == 'change'
                  ? _pickPhoto(id, slot)
                  : _deletePhoto(id, slot),
              itemBuilder: (_) => const [
                    PopupMenuItem(value: 'change', child: Text('Ganti')),
                    PopupMenuItem(value: 'delete', child: Text('Hapus'))
                  ]),
      ]);
    }
    if (!widget.canWrite || id <= 0) {
      return const Text('-', textAlign: TextAlign.center);
    }
    return IconButton.outlined(
        tooltip: 'Tambah Foto $slot',
        onPressed: _busy ? null : () => _pickPhoto(id, slot),
        icon: const Icon(Icons.add_a_photo_outlined, size: 17));
  }

  Widget _actions(Map<String, dynamic> item, String name, String code,
      bool linked, int id) {
    if (linked) {
      return Row(mainAxisAlignment: MainAxisAlignment.end, children: [
        TextButton.icon(
            onPressed: _busy ? null : () => _move(code, name),
            icon: const Icon(Icons.swap_horiz, size: 16),
            label: const Text('Pindah')),
        TextButton.icon(
            onPressed: _busy ? null : () => _detach(code, name),
            icon: const Icon(Icons.link_off, size: 16),
            label: const Text('Lepas'),
            style:
                TextButton.styleFrom(foregroundColor: const Color(0xFFE11D48))),
      ]);
    }
    return Row(mainAxisAlignment: MainAxisAlignment.end, children: [
      TextButton.icon(
          onPressed: _busy || id <= 0 ? null : () => _linkPending(id, name),
          icon: const Icon(Icons.qr_code_scanner, size: 16),
          label: const Text('Isi Code / QR')),
      IconButton(
          tooltip: 'Hapus',
          onPressed: _busy || id <= 0 ? null : () => _deletePending(id, name),
          icon: const Icon(Icons.delete_outline,
              size: 18, color: Color(0xFFE11D48))),
    ]);
  }

  Future<void> _attachExisting() async {
    final asset = await _pickAsset(title: 'Tautkan Aset Existing');
    if (asset == null) return;
    await _run(() async {
      await ApiService().post('/v2/assets/children', data: {
        'parent_asset': widget.assetCode,
        'child_asset': asset['AssetCode']
      });
    }, 'Aset berhasil ditautkan.');
  }

  Future<void> _linkPending(int id, String name) async {
    final asset =
        await _pickAsset(title: 'Isi Code / QR untuk $name', allowScan: true);
    if (asset == null) return;
    await _run(() async {
      await ApiService().post('/v2/assets/children/pending/link',
          data: {'pending_id': id, 'child_asset': asset['AssetCode']});
    }, 'Asset Code / QR berhasil diisi.');
  }

  Future<void> _move(String code, String name) async {
    final asset = await _pickAsset(
        title: 'Pindahkan $name ke parent', excludedCode: code);
    if (asset == null) return;
    await _run(() async {
      await ApiService().post('/v2/assets/children/move',
          data: {'child_asset': code, 'new_parent_asset': asset['AssetCode']});
    }, 'Aset berhasil dipindahkan.');
  }

  Future<void> _detach(String code, String name) async {
    if (!await _confirm(
        'Lepas tautan?', '$name tetap tersedia sebagai aset mandiri.')) {
      return;
    }
    await _run(() async {
      await ApiService()
          .post('/v2/assets/children/detach', data: {'child_asset': code});
    }, 'Tautan aset berhasil dilepas.');
  }

  Future<void> _deletePending(int id, String name) async {
    if (!await _confirm(
        'Hapus komponen?', 'Hapus $name dari daftar aset terkait?')) {
      return;
    }
    await _run(() async {
      await ApiService()
          .post('/v2/assets/children/pending/delete', data: {'pending_id': id});
    }, 'Komponen berhasil dihapus.');
  }

  Future<void> _pickPhoto(int id, int slot) async {
    final photo = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (photo == null) return;
    await _run(() async {
      final data = FormData.fromMap({
        'slot': '$slot',
        'photo': await MultipartFile.fromFile(photo.path, filename: photo.name)
      });
      await ApiService().post('/v2/assets/children/pending/$id/photo',
          data: data, options: Options(contentType: 'multipart/form-data'));
    }, 'Foto $slot berhasil disimpan.');
  }

  Future<void> _deletePhoto(int id, int slot) async {
    if (!await _confirm(
        'Hapus Foto $slot?', 'Foto akan dihapus dari komponen ini.')) {
      return;
    }
    await _run(() async {
      await ApiService().delete('/v2/assets/children/pending/$id/photo/$slot');
    }, 'Foto $slot berhasil dihapus.');
  }

  Future<void> _addManual() async {
    final result = await showDialog<_ManualResult>(
        context: context,
        barrierDismissible: false,
        builder: (_) => const _ManualDialog());
    if (result == null) return;
    await _run(() async {
      final response =
          await ApiService().post('/v2/assets/children/manual', data: {
        'parent_asset': widget.assetCode,
        'group_name': result.group,
        'items': result.rows
            .map((row) => {
                  'item_name': row.name,
                  'frequency': row.frequency,
                  'pic': row.pic
                })
            .toList(),
      });
      final body = response.data;
      final created = body is Map && body['data'] is Map
          ? List<dynamic>.from((body['data'] as Map)['items'] ?? const [])
          : <dynamic>[];
      for (var i = 0; i < created.length && i < result.rows.length; i++) {
        final id = _number((created[i] as Map)['id']);
        for (final entry in <MapEntry<int, XFile?>>[
          MapEntry(1, result.rows[i].photo1),
          MapEntry(2, result.rows[i].photo2)
        ]) {
          if (entry.value == null) continue;
          final form = FormData.fromMap({
            'slot': '${entry.key}',
            'photo': await MultipartFile.fromFile(entry.value!.path,
                filename: entry.value!.name)
          });
          await ApiService().post('/v2/assets/children/pending/$id/photo',
              data: form, options: Options(contentType: 'multipart/form-data'));
        }
      }
    }, 'Aset terkait manual berhasil ditambahkan.');
  }

  Future<void> _importExcel() async {
    final action = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Import Aset Terkait'),
        content: const Text(
            'Gunakan template yang sama dengan web. Sistem akan memeriksa isi file sebelum data diterapkan.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Batal')),
          OutlinedButton.icon(
              onPressed: () => Navigator.pop(context, 'template'),
              icon: const Icon(Icons.download, size: 17),
              label: const Text('Unduh Template')),
          FilledButton.icon(
              onPressed: () => Navigator.pop(context, 'import'),
              icon: const Icon(Icons.upload_file, size: 17),
              label: const Text('Pilih Excel')),
        ],
      ),
    );
    if (action == null) return;
    if (action == 'template') {
      await _downloadImportTemplate();
      return;
    }
    final picked = await FilePicker.platform
        .pickFiles(type: FileType.custom, allowedExtensions: const ['xlsx']);
    final file = picked?.files.single;
    if (file?.path == null) return;
    setState(() => _busy = true);
    try {
      Future<Response> upload(bool dryRun) async {
        final form = FormData.fromMap({
          'parent_asset': widget.assetCode,
          'dry_run': dryRun ? '1' : '0',
          'file':
              await MultipartFile.fromFile(file!.path!, filename: file.name),
        });
        return ApiService().post('/v2/assets/children/import',
            data: form, options: Options(contentType: 'multipart/form-data'));
      }

      final preview = await upload(true);
      final body = preview.data;
      final data =
          body is Map && body['data'] is Map ? body['data'] as Map : const {};
      final summary =
          data['summary'] is Map ? data['summary'] as Map : const {};
      if (!mounted) return;
      final apply = await _confirm('Terapkan hasil import?',
          'Grup: ${summary['groups'] ?? 0} • Item: ${summary['items'] ?? 0}\nValid: ${summary['valid'] ?? 0} • Pending: ${summary['pending'] ?? 0}\nError: ${summary['errors'] ?? 0}');
      if (!apply) return;
      await upload(false);
      await widget.onChanged();
      _message('Import aset terkait berhasil.');
    } catch (error) {
      _message(ApiErrorHelper.toUserMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _downloadImportTemplate() async {
    setState(() => _busy = true);
    try {
      final response = await ApiService().get(
        '/v2/assets/children/import-template',
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = response.data;
      if (bytes is! List<int>) {
        throw Exception('File template dari server tidak valid.');
      }
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}/Template_Aset_Terkait.xlsx');
      await file.writeAsBytes(bytes, flush: true);
      await OpenFile.open(file.path);
      _message('Template Excel berhasil diunduh.');
    } catch (error) {
      _message(ApiErrorHelper.toUserMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Map<String, dynamic>?> _pickAsset(
      {required String title,
      bool allowScan = false,
      String? excludedCode}) async {
    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _AssetPickerDialog(
          title: title,
          allowScan: allowScan,
          excludedCodes: {
            widget.assetCode,
            if (excludedCode != null) excludedCode
          }),
    );
  }

  Future<bool> _confirm(String title, String message) async =>
      await showDialog<bool>(
          context: context,
          builder: (context) =>
              AlertDialog(title: Text(title), content: Text(message), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Batal')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Lanjutkan'))
              ])) ??
      false;

  void _showPhoto(String url) => showDialog<void>(
      context: context,
      builder: (_) => Dialog(
              child: Stack(children: [
            InteractiveViewer(child: Image.network(url, fit: BoxFit.contain)),
            Positioned(
                right: 6,
                top: 6,
                child: IconButton.filledTonal(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close)))
          ])));

  List<Map<String, dynamic>> _maps(dynamic value) => value is List
      ? value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
      : [];
}

class _Header extends StatelessWidget {
  final String text;
  const _Header(this.text);
  @override
  Widget build(BuildContext context) => Text(text,
      textAlign: TextAlign.center,
      style: const TextStyle(
          fontSize: 10.5, fontWeight: FontWeight.w700, color: _muted));
}

class _AssetPickerDialog extends StatefulWidget {
  final String title;
  final bool allowScan;
  final Set<String> excludedCodes;
  const _AssetPickerDialog(
      {required this.title,
      required this.allowScan,
      required this.excludedCodes});
  @override
  State<_AssetPickerDialog> createState() => _AssetPickerDialogState();
}

class _AssetPickerDialogState extends State<_AssetPickerDialog> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = false;
  String? _error;

  Future<void> _find([String? direct]) async {
    final q = (direct ?? _search.text).trim();
    if (q.length < 2) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Hasil scanner bisa berupa AssetCode, URL QR baru, maupun URL QR legacy
      // berisi ID. Endpoint detail sudah menormalisasi ketiganya.
      if (direct != null) {
        try {
          final detailResponse = await ApiService().get(
            '/v2/assets/detail',
            queryParameters: {'asset': direct},
          );
          final detailBody = detailResponse.data;
          final detail = detailBody is Map && detailBody['data'] is Map
              ? Map<String, dynamic>.from(detailBody['data'] as Map)
              : null;
          final code = '${detail?['AssetCode'] ?? ''}';
          if (detail != null &&
              code.isNotEmpty &&
              !widget.excludedCodes.contains(code)) {
            if (!mounted) return;
            Navigator.pop(context, detail);
            return;
          }
        } catch (_) {
          // Jika bukan payload QR yang dapat di-resolve, lanjut pencarian teks.
        }
      }
      final response = await ApiService()
          .get('/v2/work-orders/assets', queryParameters: {'q': q});
      final body = response.data;
      final data = body is Map ? body['data'] : null;
      final rows = data is List
          ? data
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .where((e) => !widget.excludedCodes.contains('${e['AssetCode']}'))
              .toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      if (direct != null && rows.length == 1) {
        Navigator.pop(context, rows.first);
        return;
      }
      setState(() => _rows = rows);
    } catch (error) {
      if (mounted) setState(() => _error = ApiErrorHelper.toUserMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _scan() async {
    final raw = await showDialog<String>(
        context: context, builder: (_) => const _QrScannerDialog());
    if (raw == null) return;
    _search.text = raw;
    await _find(raw);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        content: SizedBox(
            width: 650,
            height: 430,
            child: Column(children: [
              Row(children: [
                Expanded(
                    child: TextField(
                        controller: _search,
                        autofocus: true,
                        onSubmitted: (_) => _find(),
                        decoration: const InputDecoration(
                            labelText: 'Cari nama, kode, atau company aset',
                            prefixIcon: Icon(Icons.search),
                            border: OutlineInputBorder()))),
                const SizedBox(width: 8),
                IconButton.filledTonal(
                    tooltip: 'Cari',
                    onPressed: _loading ? null : _find,
                    icon: const Icon(Icons.search)),
                if (widget.allowScan) ...[
                  const SizedBox(width: 6),
                  IconButton.filled(
                      tooltip: 'Scan QR',
                      onPressed: _loading ? null : _scan,
                      icon: const Icon(Icons.qr_code_scanner))
                ],
              ]),
              if (_loading) const LinearProgressIndicator(),
              if (_error != null)
                Padding(
                    padding: const EdgeInsets.all(10),
                    child: Text(_error!,
                        style: const TextStyle(color: Colors.red))),
              const SizedBox(height: 8),
              Expanded(
                  child: _rows.isEmpty
                      ? const Center(
                          child: Text(
                              'Masukkan minimal 2 karakter untuk mencari aset.',
                              style: TextStyle(color: _muted)))
                      : ListView.separated(
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, i) {
                            final row = _rows[i];
                            return ListTile(
                                title: Text(
                                    '${row['AssetName'] ?? row['AssetCode']}'),
                                subtitle: Text(
                                    '${row['AssetCode']} • ${row['CompanyName'] ?? '-'} • ${row['LocationAsset'] ?? '-'}'),
                                onTap: () => Navigator.pop(context, row));
                          })),
            ])),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Batal'))
        ],
      );
}

class _QrScannerDialog extends StatefulWidget {
  const _QrScannerDialog();
  @override
  State<_QrScannerDialog> createState() => _QrScannerDialogState();
}

class _QrScannerDialogState extends State<_QrScannerDialog> {
  final MobileScannerController _controller =
      MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  bool _allowed = false;
  bool _handled = false;
  @override
  void initState() {
    super.initState();
    _permission();
  }

  Future<void> _permission() async {
    final result = await Permission.camera.request();
    if (mounted) setState(() => _allowed = result.isGranted);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Dialog(
      child: SizedBox(
          width: 520,
          height: 520,
          child: Stack(children: [
            if (_allowed)
              MobileScanner(
                  controller: _controller,
                  onDetect: (capture) {
                    if (_handled || capture.barcodes.isEmpty) return;
                    final value = capture.barcodes.first.rawValue?.trim();
                    if (value == null || value.isEmpty) return;
                    _handled = true;
                    Navigator.pop(context, value);
                  })
            else
              Center(
                  child: FilledButton(
                      onPressed: _permission,
                      child: const Text('Aktifkan kamera'))),
            Positioned(
                top: 8,
                right: 8,
                child: IconButton.filledTonal(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close))),
            const Positioned(
                left: 20,
                right: 20,
                bottom: 20,
                child: Text('Arahkan kamera ke QR aset',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w700))),
          ])));
}

class _ManualRow {
  final name = TextEditingController();
  final frequency = TextEditingController();
  final pic = TextEditingController();
  XFile? photo1;
  XFile? photo2;
  void dispose() {
    name.dispose();
    frequency.dispose();
    pic.dispose();
  }
}

class _ManualResult {
  final String group;
  final List<_ManualRowResult> rows;
  const _ManualResult(this.group, this.rows);
}

class _ManualRowResult {
  final String name;
  final String frequency;
  final String pic;
  final XFile? photo1;
  final XFile? photo2;
  const _ManualRowResult(
      this.name, this.frequency, this.pic, this.photo1, this.photo2);
}

class _ManualDialog extends StatefulWidget {
  const _ManualDialog();
  @override
  State<_ManualDialog> createState() => _ManualDialogState();
}

class _ManualDialogState extends State<_ManualDialog> {
  final _group = TextEditingController();
  final List<_ManualRow> _rows = [_ManualRow()];
  final _picker = ImagePicker();
  @override
  void dispose() {
    _group.dispose();
    for (final row in _rows) {
      row.dispose();
    }
    super.dispose();
  }

  Future<void> _photo(_ManualRow row, int slot) async {
    final file =
        await _picker.pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (file != null && mounted) {
      setState(() {
        if (slot == 1) {
          row.photo1 = file;
        } else {
          row.photo2 = file;
        }
      });
    }
  }

  void _save() {
    if (_group.text.trim().isEmpty ||
        _rows.any((r) => r.name.text.trim().isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('Nama kelompok dan seluruh nama komponen wajib diisi.')));
      return;
    }
    Navigator.pop(
        context,
        _ManualResult(
            _group.text.trim(),
            _rows
                .map((r) => _ManualRowResult(
                    r.name.text.trim(),
                    r.frequency.text.trim(),
                    r.pic.text.trim(),
                    r.photo1,
                    r.photo2))
                .toList()));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Tambah Aset Terkait Manual'),
        content: SizedBox(
            width: 850,
            height: 500,
            child: Column(children: [
              TextField(
                  controller: _group,
                  decoration: const InputDecoration(
                      labelText: 'Nama kelompok / kategori *',
                      hintText: 'Personal Computer',
                      border: OutlineInputBorder())),
              const SizedBox(height: 12),
              Expanded(
                  child: ListView.builder(
                      itemCount: _rows.length,
                      itemBuilder: (_, index) {
                        final row = _rows[index];
                        return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(children: [
                                  Row(children: [
                                    Expanded(
                                        flex: 3,
                                        child: TextField(
                                            controller: row.name,
                                            decoration: const InputDecoration(
                                                labelText: 'Komponen *',
                                                isDense: true))),
                                    const SizedBox(width: 10),
                                    Expanded(
                                        flex: 2,
                                        child: TextField(
                                            controller: row.frequency,
                                            decoration: const InputDecoration(
                                                labelText: 'Frekuensi',
                                                isDense: true))),
                                    const SizedBox(width: 10),
                                    Expanded(
                                        flex: 2,
                                        child: TextField(
                                            controller: row.pic,
                                            decoration: const InputDecoration(
                                                labelText: 'PIC',
                                                isDense: true))),
                                    IconButton(
                                        onPressed: _rows.length == 1
                                            ? null
                                            : () => setState(() {
                                                  final removed =
                                                      _rows.removeAt(index);
                                                  removed.dispose();
                                                }),
                                        icon: const Icon(Icons.delete_outline))
                                  ]),
                                  const SizedBox(height: 10),
                                  Row(children: [
                                    OutlinedButton.icon(
                                        onPressed: () => _photo(row, 1),
                                        icon: const Icon(
                                            Icons.add_a_photo_outlined,
                                            size: 16),
                                        label: Text(row.photo1?.name ??
                                            'Foto 1 (opsional)')),
                                    const SizedBox(width: 8),
                                    OutlinedButton.icon(
                                        onPressed: () => _photo(row, 2),
                                        icon: const Icon(
                                            Icons.add_a_photo_outlined,
                                            size: 16),
                                        label: Text(row.photo2?.name ??
                                            'Foto 2 (opsional)'))
                                  ]),
                                ])));
                      })),
              Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(
                      onPressed: () => setState(() => _rows.add(_ManualRow())),
                      icon: const Icon(Icons.add),
                      label: const Text('Tambah Komponen'))),
            ])),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Batal')),
          FilledButton(onPressed: _save, child: const Text('Simpan'))
        ],
      );
}
