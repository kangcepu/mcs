import 'dart:async';

import 'package:dio/dio.dart' as dio;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../../core/routes/app_routes.dart';
import '../../../core/utils/wo_status.dart';
import '../../../data/providers/api_service.dart';

const _brand = Color(0xFF1B54E0);
const _ink = Color(0xFF0F172A);
const _muted = Color(0xFF64748B);
const _line = Color(0xFFE2E8F0);
const _danger = Color(0xFFE11D48);

const _validationTabs = <String>{
  'validation_pending',
  'validation_approval',
  'validation_returned',
  'validation_close_review',
  'ncr_due',
};

class _CategoryMeta {
  final String key;
  final String fallbackLabel;
  final String emptyMessage;
  final IconData icon;

  const _CategoryMeta({
    required this.key,
    required this.fallbackLabel,
    required this.emptyMessage,
    required this.icon,
  });
}

const _categories = <_CategoryMeta>[
  _CategoryMeta(
    key: 'validation_pending',
    fallbackLabel: 'Menunggu Validasi',
    emptyMessage: 'Tidak ada transaksi yang menunggu validasi Anda.',
    icon: Icons.fact_check_outlined,
  ),
  _CategoryMeta(
    key: 'validation_approval',
    fallbackLabel: 'Menunggu Approval',
    emptyMessage: 'Tidak ada hasil validasi yang menunggu approval Anda.',
    icon: Icons.approval_outlined,
  ),
  _CategoryMeta(
    key: 'validation_returned',
    fallbackLabel: 'Dikembalikan ke Saya',
    emptyMessage: 'Tidak ada pekerjaan yang dikembalikan kepada Anda.',
    icon: Icons.replay_outlined,
  ),
  _CategoryMeta(
    key: 'validation_close_review',
    fallbackLabel: 'Menunggu Close Review',
    emptyMessage: 'Tidak ada transaksi yang menunggu close review.',
    icon: Icons.task_alt_outlined,
  ),
  _CategoryMeta(
    key: 'ncr_due',
    fallbackLabel: 'NCR Due',
    emptyMessage: 'Tidak ada NCR aktif yang ditugaskan kepada Anda.',
    icon: Icons.report_problem_outlined,
  ),
  _CategoryMeta(
    key: 'wo_approvals',
    fallbackLabel: 'Approve WO',
    emptyMessage: 'Tidak ada WO yang menunggu persetujuan Anda.',
    icon: Icons.verified_outlined,
  ),
  _CategoryMeta(
    key: 'wo_closings',
    fallbackLabel: 'Tutup WO',
    emptyMessage: 'Tidak ada WO yang menunggu ditutup.',
    icon: Icons.check_circle_outline,
  ),
  _CategoryMeta(
    key: 'materials',
    fallbackLabel: 'Part Perlu Diisi',
    emptyMessage: 'Tidak ada request part yang menunggu.',
    icon: Icons.inventory_2_outlined,
  ),
  _CategoryMeta(
    key: 'wo_todo',
    fallbackLabel: 'WO Belum Dikerjakan',
    emptyMessage: 'Tidak ada WO yang belum Anda kerjakan.',
    icon: Icons.checklist_outlined,
  ),
  _CategoryMeta(
    key: 'preventive_missing',
    fallbackLabel: 'Asset Belum Terjadwal',
    emptyMessage:
        'Semua asset Maintenance di area Anda sudah memiliki jadwal preventive aktif.',
    icon: Icons.event_busy_outlined,
  ),
  _CategoryMeta(
    key: 'asset_missing_pic',
    fallbackLabel: 'Aset Belum Memiliki PIC',
    emptyMessage: 'Semua aset aktif sudah memiliki PIC utama.',
    icon: Icons.person_off_outlined,
  ),
  _CategoryMeta(
    key: 'stock_opname_schedule',
    fallbackLabel: 'Jadwal Stock Opname',
    emptyMessage: 'Tidak ada jadwal Stock Opname untuk Anda.',
    icon: Icons.event_note_outlined,
  ),
  _CategoryMeta(
    key: 'stock_opname_unlocked',
    fallbackLabel: 'SO Belum Dikunci',
    emptyMessage: 'Semua Stock Opname sudah dikunci.',
    icon: Icons.lock_open_outlined,
  ),
];

