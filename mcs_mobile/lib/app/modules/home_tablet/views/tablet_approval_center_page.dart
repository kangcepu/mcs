import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../../core/routes/app_routes.dart';
import '../../../core/utils/wo_status.dart';
import '../../../data/providers/api_service.dart';

/// Padanan tablet untuk `mcs_web/src/app/(app)/approval-center/page.tsx` —
/// 4 kartu ringkasan + tab (WO Approval/WO Closing/Material Request/Asset
/// Mutation), filter modul WO, tabel, dan aksi approve/reject/close yang
/// sama persis dengan web. Baris WO di-tap membuka layar detail WO native
/// per-modul yang sudah ada (belum ada layar approval native di tablet),
/// mutasi aset membuka `ReportAssetMutationDetailPage`, dan material (yang
/// di web juga cuma lihat, tanpa aksi) tampil lewat dialog ringkas.
class TabletApprovalCenterPage extends StatefulWidget {
  const TabletApprovalCenterPage({super.key});

  @override
  State<TabletApprovalCenterPage> createState() => _TabletApprovalCenterPageState();
}

class _ActionDef {
  final String key;
  final String label;
  final bool danger;
  const _ActionDef(this.key, this.label, {this.danger = false});
}

const _approve = _ActionDef('approve', 'Setujui');
const _reject = _ActionDef('reject', 'Tolak', danger: true);
const _close = _ActionDef('close', 'Tutup WO');

const List<MapEntry<String, String>> _kTabs = [
  MapEntry('wo_approvals', 'WO Approval'),
  MapEntry('wo_closings', 'WO Closing'),
  MapEntry('materials', 'Material Request'),
  MapEntry('mutations', 'Asset Mutation'),
];

const Map<String, List<_ActionDef>> _kTabActions = {
  'wo_approvals': [_approve, _reject],
  'wo_closings': [_close, _reject],
  'materials': [],
  'mutations': [_approve, _reject],
};

const Map<String, String> _kTabPath = {
  'wo_approvals': 'wo-approvals',
  'wo_closings': 'wo-closings',
  'materials': 'materials',
  'mutations': 'mutations',
};

const List<MapEntry<String, String>> _kWoModuleFilters = [
  MapEntry('', 'Semua WO'),
  MapEntry('wo_mtc', 'WO MESO'),
  MapEntry('wo_operational', 'WO MTC'),
  MapEntry('wo_it', 'WO IS'),
  MapEntry('wo_preventive', 'WO Production'),
  MapEntry('wo_ga', 'WO GA'),
];

const Map<String, String> _kApprovalToDetailRoute = {
  'wo_it': AppRoutes.woDetail,
  'wo_mtc': AppRoutes.woMtcDetail,
  'wo_operational': AppRoutes.woOperationalDetail,
  'wo_preventive': AppRoutes.woProductionDetail,
  'wo_ga': AppRoutes.woGaDetail,
};

const List<int> _kPerPageOptions = [10, 20, 50];

class _TabletApprovalCenterPageState extends State<TabletApprovalCenterPage> {
  String _tab = 'wo_approvals';
  String _woModule = '';
  String _q = '';
  int _page = 1;
  int _perPage = 20;

  final _searchCtrl = TextEditingController();
  Timer? _debounce;

  bool _loading = true;
  bool _fetching = false;
  bool _acting = false;
  String? _error;
  List<Map<String, dynamic>> _rows = [];
  int _total = 0;
  int _totalPages = 1;
  Map<String, dynamic> _summary = const {};
  bool _summaryLoading = true;

  bool get _isWoQueue => _tab == 'wo_approvals' || _tab == 'wo_closings';
  bool get _globalCanDecide => _summary['can_decide'] != false;

