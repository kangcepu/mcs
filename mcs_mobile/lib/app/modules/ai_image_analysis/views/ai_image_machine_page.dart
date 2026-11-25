import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/services/permission_service.dart';
import '../../../data/providers/api_service.dart';
import 'ai_image_analysis_page.dart' show AiImageAnalysisDetailPage;

List<Map<String, dynamic>> _list(dynamic response) {
  final body = response.data;
  final data = body is Map ? body['data'] : null;
  return data is List
      ? data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
      : <Map<String, dynamic>>[];
}

Map<String, dynamic>? _map(dynamic response) {
  final body = response.data;
  final data = body is Map ? body['data'] : null;
  return data is Map ? Map<String, dynamic>.from(data) : null;
}

String _error(Object error) =>
    error is DioException && error.response?.data is Map
        ? (error.response!.data as Map)['message']?.toString() ??
            'Permintaan gagal.'
        : 'Tidak dapat terhubung ke server.';

String _date(dynamic value) {
  final parsed = DateTime.tryParse('${value ?? ''}');
  return parsed == null
      ? '-'
      : DateFormat('dd MMM yyyy, HH:mm').format(parsed.toLocal());
}

class AiImageMachinePage extends StatelessWidget {
  const AiImageMachinePage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('AI Image by Machine')),
        body: const AiImageMachineBrowser(),
      );
}

class AiImageMachineBrowser extends StatefulWidget {
  const AiImageMachineBrowser({super.key});
  @override
  State<AiImageMachineBrowser> createState() => _AiImageMachineBrowserState();
}

class _AiImageMachineBrowserState extends State<AiImageMachineBrowser> {
  final _search = TextEditingController();
  Timer? _debounce;
  bool _loading = true;
  List<Map<String, dynamic>> _machines = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final response = await ApiService().get('/v2/ai-image-analysis/machines',
          queryParameters: {'q': _search.text.trim()});
      if (mounted) setState(() => _machines = _list(response));
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(_error(error)),
            backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _changed(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), _load);
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
                controller: _search,
                onChanged: _changed,
                decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Cari kode, nama, atau lokasi machine...',
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () {
                              _search.clear();
                              _load();
                            }))),
            const SizedBox(height: 14),
            if (_loading)
              const Center(
                  child: Padding(
                      padding: EdgeInsets.all(48),
                      child: CircularProgressIndicator()))
            else if (_machines.isEmpty)
              const _Empty(
                  title: 'Machine tidak ditemukan',
                  subtitle:
                      'AI Image hanya menampilkan asset aktif berkategori Mesin Pabrik.')
            else
              LayoutBuilder(builder: (context, box) {
                final count = box.maxWidth >= 1050
                    ? 3
                    : box.maxWidth >= 650
                        ? 2
                        : 1;
                return GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _machines.length,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: count,
                        mainAxisExtent: 188,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12),
                    itemBuilder: (_, index) => _MachineCard(
                        machine: _machines[index],
                        onTap: () async {
                          await Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) => AiImageMachineDetailPage(
                                      machine: _machines[index])));
                          _load();
                        }));
              }),
          ],
        ),
      );
}

class _MachineCard extends StatelessWidget {
  final Map<String, dynamic> machine;
  final VoidCallback onTap;
  const _MachineCard({required this.machine, required this.onTap});
  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
            onTap: onTap,
            child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Expanded(
                            child: Text('${machine['asset_code']}',
                                style: const TextStyle(
                                    color: Color(0xFF2563EB),
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700))),
                        Icon(
                            (int.tryParse('${machine['attention_count']}') ??
                                        0) >
                                    0
                                ? Icons.warning_amber_rounded
                                : Icons.precision_manufacturing_outlined,
                            color: (int.tryParse(
                                            '${machine['attention_count']}') ??
                                        0) >
                                    0
                                ? Colors.orange
                                : const Color(0xFF2563EB))
                      ]),
                      const SizedBox(height: 5),
                      Text('${machine['asset_name']}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 5),
                      Text(
                          '${machine['company_name'] ?? '-'} · ${machine['location_name'] ?? '-'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: Colors.grey.shade600, fontSize: 12)),
                      const Spacer(),
                      Row(children: [
                        _Metric(
                            value: machine['parameter_count'],
                            label: 'Parameter'),
                        const SizedBox(width: 7),
                        _Metric(
                            value: machine['analysis_count'],
                            label: 'Analisis'),
                        const SizedBox(width: 7),
                        _Metric(
                            value: machine['unmapped_count'],
                            label: 'Data lama')
                      ]),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(
                            child: Text(
                                machine['latest_analysis_at'] == null
                                    ? 'Belum pernah dianalisis'
                                    : 'Terakhir ${_date(machine['latest_analysis_at'])}',
                                style: TextStyle(
                                    color: Colors.grey.shade500,
                                    fontSize: 11))),
                        const Icon(Icons.chevron_right, size: 18)
                      ]),
                    ]))),
      );
}