const _moduleRoutes = <String, String>{
  'wo_it': AppRoutes.woDetail,
  'wo_mtc': AppRoutes.woMtcDetail,
  'wo_operational': AppRoutes.woOperationalDetail,
  'wo_preventive': AppRoutes.woProductionDetail,
  'wo_ga': AppRoutes.woGaDetail,
  'is': AppRoutes.woDetail,
  'meso': AppRoutes.woMtcDetail,
  'maintenance': AppRoutes.woOperationalDetail,
  'production': AppRoutes.woProductionDetail,
  'ga': AppRoutes.woGaDetail,
};

/// My Work versi tablet. Data dan aturan audience berasal dari endpoint yang
/// sama dengan halaman web sehingga daftar tetap personal sesuai hak akses.
class TabletMyWorkPage extends StatefulWidget {
  const TabletMyWorkPage({super.key});

  @override
  State<TabletMyWorkPage> createState() => _TabletMyWorkPageState();
}

class _TabletMyWorkPageState extends State<TabletMyWorkPage> {
  final _searchController = TextEditingController();
  Timer? _searchDebounce;

  String _tab = _categories.first.key;
  String _query = '';
  int _page = 1;
  int _perPage = 10;
  int _total = 0;
  int _totalPages = 1;
  int _allPending = 0;

  bool _summaryLoading = true;
  bool _loading = true;
  bool _fetching = false;
  bool _acting = false;
  bool _wideLayout = false;
  String? _error;

  List<Map<String, dynamic>> _summaryCategories = [];
  List<Map<String, dynamic>> _rows = [];
  Map<String, dynamic>? _selected;
  Map<String, dynamic>? _validationDetail;

  _CategoryMeta get _activeMeta =>
      _categories.firstWhere((category) => category.key == _tab);