  @override
  void initState() {
    super.initState();
    _loadSummary();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSummary() async {
    setState(() => _summaryLoading = true);
    try {
      final res = await ApiService().get('/v2/approval-center/summary');
      final data = res.data;
      if (data['success'] == true && mounted) {
        setState(() {
          _summary = Map<String, dynamic>.from(data['data'] as Map);
          _summaryLoading = false;
        });
      } else if (mounted) {
        setState(() => _summaryLoading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _summaryLoading = false);
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = _rows.isEmpty;
      _fetching = true;
      _error = null;
    });
    try {
      final params = <String, dynamic>{
        'page': _page,
        'per_page': _perPage,
        if (_q.isNotEmpty) 'q': _q,
        if (_isWoQueue && _woModule.isNotEmpty) 'module': _woModule,
      };
      final res = await ApiService().get('/v2/approval-center/${_kTabPath[_tab]}', queryParameters: params);
      final data = res.data;
      if (data['success'] == true || data['status'] == true) {
        final list = (data['data'] as List? ?? []);
        final meta = data['meta'] as Map?;
        setState(() {
          _rows = list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          _total = meta?['total'] is num ? (meta!['total'] as num).toInt() : _rows.length;
          _totalPages = meta?['total_pages'] is num ? (meta!['total_pages'] as num).toInt() : 1;
          _loading = false;
          _fetching = false;
        });
      } else {
        setState(() {
          _error = '${data['message'] ?? 'Gagal memuat data'}';
          _loading = false;
          _fetching = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = '$e';
        _loading = false;
        _fetching = false;
      });
    }
  }

  void _setTab(String tab) {
    if (_tab == tab) return;
    setState(() {
      _tab = tab;
      _page = 1;
    });
    _load();
  }

  void _setFilter(VoidCallback mutate) {
    setState(mutate);
    _page = 1;
    _load();
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () => _setFilter(() => _q = v.trim()));
  }

  bool get _hasActiveFilters => _q.isNotEmpty || (_isWoQueue && _woModule.isNotEmpty);

  void _resetFilters() {
    _searchCtrl.clear();
    _setFilter(() {
      _q = '';
      _woModule = '';
    });
  }

  String _docNoOf(Map<String, dynamic> r) {
    for (final k in ['doc_no', 'document_no', 'wo_number', 'id']) {
      final v = r[k];
      if (v != null && v.toString().trim().isNotEmpty) return v.toString();
    }
    return '-';
  }

  String _refOf(Map<String, dynamic> r) {
    final wo = r['wo_number']?.toString() ?? '';
    return wo.isNotEmpty ? wo : _docNoOf(r);
  }

  String _titleOf(Map<String, dynamic> r) => (r['job_title'] ?? r['title'] ?? '-').toString();

  bool _canDecideItem(Map<String, dynamic> r) =>
      _globalCanDecide && r['can_decide'] != false && (_kTabActions[_tab]?.isNotEmpty ?? false);

  Future<void> _confirmAndRun(Map<String, dynamic> r, _ActionDef action) async {
    if (_acting) return;
    final ref = _refOf(r);
    final title = _titleOf(r);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${action.label}?'),
        content: Text('${action.label} untuk $ref${title != '-' ? ' — $title' : ''}.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(
            style: action.danger ? FilledButton.styleFrom(backgroundColor: const Color(0xFFE11D48)) : null,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(action.label),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _runAction(r, action);
  }

  Future<void> _runAction(Map<String, dynamic> r, _ActionDef action) async {
    setState(() => _acting = true);
    try {
      if (_tab == 'mutations') {
        final path = action.key == 'reject' ? 'mutation-reject' : 'mutation-approve';
        final res = await ApiService().post('/v2/approval-center/$path', data: {'doc_no': _docNoOf(r)});
        if (res.data['success'] != true) throw Exception(res.data['message'] ?? 'Aksi gagal diproses.');
      } else {
        final decision = action.key == 'close' ? 'close' : action.key == 'reject' ? 'reject' : 'approve';
        final res = await ApiService().post('/v2/approval-center/wo-$decision', data: {
          'module': (r['module_key'] ?? r['module'] ?? 'wo_mtc').toString(),
          'wo_number': (r['wo_number'] ?? '').toString(),
        });
        if (res.data['success'] != true) throw Exception(res.data['message'] ?? 'Aksi gagal diproses.');
      }
      Get.snackbar(
        'Approval',
        '${action.label} berhasil',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
        margin: const EdgeInsets.all(16),
      );
      _load();
      _loadSummary();
    } catch (e) {
      Get.snackbar(
        'Approval',
        e.toString().replaceFirst('Exception: ', ''),
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
        margin: const EdgeInsets.all(16),
      );
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  void _openDetail(Map<String, dynamic> r) {
    if (_isWoQueue) {
      final moduleKey = (r['module_key'] ?? '').toString();
      final route = _kApprovalToDetailRoute[moduleKey];
      final woNumber = r['wo_number']?.toString() ?? '';
      if (route == null || woNumber.isEmpty) return;
      Get.toNamed(route, arguments: {'wo_number': woNumber});
      return;
    }
    if (_tab == 'mutations') {
      final docNo = _docNoOf(r);
      if (docNo == '-') return;
      Get.toNamed(AppRoutes.reportAssetMutationDetail, arguments: {'doc_no': docNo});
      return;
    }
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_refOf(r)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _detailRow('Referensi', _refOf(r)),
            _detailRow('Deskripsi', _titleOf(r)),
            const SizedBox(height: 6),
            Row(
              children: [
                const Text('Status  ', style: TextStyle(fontSize: 12.5, color: Color(0xFF64748B))),
                _statusChip(woStatusInfo(r['status']?.toString())),
              ],
            ),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Tutup'))],
      ),
    );
  }

  Widget _detailRow(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: RichText(
          text: TextSpan(
            style: const TextStyle(fontSize: 12.5, color: Color(0xFF1E293B)),
            children: [
              TextSpan(text: '$label  ', style: const TextStyle(color: Color(0xFF64748B))),
              TextSpan(text: value, style: const TextStyle(fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      );

  Widget _statusChip(WoStatusInfo s) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: s.bg, borderRadius: BorderRadius.circular(999)),
        child: Text(s.label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: s.fg)),
      );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!_globalCanDecide && !_summaryLoading) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                border: Border.all(color: const Color(0xFFFDE68A)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'Akun management hanya dapat melihat daftar approval, tidak dapat memutuskan.',
                style: TextStyle(fontSize: 12.5, color: Color(0xFF92400E)),
              ),
            ),
            const SizedBox(height: 12),
          ],
          _buildSummaryCards(),
          const SizedBox(height: 14),
          _buildTabs(),
          if (_isWoQueue) ...[
            const SizedBox(height: 10),
            _buildWoModuleFilters(),
          ],
          const SizedBox(height: 12),
          _buildFilterBar(),
          const SizedBox(height: 12),
          Expanded(child: _buildTableCard()),
          if (_rows.isNotEmpty) ...[
            const SizedBox(height: 12),
            _buildPaginationBar(),
          ],
        ],
      ),
    );
  }

  Widget _buildSummaryCards() {
    return LayoutBuilder(builder: (context, c) {
      final perRow = c.maxWidth >= 760 ? 4 : 2;
      final cardWidth = (c.maxWidth - (perRow - 1) * 12) / perRow;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: _kTabs.map((t) {
          final active = _tab == t.key;
          final value = _summary[t.key];
          return SizedBox(
            width: cardWidth,
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _setTab(t.key),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: active ? const Color(0xFF1B54E0) : const Color(0xFFE5E7EB), width: active ? 2 : 1),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.verified_outlined, size: 20, color: Color(0xFFD97706)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(t.value, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: Color(0xFF64748B)), overflow: TextOverflow.ellipsis),
                            Text(
                              _summaryLoading ? '…' : '${value ?? 0}',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF0F172A)),
                            ),
                          ],
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
    });
  }

  Widget _buildTabs() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: _kTabs.map((t) {
          final active = _tab == t.key;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Material(
              color: active ? const Color(0xFF1B54E0) : Colors.white,
              borderRadius: BorderRadius.circular(8),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => _setTab(t.key),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: active ? Colors.transparent : const Color(0xFFE2E8F0)),
                  ),
                  child: Text(
                    t.value,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: active ? Colors.white : const Color(0xFF475569)),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildWoModuleFilters() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: _kWoModuleFilters.map((m) {
          final active = _woModule == m.key;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: () => _setFilter(() => _woModule = m.key),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  color: active ? const Color(0xFFEFF4FF) : Colors.white,
                  border: Border.all(color: active ? const Color(0xFF1B54E0) : const Color(0xFFE2E8F0)),
                ),
                child: Text(
                  m.value,
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: active ? const Color(0xFF1D4ED8) : const Color(0xFF475569)),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 300,
            height: 36,
            child: TextField(
              controller: _searchCtrl,
              onChanged: _onSearchChanged,
              decoration: _filterInputDecoration(hint: 'Cari referensi / deskripsi…', icon: Icons.search),
              style: const TextStyle(fontSize: 13),
            ),
          ),
          const SizedBox(width: 10),
          IconButton(
            tooltip: 'Muat ulang',
            onPressed: _load,
            icon: _fetching
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.refresh, size: 18),
          ),
          if (_hasActiveFilters) TextButton(onPressed: _resetFilters, child: const Text('Reset', style: TextStyle(fontSize: 12.5))),
        ],
      ),
    );
  }

  InputDecoration _filterInputDecoration({required String hint, IconData? icon}) {
    final border = OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFE2E8F0)));
    return InputDecoration(
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      prefixIcon: icon != null ? Icon(icon, size: 16, color: const Color(0xFF94A3B8)) : null,
      prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 0),
      hintText: hint,
      hintStyle: const TextStyle(fontSize: 12.5, color: Color(0xFF94A3B8)),
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(borderSide: const BorderSide(color: Color(0xFF1B54E0))),
    );
  }

  Widget _buildTableCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      clipBehavior: Clip.antiAlias,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorState()
              : _rows.isEmpty
                  ? _buildEmptyState()
                  : _buildTable(),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 36, color: Color(0xFFE11D48)),
          const SizedBox(height: 10),
          Text(_error ?? 'Gagal memuat data', style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)), textAlign: TextAlign.center),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _load, child: const Text('Coba lagi')),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    final label = _isWoQueue && _woModule.isNotEmpty
        ? 'Tidak ada antrian pada ${_kWoModuleFilters.firstWhere((m) => m.key == _woModule, orElse: () => const MapEntry('', 'modul ini')).value}.'
        : 'Semua item pada kategori ini sudah diproses.';
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.inbox_outlined, size: 36, color: Color(0xFFCBD5E1)),
          const SizedBox(height: 10),
          const Text('Tidak ada antrian', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF334155))),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)), textAlign: TextAlign.center),
        ],
      ),
    );
  }

  static const List<double> _kColWidthValues = [140, 300, 140, 110, 110, 230];
  static double get _kTableWidth => _kColWidthValues.reduce((a, b) => a + b);
  static Map<int, TableColumnWidth> get _kColWidths => {
        for (var i = 0; i < _kColWidthValues.length; i++) i: FixedColumnWidth(_kColWidthValues[i]),
      };

  Widget _buildTable() {
    return SingleChildScrollView(
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: SizedBox(
          width: _kTableWidth,
          child: Material(
            type: MaterialType.transparency,
            child: Table(
              columnWidths: _kColWidths,
              children: [_headerRow(), ..._rows.map(_dataRow)],
            ),
          ),
        ),
      ),
    );
  }

  TableRow _headerRow() {
    const style = TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF64748B), letterSpacing: .3);
    Widget h(String t) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Text(t, style: style, maxLines: 1, overflow: TextOverflow.ellipsis, softWrap: false),
        );
    return TableRow(
      decoration: const BoxDecoration(
        color: Color(0xFFF8FAFC),
        border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB))),
      ),
      children: [h('REFERENSI'), h('DESKRIPSI'), h('COMPANY'), h('TANGGAL'), h('STATUS'), h('')],
    );
  }

  TableRow _dataRow(Map<String, dynamic> r) {
    final status = woStatusInfo(r['status']?.toString());
    final subtitle = [r['module_label'], (r['asset_name'] ?? r['asset_code'])]
        .where((v) => v != null && v.toString().trim().isNotEmpty)
        .join(' · ');
    final actions = _kTabActions[_tab] ?? const [];
    final canDecide = _canDecideItem(r);

    Widget cell(Widget child, {bool tappable = true}) => tappable
        ? TableRowInkWell(onTap: () => _openDetail(r), child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10), child: child))
        : Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10), child: child);
    Widget text(String t, {Color color = const Color(0xFF475569), FontWeight weight = FontWeight.w400, double size = 12}) =>
        cell(Text(t, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: size, color: color, fontWeight: weight)));

    return TableRow(
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFF1F5F9)))),
      children: [
        text(_refOf(r), color: const Color(0xFF1D4ED8), weight: FontWeight.w600, size: 12.5),
        cell(Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_titleOf(r), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Color(0xFF1E293B))),
            if (subtitle.isNotEmpty)
              Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          ],
        )),
        text((r['company'] ?? '-').toString()),
        text(_tryParseDate(r['date']?.toString() ?? r['requested_at']?.toString())),
        cell(Align(
          alignment: Alignment.centerLeft,
          child: _statusChip(status),
        )),
        cell(
          tappable: false,
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                tooltip: 'Lihat',
                onPressed: () => _openDetail(r),
                icon: const Icon(Icons.visibility_outlined, size: 18),
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                padding: EdgeInsets.zero,
              ),
              if (canDecide)
                ...actions.map((a) => Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: SizedBox(
                        height: 30,
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: a.danger ? const Color(0xFFE11D48) : const Color(0xFF1B54E0),
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            textStyle: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
                          ),
                          onPressed: _acting ? null : () => _confirmAndRun(r, a),
                          child: Text(a.label),
                        ),
                      ),
                    )),
            ],
          ),
        ),
      ],
    );
  }

  String _tryParseDate(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final d = DateTime.tryParse(raw);
    if (d == null) return raw;
    return DateFormat('dd MMM yyyy').format(d);
  }

  Widget _buildPaginationBar() {
    final start = _total == 0 ? 0 : (_page - 1) * _perPage + 1;
    final end = (_page * _perPage).clamp(0, _total);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          Text('Menampilkan $start-$end dari $_total', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          const Spacer(),
          DropdownButtonHideUnderline(
            child: DropdownButton<int>(
              value: _perPage,
              isDense: true,
              style: const TextStyle(fontSize: 12, color: Color(0xFF1E293B)),
              items: _kPerPageOptions.map((n) => DropdownMenuItem(value: n, child: Text('$n / halaman'))).toList(),
              onChanged: (v) {
                if (v == null) return;
                setState(() {
                  _perPage = v;
                  _page = 1;
                });
                _load();
              },
            ),
          ),
          const SizedBox(width: 12),
          IconButton(
            onPressed: _page > 1 ? () { setState(() => _page -= 1); _load(); } : null,
            icon: const Icon(Icons.chevron_left, size: 18),
          ),
          Text('$_page / $_totalPages', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
          IconButton(
            onPressed: _page < _totalPages ? () { setState(() => _page += 1); _load(); } : null,
            icon: const Icon(Icons.chevron_right, size: 18),
          ),
        ],
      ),
    );
  }
}
