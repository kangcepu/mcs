import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../../data/providers/api_service.dart';

class TabletSystemSettingsPage extends StatefulWidget {
  const TabletSystemSettingsPage({super.key});

  @override
  State<TabletSystemSettingsPage> createState() =>
      _TabletSystemSettingsPageState();
}

class _TabletSystemSettingsPageState extends State<TabletSystemSettingsPage> {
  final _baseUrlController =
      TextEditingController(text: 'https://opencode.ai/inference/go');
  final _apiKeyController = TextEditingController();
  bool _loading = true;
  bool _busy = false;
  bool _enabled = false;
  bool _apiKeySet = false;
  String? _apiKeyHint;
  String? _defaultModel;
  String? _message;
  bool _messageOk = false;
  List<Map<String, dynamic>> _models = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _baseUrlController.dispose();
    _apiKeyController.dispose();
    super.dispose();
  }

  Map<String, dynamic> _payload(dynamic response) {
    final body = response.data;
    if (body is Map && body['data'] is Map) {
      return Map<String, dynamic>.from(body['data'] as Map);
    }
    return const {};
  }

  String _errorMessage(Object error) {
    if (error is DioException && error.response?.data is Map) {
      return (error.response!.data as Map)['message']?.toString() ??
          'Permintaan gagal.';
    }
    return 'Tidak dapat terhubung ke server.';
  }

  void _apply(Map<String, dynamic> data) {
    final rawModels = data['models'];
    final models = rawModels is List
        ? rawModels
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
        : <Map<String, dynamic>>[];
    final selected = data['default_model']?.toString() ?? '';
    setState(() {
      _baseUrlController.text =
          data['base_url']?.toString() ?? 'https://opencode.ai/inference/go';
      _enabled = data['enabled'] == true || data['enabled'] == 1;
      _apiKeySet = data['api_key_set'] == true || data['api_key_set'] == 1;
      _apiKeyHint = data['api_key_hint']?.toString();
      _models = models;
      _defaultModel = models.any((model) => model['id']?.toString() == selected)
          ? selected
          : (models.isNotEmpty ? models.first['id']?.toString() : null);
      _apiKeyController.clear();
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final response = await ApiService().get('/v2/settings/llm/opencode-go');
      _apply(_payload(response));
    } catch (error) {
      if (mounted) {
        setState(() {
          _message = _errorMessage(error);
          _messageOk = false;
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, dynamic> _connectionPayload() => {
        'base_url': _baseUrlController.text.trim(),
        if (_apiKeyController.text.trim().isNotEmpty)
          'api_key': _apiKeyController.text.trim(),
      };

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final response =
          await ApiService().put('/v2/settings/llm/opencode-go', data: {
        ..._connectionPayload(),
        'enabled': _enabled,
        if (_defaultModel != null) 'default_model': _defaultModel,
        'sync_models':
            _apiKeyController.text.trim().isNotEmpty || _models.isEmpty,
      });
      _apply(_payload(response));
      setState(() {
        _message =
            'Konfigurasi disimpan. Model default: ${_defaultModel ?? '-'}.';
        _messageOk = true;
      });
    } catch (error) {
      setState(() {
        _message = _errorMessage(error);
        _messageOk = false;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _syncModels() async {
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final response = await ApiService().post(
          '/v2/settings/llm/opencode-go/sync-models',
          data: _connectionPayload());
      _apply(_payload(response));
      setState(() {
        _message =
            '${_models.length} model ditemukan. Model default dipilih otomatis.';
        _messageOk = true;
      });
    } catch (error) {
      setState(() {
        _message = _errorMessage(error);
        _messageOk = false;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _test() async {
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final response = await ApiService().post(
          '/v2/settings/llm/opencode-go/test',
          data: _connectionPayload());
      final data = _payload(response);
      setState(() {
        _message = data['message']?.toString() ?? 'Koneksi berhasil.';
        _messageOk = true;
      });
    } catch (error) {
      setState(() {
        _message = _errorMessage(error);
        _messageOk = false;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  InputDecoration _decoration(String label, {String? hint}) => InputDecoration(
        labelText: label,
        hintText: hint,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: Color(0xFFE2E8F0))),
        filled: true,
        fillColor: Colors.white,
      );

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 880),
          child: Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: const BorderSide(color: Color(0xFFE2E8F0))),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                            color: const Color(0xFFEEF2FF),
                            borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.smart_toy_outlined,
                            color: Color(0xFF4F46E5))),
                    const SizedBox(width: 12),
                    const Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text('LLM OpenCode Go',
                              style: TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.w700)),
                          SizedBox(height: 3),
                          Text(
                              'API key terenkripsi di server dan tidak disimpan pada tablet.',
                              style: TextStyle(
                                  fontSize: 13, color: Color(0xFF64748B))),
                        ])),
                    Switch(
                        value: _enabled,
                        onChanged: _busy
                            ? null
                            : (value) => setState(() => _enabled = value)),
                    const Text('Aktifkan'),
                  ]),
                  if (_message != null) ...[
                    const SizedBox(height: 18),
                    Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                            color: _messageOk
                                ? const Color(0xFFECFDF5)
                                : const Color(0xFFFFF1F2),
                            borderRadius: BorderRadius.circular(9),
                            border: Border.all(
                                color: _messageOk
                                    ? const Color(0xFFA7F3D0)
                                    : const Color(0xFFFECDD3))),
                        child: Text(_message!,
                            style: TextStyle(
                                color: _messageOk
                                    ? const Color(0xFF047857)
                                    : const Color(0xFFBE123C)))),
                  ],
                  const SizedBox(height: 22),
                  TextField(
                      controller: _baseUrlController,
                      enabled: !_busy,
                      decoration: _decoration('Base URL',
                          hint: 'https://opencode.ai/inference/go')),
                  const SizedBox(height: 16),
                  TextField(
                      controller: _apiKeyController,
                      enabled: !_busy,
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                      onChanged: (_) => setState(() {}),
                      decoration: _decoration('API Key',
                          hint: _apiKeySet
                              ? '${_apiKeyHint ?? '••••'} tersimpan — kosongkan bila tidak diubah'
                              : 'Masukkan API key OpenCode')),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    key: ValueKey(
                        'opencode-model-${_defaultModel ?? 'none'}-${_models.length}'),
                    initialValue: _defaultModel,
                    decoration: _decoration('Model Default'),
                    hint: const Text('Deteksi model terlebih dahulu'),
                    items: _models.map((model) {
                      final id = model['id']?.toString() ?? '';
                      final name = model['name']?.toString() ?? id;
                      return DropdownMenuItem(
                          value: id,
                          child: Text(name == id ? id : '$name — $id',
                              overflow: TextOverflow.ellipsis));
                    }).toList(),
                    onChanged: _busy || _models.isEmpty
                        ? null
                        : (value) => setState(() => _defaultModel = value),
                  ),
                  const SizedBox(height: 8),
                  Text(
                      _models.isEmpty
                          ? 'Isi API key lalu tekan Deteksi Model.'
                          : '${_models.length} model tersedia.',
                      style: const TextStyle(
                          fontSize: 12, color: Color(0xFF64748B))),
                  const SizedBox(height: 22),
                  Wrap(spacing: 10, runSpacing: 10, children: [
                    FilledButton.icon(
                        onPressed: _busy ? null : _save,
                        icon: _busy
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.save_outlined),
                        label: const Text('Simpan & Terapkan')),
                    OutlinedButton.icon(
                        onPressed: _busy ||
                                (!_apiKeySet &&
                                    _apiKeyController.text.trim().isEmpty)
                            ? null
                            : _syncModels,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Deteksi Model')),
                    TextButton.icon(
                        onPressed: _busy ||
                                (!_apiKeySet &&
                                    _apiKeyController.text.trim().isEmpty)
                            ? null
                            : _test,
                        icon: const Icon(Icons.wifi_tethering_outlined),
                        label: const Text('Uji Koneksi')),
                  ]),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