  @override
  void initState() {
    super.initState();
    _reloadAll();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _reloadAll() async {
    await Future.wait([_loadSummary(), _loadList()]);
  }

  Future<void> _loadSummary() async {
    if (mounted) setState(() => _summaryLoading = true);
    try {
      final response = await ApiService().get('/v2/my-work/summary');
      final body = response.data;
      if (body is! Map || (body['success'] != true && body['status'] != true)) {
        throw Exception(body is Map ? body['message'] : 'Response tidak valid');
      }
      final data = body['data'] is Map
          ? Map<String, dynamic>.from(body['data'] as Map)
          : <String, dynamic>{};
      final categories = (data['categories'] as List? ?? const [])
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
      if (!mounted) return;
      setState(() {
        _summaryCategories = categories;
        _allPending = _asInt(data['total']);
        _summaryLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _summaryLoading = false);
    }
  }

  Future<void> _loadList() async {
    if (mounted) {
      setState(() {
        _loading = _rows.isEmpty;
        _fetching = true;
        _error = null;
      });
    }
    try {
      final response = await ApiService().get(
        '/v2/my-work/list',
        queryParameters: {
          'category': _tab,
          'page': _page,
          'per_page': _perPage,
          if (_query.isNotEmpty) 'q': _query,
        },
      );
      final body = response.data;
      if (body is! Map || (body['success'] != true && body['status'] != true)) {
        throw Exception(body is Map ? body['message'] : 'Response tidak valid');
      }
      final rows = (body['data'] as List? ?? const [])
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
      final meta = body['meta'] is Map ? body['meta'] as Map : const {};
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _total = _asInt(meta['total'], fallback: rows.length);
        _totalPages = _asInt(meta['total_pages'], fallback: 1).clamp(1, 999999);
        _selected = rows.isEmpty ? null : rows.first;
        _validationDetail = null;
        _loading = false;
        _fetching = false;
      });
      if (_selectedValidationId != null) unawaited(_loadValidationDetail());
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _loading = false;
        _fetching = false;
      });
    }
  }

  void _changeTab(String tab) {
    if (_tab == tab) return;
    _searchDebounce?.cancel();
    _searchController.clear();
    setState(() {
      _tab = tab;
      _query = '';
      _page = 1;
      _rows = [];
      _selected = null;
      _validationDetail = null;
    });
    _loadList();
  }

  void _onSearch(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      setState(() {
        _query = value.trim();
        _page = 1;
      });
      _loadList();
    });
  }

  Future<void> _select(Map<String, dynamic> row) async {
    setState(() { _selected = row; _validationDetail = null; });
    if (_selectedValidationId != null) await _loadValidationDetail();
    if (!_wideLayout && mounted) await _showCompactDetail(row);
  }

  Future<void> _loadValidationDetail() async {
    final id = _selectedValidationId;
    if (id == null) return;
    try {
      final response = await ApiService().get('/v2/validation/requests/$id');
      final body = response.data;
      if (!mounted || body is! Map || body['data'] is! Map || _selectedValidationId != id) return;
      setState(() => _validationDetail = Map<String, dynamic>.from(body['data'] as Map));
    } catch (_) {
      // Antrean tetap dapat diproses; detail exception akan muncul setelah refresh.
    }
  }

  Future<void> _showCompactDetail(Map<String, dynamic> row) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      constraints: BoxConstraints(
        maxWidth: 680,
        maxHeight: MediaQuery.sizeOf(context).height * .82,
      ),
      builder: (_) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: _buildDetailContent(row, compact: true),
        ),
      ),
    );
  }

  Future<void> _confirmDecision(String decision) async {
    final row = _selected;
    if (row == null || _acting) return;
    final label = switch (decision) {
      'approve' => 'Setujui',
      'close' => 'Tutup WO',
      _ => 'Tolak',
    };
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('$label?'),
        content: Text('$label untuk ${_title(row)} — ${_subtitle(row)}.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            style: decision == 'reject'
                ? FilledButton.styleFrom(backgroundColor: _danger)
                : null,
            onPressed: () => Navigator.pop(context, true),
            child: Text(label),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _acting = true);
    try {
      final response = await ApiService().post(
        '/v2/approval-center/wo-$decision',
        data: {
          'module': '${row['module_key'] ?? row['module'] ?? ''}',
          'wo_number': '${row['wo_number'] ?? ''}',
        },
      );
      final body = response.data;
      if (body is! Map || body['success'] != true) {
        throw Exception(body is Map ? body['message'] : 'Aksi gagal diproses');
      }
      Get.snackbar(
        'My Work',
        '$label berhasil',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFF15803D),
        colorText: Colors.white,
        margin: const EdgeInsets.all(16),
      );
      if (mounted) setState(() => _selected = null);
      await _reloadAll();
    } catch (error) {
      Get.snackbar(
        'My Work',
        error.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: _danger,
        colorText: Colors.white,
        margin: const EdgeInsets.all(16),
      );
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  void _openSelected() {
    final row = _selected;
    if (row == null) return;
    if (_tab == 'preventive_missing' || _tab == 'asset_missing_pic') {
      Get.toNamed(AppRoutes.reportAssetDetail, arguments: {'row': row});
      return;
    }
    if (_tab == 'stock_opname_unlocked') {
      Get.toNamed(AppRoutes.stockOpnameList);
      return;
    }
    if (_tab == 'stock_opname_schedule') {
      Get.toNamed(AppRoutes.stockOpnameList);
      return;
    }
    if (_validationTabs.contains(_tab)) {
      Get.snackbar(
        'Detail validasi',
        'Antrean sudah tersedia. Aksi keputusan dan evidence akan tersedia pada tahap berikutnya.',
        snackPosition: SnackPosition.BOTTOM,
      );
      return;
    }
    if (_tab == 'materials') return;

    final module = '${row['module_key'] ?? row['module'] ?? ''}';
    final route = _moduleRoutes[module];
    final woNumber = '${row['wo_number'] ?? ''}'.trim();
    if (route == null || woNumber.isEmpty) {
      Get.snackbar(
        'Detail tidak tersedia',
        'Modul work order tidak dikenali.',
        snackPosition: SnackPosition.BOTTOM,
      );
      return;
    }
    Get.toNamed(route, arguments: {'wo_number': woNumber});
  }

  int? get _selectedValidationId {
    final raw = _selected?['validation_id'];
    if (raw is int && raw > 0) return raw;
    return int.tryParse('${raw ?? ''}');
  }

  Future<void> _validationDecision(String action) async {
    final id = _selectedValidationId;
    if (id == null || _acting) return;
    final controller = TextEditingController();
    final needsReason = action == 'RETURN' || action == 'REJECT';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(switch (action) {
          'APPROVE' => _tab == 'validation_approval'
              ? 'Approve validasi?'
              : 'Selesaikan validasi?',
          'RESUBMIT' => 'Kirim ulang request?',
          'RETURN' => 'Kembalikan ke maker?',
          _ => 'Tolak request?',
        }),
        content: TextField(
          controller: controller,
          minLines: 3,
          maxLines: 6,
          decoration: InputDecoration(
            labelText: needsReason ? 'Alasan (wajib)' : 'Catatan',
            hintText: needsReason
                ? 'Minimal 5 karakter'
                : 'Catatan keputusan (opsional)',
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Simpan')),
        ],
      ),
    );
    final note = controller.text.trim();
    controller.dispose();
    if (confirmed != true) return;
    if (needsReason && note.length < 5) {
      Get.snackbar(
          'Alasan belum lengkap', 'Masukkan alasan minimal 5 karakter.',
          snackPosition: SnackPosition.BOTTOM);
      return;
    }
    setState(() => _acting = true);
    try {
      final response = await ApiService().post(
          '/v2/validation/requests/$id/decision',
          data: {'action': action, 'note': note});
      final body = response.data;
      if (body is! Map || body['success'] != true) {
        throw Exception(
            body is Map ? body['message'] : 'Keputusan gagal disimpan.');
      }
      Get.snackbar('Validation Engine',
          '${body['message'] ?? 'Keputusan berhasil disimpan.'}',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFF15803D),
          colorText: Colors.white);
      if (mounted) setState(() => _selected = null);
      await _reloadAll();
    } catch (error) {
      Get.snackbar(
          'Aksi gagal', error.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: _danger,
          colorText: Colors.white);
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _uploadValidationEvidence() async {
    final id = _selectedValidationId;
    if (id == null || _acting) return;
    final picked = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'txt'],
    );
    if (picked == null || picked.files.isEmpty) return;
    final files = <dio.MultipartFile>[];
    for (final file in picked.files) {
      if (file.path == null) continue;
      files.add(
          await dio.MultipartFile.fromFile(file.path!, filename: file.name));
    }
    if (files.isEmpty) return;
    setState(() => _acting = true);
    try {
      final response = await ApiService().post(
        '/v2/validation/requests/$id/evidence',
        data: dio.FormData.fromMap(
            {'evidence_type': 'SUPPORTING', 'files': files}),
      );
      final body = response.data;
      if (body is! Map || body['success'] != true) {
        throw Exception(
            body is Map ? body['message'] : 'Upload evidence gagal.');
      }
      Get.snackbar('Validation Engine', 'Evidence berhasil diunggah.',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFF15803D),
          colorText: Colors.white);
    } catch (error) {
      Get.snackbar(
          'Upload gagal', error.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: _danger,
          colorText: Colors.white);
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _assignAssetPic() async {
    final row = _selected;
    if (row == null) return;
    final user = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _MyWorkPicDialog(),
    );
    if (user == null || !mounted) return;
    final assetCode = '${row['asset_code'] ?? ''}'.trim();
    try {
      setState(() => _acting = true);
      final response = await ApiService().patch(
        '/v2/assets/detail',
        queryParameters: {'asset': assetCode},
        data: {'asset': assetCode, 'pic_user_id': user['id_user']},
      );
      final body = response.data;
      if (body is! Map || (body['success'] != true && body['status'] != true)) {
        throw Exception(body is Map ? body['message'] : 'Gagal menyimpan PIC.');
      }
      Get.snackbar(
          'My Work', 'PIC aset berhasil ditetapkan ke ${user['fullname']}',
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: const Color(0xFF15803D),
          colorText: Colors.white);
      if (mounted) setState(() => _selected = null);
      await _reloadAll();
    } catch (error) {
      Get.snackbar('My Work', error.toString().replaceFirst('Exception: ', ''),
          snackPosition: SnackPosition.BOTTOM,
          backgroundColor: _danger,
          colorText: Colors.white);
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      _wideLayout = constraints.maxWidth >= 880;
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildCategoryGrid(constraints.maxWidth),
            const SizedBox(height: 8),
            Text(
              _summaryLoading
                  ? 'Memuat ringkasan pekerjaan…'
                  : '$_allPending total pekerjaan tertunda di seluruh kategori.',
              style: const TextStyle(fontSize: 12, color: _muted),
            ),
            const SizedBox(height: 12),
            _buildFilterBar(),
            const SizedBox(height: 12),
            Expanded(
              child: _wideLayout
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(flex: 3, child: _buildListPanel()),
                        const SizedBox(width: 14),
                        Expanded(flex: 2, child: _buildDetailPanel()),
                      ],
                    )
                  : _buildListPanel(),
            ),
            if (_rows.isNotEmpty) ...[
              const SizedBox(height: 10),
              _buildPagination(),
            ],
          ],
        ),
      );
    });
  }

  Widget _buildCategoryGrid(double width) {
    final perRow = width >= 1040
        ? 7
        : width >= 800
            ? 5
            : width >= 650
                ? 3
                : 2;
    const gap = 8.0;
    final cardWidth = (width - ((perRow - 1) * gap)) / perRow;
    return Wrap(
      spacing: gap,
      runSpacing: gap,
      children: _categories.map((meta) {
        final active = meta.key == _tab;
        final summary = _summaryFor(meta.key);
        final count = _asInt(summary?['count']);
        final label = '${summary?['label'] ?? meta.fallbackLabel}';
        return SizedBox(
          width: cardWidth,
          child: Material(
            color: active ? const Color(0xFFEFF4FF) : Colors.white,
            borderRadius: BorderRadius.circular(9),
            child: InkWell(
              borderRadius: BorderRadius.circular(9),
              onTap: () => _changeTab(meta.key),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(color: active ? _brand : _line),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: count > 0
                            ? const Color(0xFFFFF7ED)
                            : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(7),
                      ),
                      child: Icon(
                        meta.icon,
                        size: 16,
                        color: count > 0
                            ? const Color(0xFFEA580C)
                            : const Color(0xFF94A3B8),
                      ),
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 10.5,
                              height: 1.2,
                              fontWeight: FontWeight.w600,
                              color: _muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      constraints: const BoxConstraints(minWidth: 24),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: count > 0 ? const Color(0xFFFFEDD5) : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        _summaryLoading ? '…' : '$count',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: count > 0 ? const Color(0xFFC2410C) : _muted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _line),
      ),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 38,
              child: TextField(
                controller: _searchController,
                onChanged: _onSearch,
                style: const TextStyle(fontSize: 13),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: 'Cari No. WO, No. SO, asset, atau deskripsi…',
                  hintStyle:
                      const TextStyle(fontSize: 12.5, color: Color(0xFF94A3B8)),
                  prefixIcon: const Icon(Icons.search,
                      size: 18, color: Color(0xFF94A3B8)),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Hapus pencarian',
                          onPressed: () {
                            _searchController.clear();
                            setState(() {
                              _query = '';
                              _page = 1;
                            });
                            _loadList();
                          },
                          icon: const Icon(Icons.close, size: 17),
                        ),
                  border: _inputBorder(),
                  enabledBorder: _inputBorder(),
                  focusedBorder: _inputBorder(color: _brand),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.outlined(
            tooltip: 'Muat ulang',
            onPressed: _fetching ? null : _reloadAll,
            icon: _fetching
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh, size: 19),
          ),
        ],
      ),
    );
  }

  OutlineInputBorder _inputBorder({Color color = _line}) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: color),
      );

  Widget _buildListPanel() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _line),
      ),
      clipBehavior: Clip.antiAlias,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildError()
              : _rows.isEmpty
                  ? _buildEmpty()
                  : ListView.separated(
                      itemCount: _rows.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final row = _rows[index];
                        final active = identical(_selected, row);
                        return Material(
                          color: active && _wideLayout
                              ? const Color(0xFFEFF4FF)
                              : Colors.white,
                          child: InkWell(
                            onTap: () => _select(row),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 12,
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _title(row),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w700,
                                            color: _ink,
                                          ),
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          _subtitle(row),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 11.5,
                                            height: 1.25,
                                            color: _muted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  if ('${row['status'] ?? ''}'.isNotEmpty)
                                    _status(row['status'])
                                  else
                                    const Icon(
                                      Icons.chevron_right,
                                      size: 19,
                                      color: Color(0xFF94A3B8),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
    );
  }

  Widget _buildDetailPanel() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _line),
      ),
      child: _selected == null
          ? const Center(
              child: Text(
                'Pilih salah satu pekerjaan untuk melihat detailnya.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12.5, color: Color(0xFF94A3B8)),
              ),
            )
          : SingleChildScrollView(child: _buildDetailContent(_selected!)),
    );
  }

  Widget _buildDetailContent(
    Map<String, dynamic> row, {
    bool compact = false,
  }) {
    final fields = _detailFields(row);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _title(row),
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: _ink,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _subtitle(row),
          style: const TextStyle(fontSize: 12, height: 1.35, color: _muted),
        ),
        const SizedBox(height: 16),
        ...fields.map(
          (field) => Padding(
            padding: const EdgeInsets.only(bottom: 11),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: compact ? 130 : 105,
                  child: Text(
                    field.key,
                    style: const TextStyle(fontSize: 11.5, color: _muted),
                  ),
                ),
                Expanded(
                  child: Text(
                    field.value,
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF334155),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_validationTabs.contains(_tab) && ((_validationDetail?['exceptions'] as List?)?.isNotEmpty ?? false)) ...[
          const SizedBox(height: 4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              border: Border.all(color: const Color(0xFFFDE68A)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Exception wajib diperiksa (${(_validationDetail!['exceptions'] as List).length})',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Color(0xFF92400E))),
                const SizedBox(height: 8),
                ...(_validationDetail!['exceptions'] as List).whereType<Map>().map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 7),
                  child: Text(
                    '• ${item['exception_type'] ?? 'EXCEPTION'} — ${item['exception_summary'] ?? item['description'] ?? '-'}',
                    style: const TextStyle(fontSize: 11.5, height: 1.3, color: Color(0xFF78350F)),
                  ),
                )),
              ],
            ),
          ),
        ],
        const Divider(height: 24),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (_tab == 'wo_approvals') ...[
              FilledButton.icon(
                onPressed: _acting ? null : () => _confirmDecision('approve'),
                icon: const Icon(Icons.check, size: 17),
                label: const Text('Setujui'),
              ),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: _danger),
                onPressed: _acting ? null : () => _confirmDecision('reject'),
                icon: const Icon(Icons.close, size: 17),
                label: const Text('Tolak'),
              ),
            ] else if (_tab == 'wo_closings') ...[
              FilledButton.icon(
                onPressed: _acting ? null : () => _confirmDecision('close'),
                icon: const Icon(Icons.check, size: 17),
                label: const Text('Tutup WO'),
              ),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: _danger),
                onPressed: _acting ? null : () => _confirmDecision('reject'),
                icon: const Icon(Icons.close, size: 17),
                label: const Text('Tolak'),
              ),
            ] else if (_tab == 'asset_missing_pic') ...[
              FilledButton.icon(
                onPressed: _acting ? null : _assignAssetPic,
                icon: const Icon(Icons.person_add_alt_1, size: 17),
                label: const Text('Tetapkan PIC'),
              ),
            ] else if (_validationTabs.contains(_tab) &&
                _tab != 'ncr_due' &&
                _selectedValidationId != null) ...[
              OutlinedButton.icon(
                onPressed: _acting ? null : _uploadValidationEvidence,
                icon: const Icon(Icons.upload_file_outlined, size: 17),
                label: const Text('Evidence'),
              ),
              if (_tab == 'validation_returned')
                FilledButton.icon(
                  onPressed:
                      _acting ? null : () => _validationDecision('RESUBMIT'),
                  icon: const Icon(Icons.replay_outlined, size: 17),
                  label: const Text('Kirim Ulang'),
                )
              else ...[
                FilledButton.icon(
                  onPressed:
                      _acting ? null : () => _validationDecision('APPROVE'),
                  icon: const Icon(Icons.check, size: 17),
                  label: Text(
                      _tab == 'validation_approval' ? 'Approve' : 'Validasi'),
                ),
                OutlinedButton.icon(
                  onPressed:
                      _acting ? null : () => _validationDecision('RETURN'),
                  icon: const Icon(Icons.replay_outlined, size: 17),
                  label: const Text('Kembalikan'),
                ),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: _danger),
                  onPressed:
                      _acting ? null : () => _validationDecision('REJECT'),
                  icon: const Icon(Icons.close, size: 17),
                  label: const Text('Tolak'),
                ),
              ],
            ],
            if (_tab != 'materials' && !_validationTabs.contains(_tab))
              OutlinedButton.icon(
                onPressed: _openSelected,
                icon: const Icon(Icons.open_in_new, size: 16),
                label: Text(_openLabel),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildError() => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 36, color: _danger),
              const SizedBox(height: 10),
              Text(
                _error ?? 'Gagal memuat data',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12.5, color: _muted),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                  onPressed: _loadList, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );

  Widget _buildEmpty() => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(_activeMeta.icon, size: 38, color: const Color(0xFFCBD5E1)),
              const SizedBox(height: 10),
              const Text(
                'Tidak ada pekerjaan',
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF334155),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _activeMeta.emptyMessage,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
        ),
      );

  Widget _buildPagination() {
    return Row(
      children: [
        Text(
          '$_total item · Halaman $_page dari $_totalPages',
          style: const TextStyle(fontSize: 12, color: _muted),
        ),
        const Spacer(),
        DropdownButton<int>(
          value: _perPage,
          underline: const SizedBox.shrink(),
          style: const TextStyle(fontSize: 12, color: Color(0xFF334155)),
          items: const [10, 20, 50]
              .map((value) => DropdownMenuItem(
                    value: value,
                    child: Text('$value / halaman'),
                  ))
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            setState(() {
              _perPage = value;
              _page = 1;
            });
            _loadList();
          },
        ),
        const SizedBox(width: 8),
        IconButton.outlined(
          tooltip: 'Halaman sebelumnya',
          onPressed: _page <= 1
              ? null
              : () {
                  setState(() => _page--);
                  _loadList();
                },
          icon: const Icon(Icons.chevron_left, size: 19),
        ),
        const SizedBox(width: 6),
        IconButton.outlined(
          tooltip: 'Halaman berikutnya',
          onPressed: _page >= _totalPages
              ? null
              : () {
                  setState(() => _page++);
                  _loadList();
                },
          icon: const Icon(Icons.chevron_right, size: 19),
        ),
      ],
    );
  }

  Widget _status(dynamic raw) {
    final info = woStatusInfo('$raw');
    return Container(
      constraints: const BoxConstraints(maxWidth: 130),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: info.bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        info.label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          color: info.fg,
        ),
      ),
    );
  }

  Map<String, dynamic>? _summaryFor(String key) {
    for (final category in _summaryCategories) {
      if ('${category['key']}' == key) return category;
    }
    return null;
  }

  String _title(Map<String, dynamic> row) {
    if (_validationTabs.contains(_tab)) {
      return '${row['source_reference'] ?? row['request_number'] ?? row['title'] ?? '-'}';
    }
    if (_tab == 'preventive_missing' || _tab == 'asset_missing_pic') {
      return '${row['asset_name'] ?? row['asset_code'] ?? '-'}';
    }
    if (_tab == 'stock_opname_unlocked') return '${row['no_so'] ?? '-'}';
    if (_tab == 'stock_opname_schedule') {
      return '${row['schedule_name'] ?? 'Jadwal Stock Opname'}';
    }
    return '${row['wo_number'] ?? row['request_code'] ?? '-'}';
  }

  String _subtitle(Map<String, dynamic> row) {
    if (_validationTabs.contains(_tab)) {
      final values = [
        row['title'],
        row['module_code'],
        row['company'],
        row['maker_name'] == null ? null : 'maker ${row['maker_name']}',
      ];
      final text = values
          .where((value) => value != null && '$value'.trim().isNotEmpty)
          .join(' · ');
      return text.isEmpty ? '-' : text;
    }
    final values = switch (_tab) {
      'preventive_missing' => [
          row['asset_code'],
          row['mtc_area_label'],
          row['location'],
        ],
      'asset_missing_pic' => [
          row['asset_code'],
          row['company'],
          row['location'],
        ],
      'stock_opname_unlocked' => [row['type'], _date(row['tanggal'])],
      'stock_opname_schedule' => [
          row['next_run_date'] == null
              ? null
              : 'Berikutnya ${_date(row['next_run_date'])}',
          _asInt(row['is_bom']) == 1 ? 'BOM / Part' : 'Asset',
          row['no_so'],
        ],
      'materials' => [
          row['job_title'],
          row['requested_by_name'] == null
              ? null
              : 'diminta ${row['requested_by_name']}',
        ],
      _ => [row['job_title'], row['asset_name']],
    };
    final text = values
        .where((value) => value != null && '$value'.trim().isNotEmpty)
        .join(' · ');
    return text.isEmpty ? '-' : text;
  }

  List<MapEntry<String, String>> _detailFields(Map<String, dynamic> row) {
    if (_validationTabs.contains(_tab)) {
      return [
        MapEntry('Referensi', _value(row['source_reference'])),
        MapEntry('Modul', _value(row['module_code'])),
        MapEntry(
          'Company / Site',
          [row['company'], row['site_id']]
              .where((value) => value != null && '$value'.trim().isNotEmpty)
              .join(' · '),
        ),
        MapEntry('Asset', _value(row['asset_code'])),
        MapEntry('Maker', _value(row['maker_name'])),
        MapEntry('Risiko', _value(row['risk_level'])),
        MapEntry('Status', _value(row['status'])),
        MapEntry('Diajukan', _dateTime(row['submitted_at'])),
        MapEntry('Batas waktu', _dateTime(row['due_at'])),
        if ('${row['return_reason'] ?? ''}'.trim().isNotEmpty)
          MapEntry('Alasan kembali', _value(row['return_reason'])),
      ];
    }
    if (_tab == 'preventive_missing') {
      return [
        MapEntry('Asset Code', _value(row['asset_code'])),
        MapEntry('Area MTC', _value(row['mtc_area_label'])),
        MapEntry('Company', _value(row['company'])),
        MapEntry('Lokasi', _value(row['location'])),
        const MapEntry('Status', 'Belum terjadwal'),
      ];
    }
    if (_tab == 'asset_missing_pic') {
      return [
        MapEntry('Asset Code', _value(row['asset_code'])),
        MapEntry('Kategori', _value(row['category'])),
        MapEntry('Company', _value(row['company'])),
        MapEntry('Lokasi', _value(row['location'])),
        const MapEntry('Status', 'PIC belum diisi'),
      ];
    }
    if (_tab == 'stock_opname_unlocked') {
      return [
        MapEntry('No. SO', _value(row['no_so'])),
        MapEntry('Tipe', _value(row['type'])),
        MapEntry('Tanggal', _date(row['tanggal'])),
        const MapEntry('Status', 'Belum dikunci'),
      ];
    }
    if (_tab == 'stock_opname_schedule') {
      return [
        MapEntry('Jadwal', _value(row['schedule_name'])),
        MapEntry('No. SO terakhir', _value(row['no_so'])),
        MapEntry('Jatuh tempo', _date(row['next_run_date'])),
        MapEntry('Objek', _asInt(row['is_bom']) == 1 ? 'BOM / Part' : 'Asset'),
        MapEntry('Status run', _value(row['run_status'])),
      ];
    }
    if (_tab == 'materials') {
      return [
        MapEntry('No. WO', _value(row['wo_number'])),
        MapEntry('Request', _value(row['request_code'])),
        MapEntry('Deskripsi', _value(row['job_title'])),
        MapEntry('Diminta oleh', _value(row['requested_by_name'])),
        MapEntry('Status', _value(row['status'])),
      ];
    }
    return [
      MapEntry('No. WO', _value(row['wo_number'])),
      MapEntry('Modul', _value(row['module_label'] ?? row['module'])),
      MapEntry('Aset', _value(row['asset_name'])),
      MapEntry('Company', _value(row['company'])),
      MapEntry('Tanggal', _date(row['date'])),
      MapEntry('Status', _value(row['status'])),
    ];
  }

  String get _openLabel => switch (_tab) {
        'preventive_missing' => 'Buka Detail Asset',
        'asset_missing_pic' => 'Buka Detail Asset',
        'stock_opname_unlocked' => 'Buka Stock Opname',
        'stock_opname_schedule' => 'Buka Stock Opname',
        _ => 'Buka Detail WO',
      };

  static int _asInt(dynamic value, {int fallback = 0}) {
    if (value is num) return value.toInt();
    return int.tryParse('$value') ?? fallback;
  }

  static String _value(dynamic value) {
    final text = '${value ?? ''}'.trim();
    return text.isEmpty ? '-' : text;
  }

  static String _date(dynamic value) {
    final raw = '${value ?? ''}'.trim();
    if (raw.isEmpty) return '-';
    final parsed = DateTime.tryParse(raw);
    return parsed == null ? raw : DateFormat('dd MMM yyyy').format(parsed);
  }

  static String _dateTime(dynamic value) {
    final raw = '${value ?? ''}'.trim();
    if (raw.isEmpty) return '-';
    final parsed = DateTime.tryParse(raw);
    return parsed == null
        ? raw
        : DateFormat('dd MMM yyyy HH:mm').format(parsed);
  }
}

