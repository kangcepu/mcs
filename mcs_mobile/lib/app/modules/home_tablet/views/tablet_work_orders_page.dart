import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

import '../../../core/routes/app_routes.dart';
import '../../../core/utils/wo_status.dart';
import '../../../data/models/user_model.dart';
import '../../../data/providers/api_service.dart';

/// Padanan tablet untuk `mcs_web/src/app/(app)/work-orders/page.tsx` — SATU
/// halaman dengan tab modul (bukan 5 layar terpisah), filter bar, tabel, dan
/// paginasi, sama seperti web. Baris yang di-tap membuka layar detail WO
/// native per-modul yang sudah ada (wo_mtc/wo_operational/wo_production/
/// wo/wo_ga) via `wo_number` — detail/approve/close WO belum di-porting ke
/// tampilan tablet, jadi sementara tetap pakai layar detail gaya HP.
class TabletWorkOrdersPage extends StatefulWidget {
  final String initialModule;
  const TabletWorkOrdersPage({super.key, this.initialModule = ''});

  @override
  State<TabletWorkOrdersPage> createState() => _TabletWorkOrdersPageState();
}

const Map<String, String> _kModuleLabel = {
  'meso': 'MESO',
  'maintenance': 'Maintenance',
  'production': 'Production',
  'is': 'IS',
  'ga': 'GA',
};
const Map<String, String> _kModuleDetailRoute = {
  'meso': AppRoutes.woMtcDetail,
  'maintenance': AppRoutes.woOperationalDetail,
  'production': AppRoutes.woProductionDetail,
  'is': AppRoutes.woDetail,
  'ga': AppRoutes.woGaDetail,
};
const List<Map<String, String>> _kTypeOptions = [
  {'code': 'CORRECTIVE MAINTENANCE', 'label': 'Corrective Maintenance'},
  {'code': 'PREVENTIVE MAINTENANCE', 'label': 'Preventive Maintenance'},
  {'code': 'PROJECT', 'label': 'Project'},
];
const List<Map<String, String>> _kAreaOptions = [
  {'code': 'GSU_WNB', 'label': 'GSU - WNB'},
  {'code': 'GSU_INJECT', 'label': 'GSU - Inject'},
  {'code': 'RU_SAWMILL', 'label': 'RU - Sawmill'},
  {'code': 'RU_PRODUCTION', 'label': 'RU - FJLB'},
];
const List<int> _kPerPageOptions = [10, 20, 50];

class _TabletWorkOrdersPageState extends State<TabletWorkOrdersPage> {
  late String _module;
  String _q = '';
  String _status = '';
  String _typeWo = '';
  String _area = '';
  String _company = '';
  String _assetId = '';
  String _dateFrom = '';
  String _dateTo = '';
  int _page = 1;
  int _perPage = 20;

  final _searchCtrl = TextEditingController();
  final _companyCtrl = TextEditingController();
  final _assetIdCtrl = TextEditingController();
  Timer? _debounce;

  bool _loading = true;
  bool _fetching = false;
  String? _error;
  List<Map<String, dynamic>> _rows = [];
  int _total = 0;
  int _totalPages = 1;
  List<Map<String, String>> _statusOptions = [];
  List<String> _allowedModules = const [];