class _Metric extends StatelessWidget {
  final dynamic value;
  final String label;
  const _Metric({required this.value, required this.label});
  @override
  Widget build(BuildContext context) => Expanded(
      child: Container(
          padding: const EdgeInsets.symmetric(vertical: 7),
          decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(8)),
          child: Column(children: [
            Text('${value ?? 0}',
                style: const TextStyle(fontWeight: FontWeight.w800)),
            Text(label,
                style: TextStyle(color: Colors.grey.shade600, fontSize: 9))
          ])));
}

class AiImageMachineDetailPage extends StatefulWidget {
  final Map<String, dynamic> machine;
  const AiImageMachineDetailPage({super.key, required this.machine});
  @override
  State<AiImageMachineDetailPage> createState() =>
      _AiImageMachineDetailPageState();
}

class _AiImageMachineDetailPageState extends State<AiImageMachineDetailPage> {
  bool _loading = true,
      _canCreate = false,
      _canMaster = false,
      _canRetry = false,
      _canVerify = false;
  List<Map<String, dynamic>> _parameters = const [], _unmapped = const [];

  @override
  void initState() {
    super.initState();
    _permissions();
    _load();
  }

  Future<void> _permissions() async {
    final values = await Future.wait([
      PermissionService.hasAny(const ['ai_image_analysis_create']),
      PermissionService.hasAny(const ['ai_image_analysis_master']),
      PermissionService.hasAny(const ['ai_image_analysis_retry']),
      PermissionService.hasAny(const ['ai_image_analysis_verify'])
    ]);
    if (mounted)
      setState(() {
        _canCreate = values[0];
        _canMaster = values[1];
        _canRetry = values[2];
        _canVerify = values[3];
      });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = _map(await ApiService()
          .get('/v2/ai-image-analysis/machines/${widget.machine['asset_id']}'));
      if (mounted)
        setState(() {
          _parameters = (data?['parameters'] as List? ?? [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          _unmapped = (data?['unmapped_analyses'] as List? ?? [])
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        });
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(_error(error)),
            backgroundColor: Colors.red.shade700));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _master([Map<String, dynamic>? item]) async {
    final changed = await showDialog<bool>(
        context: context,
        builder: (_) =>
            _ParameterDialog(machine: widget.machine, initial: item));
    if (changed == true) _load();
  }

  Future<void> _upload(Map<String, dynamic> item) async {
    final id = await showDialog<int>(
        context: context,
        builder: (_) =>
            _ParameterUploadDialog(machine: widget.machine, parameter: item));
    if (id != null && mounted) {
      await Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => AiImageAnalysisDetailPage(
                  id: id, canRetry: _canRetry, canVerify: _canVerify)));
      _load();
    }
  }

  Future<void> _history(Map<String, dynamic> item) async {
    final id = await showModalBottomSheet<int>(
        context: context,
        isScrollControlled: true,
        builder: (_) => _ParameterHistorySheet(parameter: item));
    if (id != null && mounted) {
      await Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => AiImageAnalysisDetailPage(
                  id: id, canRetry: _canRetry, canVerify: _canVerify)));
      _load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: Text('${widget.machine['asset_name']}'), actions: [
        if (_canMaster)
          IconButton(
              onPressed: () => _master(),
              icon: const Icon(Icons.add),
              tooltip: 'Tambah Parameter')
      ]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(14), children: [
                Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(12)),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${widget.machine['asset_code']}',
                              style: const TextStyle(
                                  color: Color(0xFF2563EB),
                                  fontWeight: FontWeight.w800)),
                          Text(
                              '${widget.machine['company_name'] ?? '-'} · ${widget.machine['location_name'] ?? '-'}',
                              style: const TextStyle(fontSize: 12))
                        ])),
                const SizedBox(height: 16),
                Row(children: [
                  const Expanded(
                      child: Text('Master Parameter',
                          style: TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 17))),
                  if (_canMaster)
                    FilledButton.icon(
                        onPressed: () => _master(),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Tambah'))
                ]),
                const SizedBox(height: 10),
                if (_parameters.isEmpty)
                  const _Empty(
                      title: 'Master parameter belum dibuat',
                      subtitle: 'Tambahkan parameter sebelum upload foto.')
                else
                  ..._parameters.map((p) => Card(
                      child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(children: [
                                  Expanded(
                                      child: Text(
                                          '${p['parameter_group'] ?? 'GENERAL'} · ${p['parameter_code']}',
                                          style: const TextStyle(
                                              color: Color(0xFF2563EB),
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700))),
                                  _Status(
                                      '${p['latest_status'] ?? 'BELUM ADA DATA'}')
                                ]),
                                const SizedBox(height: 4),
                                Text('${p['parameter_name']}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16)),
                                if ('${p['reference_text'] ?? ''}'.isNotEmpty)
                                  Padding(
                                      padding: const EdgeInsets.only(top: 5),
                                      child: Text('${p['reference_text']}',
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                              color: Colors.grey.shade600,
                                              fontSize: 12))),
                                const SizedBox(height: 10),
                                Wrap(spacing: 8, runSpacing: 8, children: [
                                  if (_canCreate && p['status'] == 'ACTIVE')
                                    FilledButton.icon(
                                        onPressed: () => _upload(p),
                                        icon: const Icon(
                                            Icons.camera_alt_outlined,
                                            size: 18),
                                        label: const Text('Upload Foto')),
                                  OutlinedButton.icon(
                                      onPressed: () => _history(p),
                                      icon: const Icon(Icons.history, size: 18),
                                      label: Text(
                                          'History (${p['analysis_count'] ?? 0})')),
                                  if (_canMaster)
                                    TextButton.icon(
                                        onPressed: () => _master(p),
                                        icon: const Icon(Icons.edit_outlined,
                                            size: 18),
                                        label: const Text('Edit'))
                                ])
                              ])))),
                if (_unmapped.isNotEmpty)
                  ExpansionTile(
                      title: Text(
                          'General / Unmapped Analysis (${_unmapped.length})'),
                      subtitle: const Text(
                          'Data lama yang belum terhubung ke parameter'),
                      children: _unmapped
                          .map((a) => ListTile(
                              title: Text('${a['activity_name']}'),
                              subtitle: Text(
                                  '${a['analysis_number']} · ${_date(a['created_at'])}'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) => AiImageAnalysisDetailPage(
                                          id: int.parse('${a['id']}'),
                                          canRetry: _canRetry,
                                          canVerify: _canVerify)))))
                          .toList()),
              ])));
}