class _MyWorkPicDialog extends StatefulWidget {
  const _MyWorkPicDialog();

  @override
  State<_MyWorkPicDialog> createState() => _MyWorkPicDialogState();
}

class _MyWorkPicDialogState extends State<_MyWorkPicDialog> {
  final _controller = TextEditingController();
  Timer? _debounce;
  bool _loading = false;
  List<Map<String, dynamic>> _rows = [];

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _changed(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
  }

  Future<void> _search(String raw) async {
    final q = raw.trim();
    if (q.length < 2) {
      if (mounted) setState(() => _rows = []);
      return;
    }
    setState(() => _loading = true);
    try {
      final response = await ApiService()
          .get('/v2/users/lookup', queryParameters: {'q': q, 'limit': 20});
      final body = response.data;
      final data = body is Map ? body['data'] : null;
      if (!mounted) return;
      setState(() {
        _rows = data is List
            ? data
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList()
            : [];
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Pilih PIC Utama Aset'),
        content: SizedBox(
          width: 480,
          height: 360,
          child: Column(children: [
            TextField(
                controller: _controller,
                autofocus: true,
                onChanged: _changed,
                decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: 'Cari nama atau username',
                    border: OutlineInputBorder())),
            const SizedBox(height: 12),
            if (_loading) const LinearProgressIndicator(),
            Expanded(
                child: _rows.isEmpty
                    ? const Center(
                        child: Text(
                            'Ketik minimal 2 karakter untuk mencari user aktif.'))
                    : ListView.separated(
                        itemCount: _rows.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, index) {
                          final row = _rows[index];
                          return ListTile(
                              title: Text('${row['fullname'] ?? '-'}'),
                              subtitle: Text('${row['username'] ?? ''}'),
                              onTap: () => Navigator.pop(context, row));
                        })),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Batal'))
        ],
      );
}