  @override
  void initState() {
    super.initState();
    _module = widget.initialModule;
    _loadPermissionsThenFetch();
    _loadOptions();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    _companyCtrl.dispose();
    _assetIdCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPermissionsThenFetch() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('user_data');
      final permissions = raw != null ? User.fromJson(jsonDecode(raw) as Map<String, dynamic>).permissions : null;
      _allowedModules = _kModuleLabel.keys.where((m) => _canRead(permissions, m)).toList();
      if (_module.isNotEmpty && !_allowedModules.contains(_module)) _module = '';
    } catch (_) {
      _allowedModules = _kModuleLabel.keys.toList();
    }
    if (mounted) setState(() {});
    _load();
  }

  bool _canRead(Permissions? p, String module) {
    if (p == null) return true;
    switch (module) {
      case 'meso':
        return p.woMtc == 1 || p.woMtcAll == 1 || p.woCrossAccess == 1;
      case 'maintenance':
        return p.woOperational == 1 || p.woMtcAll == 1 || p.woCrossAccess == 1;
      case 'production':
        return p.woPreventive == 1 || p.woCrossAccess == 1;
      case 'is':
        return p.woIt == 1 || p.woCrossAccess == 1;
      case 'ga':
        return p.woGa == 1 || p.woCrossAccess == 1;
    }
    return false;
  }

  Future<void> _loadOptions() async {
    try {
      final res = await ApiService().get('/v2/work-orders/options');
      final data = res.data;
      if (data['success'] == true) {
        final statuses = (data['data']?['statuses'] as List? ?? []);
        if (mounted) {
          setState(() {
            _statusOptions = statuses
                .map((s) => {'code': '${s['code']}', 'label': '${s['label']}'})
                .toList();
          });
        }
      }
    } catch (_) {
      // Non-fatal — filter status cukup kosong kalau opsi gagal dimuat.
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
        if (_module.isNotEmpty) 'module': _module,
        if (_q.isNotEmpty) 'q': _q,
        if (_status.isNotEmpty) 'status': _status,
        if (_typeWo.isNotEmpty) 'type_wo': _typeWo,
        if (_area.isNotEmpty) 'area': _area,
        if (_company.isNotEmpty) 'company': _company,
        if (_assetId.isNotEmpty) 'asset_id': _assetId,
        if (_dateFrom.isNotEmpty) 'date_from': _dateFrom,
        if (_dateTo.isNotEmpty) 'date_to': _dateTo,
      };
      final res = await ApiService().get('/v2/work-orders', queryParameters: params);
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

  void _setFilter(VoidCallback mutate) {
    setState(mutate);
    _page = 1;
    _load();
  }

  void _onSearchChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () => _setFilter(() => _q = v.trim()));
  }

  bool get _hasActiveFilters =>
      _q.isNotEmpty || _status.isNotEmpty || _typeWo.isNotEmpty || _area.isNotEmpty || _company.isNotEmpty || _assetId.isNotEmpty || _dateFrom.isNotEmpty || _dateTo.isNotEmpty;

  void _resetFilters() {
    _searchCtrl.clear();
    _companyCtrl.clear();
    _assetIdCtrl.clear();
    _setFilter(() {
      _q = '';
      _status = '';
      _typeWo = '';
      _area = '';
      _company = '';
      _assetId = '';
      _dateFrom = '';
      _dateTo = '';
    });
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2015),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    final formatted = DateFormat('yyyy-MM-dd').format(picked);
    _setFilter(() {
      if (isFrom) {
        _dateFrom = formatted;
      } else {
        _dateTo = formatted;
      }
    });
  }

  void _openDetail(Map<String, dynamic> row) {
    final module = (row['module'] ?? _module).toString().toLowerCase();
    final route = _kModuleDetailRoute[module];
    final woNumber = row['wo_number']?.toString() ?? '';
    if (route == null || woNumber.isEmpty) return;
    Get.toNamed(route, arguments: {'wo_number': woNumber});
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildModuleTabs(),
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

  Widget _buildModuleTabs() {
    final tabs = <Map<String, String>>[
      {'code': '', 'label': 'Semua'},
      ..._allowedModules.map((m) => {'code': m, 'label': _kModuleLabel[m]!}),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: tabs.map((t) {
          final active = _module == t['code'];
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Material(
              color: active ? const Color(0xFF1B54E0) : Colors.white,
              borderRadius: BorderRadius.circular(8),
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => _setFilter(() => _module = t['code']!),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: active ? Colors.transparent : const Color(0xFFE2E8F0)),
                  ),
                  child: Text(
                    t['label']!,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: active ? Colors.white : const Color(0xFF475569),
                    ),
                  ),
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
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            SizedBox(
              width: 260,
              height: 36,
              child: TextField(
                controller: _searchCtrl,
                onChanged: _onSearchChanged,
                decoration: _filterInputDecoration(hint: 'Cari no. WO, deskripsi, aset…', icon: Icons.search),
                style: const TextStyle(fontSize: 13),
              ),
            ),
            const SizedBox(width: 10),
            _dateButton('Dari', _dateFrom, () => _pickDate(isFrom: true)),
            const SizedBox(width: 8),
            _dateButton('Sampai', _dateTo, () => _pickDate(isFrom: false)),
            const SizedBox(width: 8),
            _dropdown('Semua status', _status, [
              for (final s in _statusOptions) MapEntry(s['code']!, s['label']!),
            ], (v) => _setFilter(() => _status = v)),
            const SizedBox(width: 8),
            _dropdown('Semua tipe', _typeWo, [
              for (final t in _kTypeOptions) MapEntry(t['code']!, t['label']!),
            ], (v) => _setFilter(() => _typeWo = v)),
            const SizedBox(width: 8),
            _dropdown('Semua area', _area, [
              for (final a in _kAreaOptions) MapEntry(a['code']!, a['label']!),
            ], (v) => _setFilter(() => _area = v)),
            const SizedBox(width: 8),
            SizedBox(
              width: 140,
              height: 36,
              child: TextField(
                controller: _companyCtrl,
                onSubmitted: (v) => _setFilter(() => _company = v.trim()),
                decoration: _filterInputDecoration(hint: 'Company'),
                style: const TextStyle(fontSize: 13),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 120,
              height: 36,
              child: TextField(
                controller: _assetIdCtrl,
                onSubmitted: (v) => _setFilter(() => _assetId = v.trim()),
                keyboardType: TextInputType.number,
                decoration: _filterInputDecoration(hint: 'Asset ID'),
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
            if (_hasActiveFilters)
              TextButton(onPressed: _resetFilters, child: const Text('Reset', style: TextStyle(fontSize: 12.5))),
          ],
        ),
      ),
    );
  }

  // Border bulat tipis #E2E8F0 — senada dengan pill tombol tanggal/dropdown
  // di sampingnya, bukan OutlineInputBorder default Flutter yang kotak/tebal.
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

  Widget _dateButton(String label, String value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(border: Border.all(color: const Color(0xFFE2E8F0)), borderRadius: BorderRadius.circular(8)),
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.calendar_today_outlined, size: 13, color: Color(0xFF94A3B8)),
            const SizedBox(width: 6),
            Text(value.isEmpty ? label : value, style: TextStyle(fontSize: 12.5, color: value.isEmpty ? const Color(0xFF94A3B8) : const Color(0xFF1E293B))),
          ],
        ),
      ),
    );
  }

  Widget _dropdown(String placeholder, String value, List<MapEntry<String, String>> options, ValueChanged<String> onChanged) {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(border: Border.all(color: const Color(0xFFE2E8F0)), borderRadius: BorderRadius.circular(8)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value.isEmpty ? '' : value,
          isDense: true,
          style: const TextStyle(fontSize: 12.5, color: Color(0xFF1E293B)),
          hint: Text(placeholder, style: const TextStyle(fontSize: 12.5, color: Color(0xFF94A3B8))),
          items: [
            DropdownMenuItem(value: '', child: Text(placeholder, style: const TextStyle(fontSize: 12.5))),
            for (final o in options) DropdownMenuItem(value: o.key, child: Text(o.value, style: const TextStyle(fontSize: 12.5))),
          ],
          onChanged: (v) => onChanged(v ?? ''),
        ),
      ),
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
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.inbox_outlined, size: 36, color: Color(0xFFCBD5E1)),
          SizedBox(height: 10),
          Text('Belum ada work order', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF334155))),
          SizedBox(height: 4),
          Text('Coba ubah filter tanggal atau kata kunci pencarian.', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
        ],
      ),
    );
  }

  // Semua lebar tetap (FixedColumnWidth), bukan FlexColumnWidth — di layar
  // sempit (sidebar inline + lebar tablet pas-pasan) kolom flex bisa
  // kolaps ke hampir 0px dan bikin teks header "DESKRIPSI" kepotong per
  // huruf. Dengan lebar tetap + scroll horizontal, tabel selalu konsisten
  // berapa pun lebar layarnya.
  static const List<double> _kColWidthValues = [150, 280, 92, 150, 110, 90, 96, 130, 110];
  static double get _kTableWidth => _kColWidthValues.reduce((a, b) => a + b);
  static Map<int, TableColumnWidth> get _kColWidths => {
        for (var i = 0; i < _kColWidthValues.length; i++) i: FixedColumnWidth(_kColWidthValues[i]),
      };

  // Table manual (bukan widget `DataTable`) — DataTable bawaan Flutter
  // otomatis nambahin kolom checkbox + garis pemisah tebal yang gak ada di
  // desain tabel web, itu sumber kesan "kaku". Di sini kontrol penuh warna
  // border (hairline #F1F5F9, bukan abu-abu tegas) dan tanpa checkbox.
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
    Widget h(String t, {TextAlign align = TextAlign.left}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Text(t, style: style, textAlign: align, maxLines: 1, overflow: TextOverflow.ellipsis, softWrap: false),
        );
    return TableRow(
      decoration: const BoxDecoration(
        color: Color(0xFFF8FAFC),
        border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB))),
      ),
      children: [h('NO. WO'), h('DESKRIPSI'), h('MODUL'), h('TIPE'), h('AREA'), h('COMPANY'), h('PRIORITAS'), h('STATUS'), h('DIBUAT')],
    );
  }

  TableRow _dataRow(Map<String, dynamic> r) {
    final module = (r['module'] ?? '').toString().toLowerCase();
    final title = (r['job_title'] ?? r['title'] ?? r['description'] ?? '-').toString();
    final asset = (r['asset_name'] ?? r['asset_code'] ?? 'Tanpa aset').toString();
    final status = woStatusInfo(r['status']?.toString());
    final createdAt = _tryParseDate(r['created_at']?.toString() ?? r['date']?.toString());
    final area = _kAreaOptions.firstWhere((a) => a['code'] == r['mtc_area_key'], orElse: () => const {'label': '-'})['label'];

    Widget cell(Widget child) => TableRowInkWell(
          onTap: () => _openDetail(r),
          child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), child: child),
        );
    Widget text(String t, {Color color = const Color(0xFF475569), FontWeight weight = FontWeight.w400, double size = 12}) =>
        cell(Text(t, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: size, color: color, fontWeight: weight)));

    return TableRow(
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFF1F5F9)))),
      children: [
        text(r['wo_number']?.toString() ?? '-', color: const Color(0xFF1D4ED8), weight: FontWeight.w600, size: 12.5),
        cell(Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Color(0xFF1E293B))),
            Text(asset, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          ],
        )),
        text(_kModuleLabel[module] ?? (r['module']?.toString() ?? '-'), weight: FontWeight.w500),
        text(_typeLabel(r['type_wo']?.toString())),
        text(area ?? '-'),
        text(r['company']?.toString() ?? '-'),
        text(_titleCase(r['priority']?.toString())),
        cell(Align(
          alignment: Alignment.centerLeft,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: status.bg, borderRadius: BorderRadius.circular(999)),
            child: Text(status.label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: status.fg)),
          ),
        )),
        text(createdAt, color: const Color(0xFF64748B)),
      ],
    );
  }

  String _typeLabel(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final match = _kTypeOptions.firstWhere((t) => t['code']?.toUpperCase() == raw.toUpperCase(), orElse: () => {'label': raw});
    return _titleCase(match['label']);
  }

  String _titleCase(String? v) {
    if (v == null || v.isEmpty) return '-';
    return v
        .toLowerCase()
        .split(' ')
        .where((w) => w.isNotEmpty)
        .map((w) => w[0].toUpperCase() + w.substring(1))
        .join(' ');
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