class _ParameterDialog extends StatefulWidget {
  final Map<String, dynamic> machine;
  final Map<String, dynamic>? initial;
  const _ParameterDialog({required this.machine, this.initial});
  @override
  State<_ParameterDialog> createState() => _ParameterDialogState();
}

class _ParameterDialogState extends State<_ParameterDialog> {
  final _name = TextEditingController(),
      _code = TextEditingController(),
      _group = TextEditingController(),
      _unit = TextEditingController(),
      _min = TextEditingController(),
      _target = TextEditingController(),
      _max = TextEditingController(),
      _reference = TextEditingController(),
      _instruction = TextEditingController();
  String _type = 'RANGE';
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    final v = widget.initial;
    _name.text = '${v?['parameter_name'] ?? ''}';
    _code.text = '${v?['parameter_code'] ?? ''}';
    _group.text = '${v?['parameter_group'] ?? ''}';
    _unit.text = '${v?['unit'] ?? ''}';
    _min.text = '${v?['minimum_value'] ?? ''}';
    _target.text = '${v?['target_value'] ?? ''}';
    _max.text = '${v?['maximum_value'] ?? ''}';
    _reference.text = '${v?['reference_text'] ?? ''}';
    _instruction.text = '${v?['photo_instruction'] ?? ''}';
    _type = '${v?['reference_type'] ?? 'RANGE'}';
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _code,
      _group,
      _unit,
      _min,
      _target,
      _max,
      _reference,
      _instruction
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) return;
    setState(() => _busy = true);
    final data = {
      'parameter_name': _name.text.trim(),
      'parameter_code': _code.text.trim(),
      'parameter_group': _group.text.trim(),
      'unit': _unit.text.trim(),
      'reference_type': _type,
      'minimum_value': _min.text,
      'target_value': _target.text,
      'maximum_value': _max.text,
      'reference_text': _reference.text.trim(),
      'photo_instruction': _instruction.text.trim(),
      'minimum_photo_count': 1
    };
    try {
      if (widget.initial == null) {
        await ApiService().post(
            '/v2/ai-image-analysis/machines/${widget.machine['asset_id']}/parameters',
            data: data);
      } else {
        await ApiService().patch(
            '/v2/ai-image-analysis/parameters/${widget.initial!['id']}',
            data: data);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(_error(error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: Text(widget.initial == null
              ? 'Tambah Master Parameter'
              : 'Edit Master Parameter'),
          content: SizedBox(
              width: 620,
              child: SingleChildScrollView(
                  child: Column(children: [
                TextField(
                    controller: _name,
                    decoration:
                        const InputDecoration(labelText: 'Nama parameter *')),
                TextField(
                    controller: _code,
                    decoration:
                        const InputDecoration(labelText: 'Kode parameter')),
                TextField(
                    controller: _group,
                    decoration: const InputDecoration(labelText: 'Kelompok')),
                TextField(
                    controller: _unit,
                    decoration: const InputDecoration(labelText: 'Unit')),
                DropdownButtonFormField(
                    value: _type,
                    decoration: const InputDecoration(labelText: 'Jenis acuan'),
                    items: const [
                      DropdownMenuItem(
                          value: 'RANGE', child: Text('Minimum–maksimum')),
                      DropdownMenuItem(value: 'TARGET', child: Text('Target')),
                      DropdownMenuItem(value: 'TEXT', child: Text('Teks')),
                      DropdownMenuItem(
                          value: 'NONE', child: Text('Tanpa acuan'))
                    ],
                    onChanged: (v) => setState(() => _type = v ?? 'NONE')),
                if (_type == 'RANGE' || _type == 'TARGET')
                  Row(children: [
                    Expanded(
                        child: TextField(
                            controller: _min,
                            keyboardType: TextInputType.number,
                            decoration:
                                const InputDecoration(labelText: 'Minimum'))),
                    const SizedBox(width: 8),
                    Expanded(
                        child: TextField(
                            controller: _target,
                            keyboardType: TextInputType.number,
                            decoration:
                                const InputDecoration(labelText: 'Target'))),
                    const SizedBox(width: 8),
                    Expanded(
                        child: TextField(
                            controller: _max,
                            keyboardType: TextInputType.number,
                            decoration:
                                const InputDecoration(labelText: 'Maksimum')))
                  ]),
                TextField(
                    controller: _reference,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Acuan teks')),
                TextField(
                    controller: _instruction,
                    maxLines: 2,
                    decoration:
                        const InputDecoration(labelText: 'Instruksi foto'))
              ]))),
          actions: [
            TextButton(
                onPressed: _busy ? null : () => Navigator.pop(context),
                child: const Text('Batal')),
            FilledButton(
                onPressed: _busy ? null : _save,
                child: Text(_busy ? 'Menyimpan...' : 'Simpan'))
          ]);
}

class _ParameterUploadDialog extends StatefulWidget {
  final Map<String, dynamic> machine, parameter;
  const _ParameterUploadDialog(
      {required this.machine, required this.parameter});
  @override
  State<_ParameterUploadDialog> createState() => _ParameterUploadDialogState();
}

class _ParameterUploadDialogState extends State<_ParameterUploadDialog> {
  final List<XFile> _photos = [];
  bool _busy = false;
  Future<void> _pick(ImageSource source) async {
    final remaining = 8 - _photos.length;
    if (remaining <= 0) return;
    final images = source == ImageSource.gallery
        ? await ImagePicker()
            .pickMultiImage(imageQuality: 82, maxWidth: 1800, limit: remaining)
        : <XFile?>[
            await ImagePicker()
                .pickImage(source: source, imageQuality: 82, maxWidth: 1800)
          ];
    if (mounted)
      setState(() => _photos.addAll(images.whereType<XFile>().take(remaining)));
  }

  Future<void> _submit() async {
    final minimum =
        int.tryParse('${widget.parameter['minimum_photo_count']}') ?? 1;
    if (_photos.length < minimum) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Minimal $minimum foto.')));
      return;
    }
    setState(() => _busy = true);
    try {
      final form = FormData.fromMap({
        'asset_id': '${widget.machine['asset_id']}',
        'asset_code': '${widget.machine['asset_code']}',
        'parameter_id': '${widget.parameter['id']}',
        'images': await Future.wait(_photos
            .map((p) => MultipartFile.fromFile(p.path, filename: p.name)))
      });
      final item = _map(await ApiService().post('/v2/ai-image-analysis',
          data: form,
          options: Options(
              contentType: 'multipart/form-data',
              sendTimeout: const Duration(seconds: 30),
              receiveTimeout: const Duration(seconds: 30))));
      if (mounted) Navigator.pop(context, int.tryParse('${item?['id']}'));
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(_error(error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: Text('Upload · ${widget.parameter['parameter_name']}'),
          content: SizedBox(
              width: 620,
              child: SingleChildScrollView(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                            color: const Color(0xFFEFF6FF),
                            borderRadius: BorderRadius.circular(10)),
                        child: Text(
                            '${widget.parameter['reference_text'] ?? 'Belum ada acuan teks'}\n${widget.parameter['photo_instruction'] ?? ''}')),
                    const SizedBox(height: 12),
                    Text('${_photos.length}/8 foto',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      ..._photos.asMap().entries.map((e) => Chip(
                          label: Text(e.value.name,
                              overflow: TextOverflow.ellipsis),
                          onDeleted: () =>
                              setState(() => _photos.removeAt(e.key)))),
                      ActionChip(
                          avatar: const Icon(Icons.camera_alt, size: 18),
                          label: const Text('Camera'),
                          onPressed: () => _pick(ImageSource.camera)),
                      ActionChip(
                          avatar: const Icon(Icons.photo_library_outlined,
                              size: 18),
                          label: const Text('Gallery'),
                          onPressed: () => _pick(ImageSource.gallery))
                    ])
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
                label: const Text('Analisis'))
          ]);
}

class _ParameterHistorySheet extends StatefulWidget {
  final Map<String, dynamic> parameter;
  const _ParameterHistorySheet({required this.parameter});
  @override
  State<_ParameterHistorySheet> createState() => _ParameterHistorySheetState();
}

class _ParameterHistorySheetState extends State<_ParameterHistorySheet> {
  bool _loading = true;
  List<Map<String, dynamic>> _rows = const [];
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = _map(await ApiService().get(
          '/v2/ai-image-analysis/parameters/${widget.parameter['id']}/history'));
      if (mounted)
        setState(() => _rows = (data?['analyses'] as List? ?? [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
      child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: .7,
          maxChildSize: .92,
          builder: (_, controller) => Column(children: [
                Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(children: [
                      Expanded(
                          child: Text(
                              'History · ${widget.parameter['parameter_name']}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 18))),
                      IconButton(
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.close))
                    ])),
                Expanded(
                    child: _loading
                        ? const Center(child: CircularProgressIndicator())
                        : _rows.isEmpty
                            ? const _Empty(
                                title: 'Belum ada History',
                                subtitle:
                                    'Upload foto pertama untuk parameter ini.')
                            : ListView.builder(
                                controller: controller,
                                itemCount: _rows.length,
                                itemBuilder: (_, i) {
                                  final row = _rows[i];
                                  return ListTile(
                                      title: Text('${row['analysis_number']}',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w700)),
                                      subtitle: Text(
                                          '${row['created_by'] ?? '-'} · ${_date(row['created_at'])}'),
                                      trailing: _Status('${row['status']}'),
                                      onTap: () => Navigator.pop(context,
                                          int.tryParse('${row['id']}')));
                                }))
              ])));
}

class _Status extends StatelessWidget {
  final String value;
  const _Status(this.value);
  @override
  Widget build(BuildContext context) {
    final color = value == 'VERIFIED' || value == 'ANALYZED'
        ? Colors.green
        : value == 'FAILED'
            ? Colors.red
            : Colors.orange;
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
            color: color.withValues(alpha: .1),
            borderRadius: BorderRadius.circular(20)),
        child: Text(value,
            style: TextStyle(
                color: color, fontSize: 9, fontWeight: FontWeight.w700)));
  }
}

class _Empty extends StatelessWidget {
  final String title, subtitle;
  const _Empty({required this.title, required this.subtitle});
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.all(42),
      child: Column(children: [
        Icon(Icons.precision_manufacturing_outlined,
            size: 48, color: Colors.grey.shade400),
        const SizedBox(height: 10),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade600))
      ]));
}
