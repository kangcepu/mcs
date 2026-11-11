import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/utils/wo_status.dart';
import '../../../data/providers/api_service.dart';
import 'tablet_asset_detail_page.dart';

/// Padanan tablet untuk `mcs_web/src/app/(app)/assets/page.tsx` ("Asset
/// Manage", href `/assets` — BUKAN halaman "Report Assets" yang terpisah).
/// List dan detail aset sama-sama dirender native di dalam shell tablet.
class TabletAssetManagePage extends StatefulWidget {
  const TabletAssetManagePage({super.key});

  @override
  State<TabletAssetManagePage> createState() => _TabletAssetManagePageState();
}

const List<Map<String, String>> _kActiveOptions = [
  {'code': '1', 'label': 'Aktif'},
  {'code': '0', 'label': 'Nonaktif'},
];
const List<int> _kPerPageOptions = [10, 20, 50];

class _TabletAssetManagePageState extends State<TabletAssetManagePage> {
  String _q = '';
  String _company = '';
  String _location = '';
  String _category = '';
  String _isActive = '';
  int _page = 1;
  int _perPage = 20;

  final _searchCtrl = TextEditingController();
  Timer? _debounce;

  bool _loading = true;
  bool _fetching = false;
  String? _error;
  List<Map<String, dynamic>> _rows = [];
  int _total = 0;
  int _totalPages = 1;
  List<Map<String, String>> _companies = [];
  List<Map<String, String>> _locations = [];
  List<Map<String, String>> _categories = [];
  String? _selectedAssetCode;
  Map<String, dynamic> _selectedAssetRow = {};

  @override
  void initState() {
    super.initState();
    _load();
    _loadOptions();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadOptions() async {
    try {
      final res = await ApiService().get('/v2/assets/options');
      final data = res.data;
      if (data['success'] == true && mounted) {
        final opt = data['data'] as Map?;
        List<Map<String, String>> toList(dynamic v) => ((v as List?) ?? [])
            .map((e) => {'code': '${e['value']}', 'label': '${e['label']}'})
            .toList();
        setState(() {
          _companies = toList(opt?['companies']);
          _locations = toList(opt?['locations']);
          _categories = toList(opt?['categories']);
        });
      }
    } catch (_) {
      // Non-fatal — filter cukup kosong kalau opsi gagal dimuat.
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
        if (_company.isNotEmpty) 'company': _company,
        if (_location.isNotEmpty) 'location': _location,
        if (_category.isNotEmpty) 'category': _category,
        if (_isActive.isNotEmpty) 'is_active': _isActive,
      };
      final res = await ApiService().get('/v2/assets', queryParameters: params);
      final data = res.data;
      if (data['success'] == true || data['status'] == true) {
        final list = (data['data'] as List? ?? []);
        final meta = data['meta'] as Map?;
        setState(() {
          _rows = list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          _total = meta?['total'] is num
              ? (meta!['total'] as num).toInt()
              : _rows.length;
          _totalPages = meta?['total_pages'] is num
              ? (meta!['total_pages'] as num).toInt()
              : 1;
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
    _debounce = Timer(const Duration(milliseconds: 450),
        () => _setFilter(() => _q = v.trim()));
  }

  bool get _hasActiveFilters =>
      _q.isNotEmpty ||
      _company.isNotEmpty ||
      _location.isNotEmpty ||
      _category.isNotEmpty ||
      _isActive.isNotEmpty;

  void _resetFilters() {
    _searchCtrl.clear();
    _setFilter(() {
      _q = '';
      _company = '';
      _location = '';
      _category = '';
      _isActive = '';
    });
  }

  void _openDetail(Map<String, dynamic> row) {
    final code = row['AssetCode']?.toString() ?? row['asset_code']?.toString();
    if (code == null || code.isEmpty) return;
    setState(() {
      _selectedAssetCode = code;
      _selectedAssetRow = Map<String, dynamic>.from(row);
    });
  }

  void _openDetailByCode(String code) {
    if (code.trim().isEmpty) return;
    setState(() {
      _selectedAssetCode = code.trim();
      _selectedAssetRow = {};
    });
  }

  @override
  Widget build(BuildContext context) {
    final selectedCode = _selectedAssetCode;
    if (selectedCode != null) {
      return TabletAssetDetailPage(
        key: ValueKey(selectedCode),
        assetCode: selectedCode,
        initialRow: _selectedAssetRow,
        onBack: () => setState(() {
          _selectedAssetCode = null;
          _selectedAssetRow = {};
        }),
        onOpenAsset: _openDetailByCode,
      );
    }
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
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
                decoration: _filterInputDecoration(
                    hint: 'Cari kode / nama aset…', icon: Icons.search),
                style: const TextStyle(fontSize: 13),
              ),
            ),
            const SizedBox(width: 8),
            _dropdown(
                'Semua company',
                _company,
                [for (final c in _companies) MapEntry(c['code']!, c['label']!)],
                (v) => _setFilter(() => _company = v)),
            const SizedBox(width: 8),
            _dropdown(
                'Semua lokasi',
                _location,
                [for (final l in _locations) MapEntry(l['code']!, l['label']!)],
                (v) => _setFilter(() => _location = v)),
            const SizedBox(width: 8),
            _dropdown(
                'Semua kategori',
                _category,
                [
                  for (final c in _categories) MapEntry(c['code']!, c['label']!)
                ],
                (v) => _setFilter(() => _category = v)),
            const SizedBox(width: 8),
            _dropdown(
                'Semua status',
                _isActive,
                [
                  for (final a in _kActiveOptions)
                    MapEntry(a['code']!, a['label']!)
                ],
                (v) => _setFilter(() => _isActive = v)),
            const SizedBox(width: 10),
            IconButton(
              tooltip: 'Muat ulang',
              onPressed: _load,
              icon: _fetching
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.refresh, size: 18),
            ),
            if (_hasActiveFilters)
              TextButton(
                  onPressed: _resetFilters,
                  child: const Text('Reset', style: TextStyle(fontSize: 12.5))),
          ],
        ),
      ),
    );
  }

  InputDecoration _filterInputDecoration(
      {required String hint, IconData? icon}) {
    final border = OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)));
    return InputDecoration(
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      prefixIcon: icon != null
          ? Icon(icon, size: 16, color: const Color(0xFF94A3B8))
          : null,
      prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 0),
      hintText: hint,
      hintStyle: const TextStyle(fontSize: 12.5, color: Color(0xFF94A3B8)),
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
          borderSide: const BorderSide(color: Color(0xFF1B54E0))),
    );
  }

  Widget _dropdown(String placeholder, String value,
      List<MapEntry<String, String>> options, ValueChanged<String> onChanged) {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      constraints: const BoxConstraints(maxWidth: 170),
      decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFE2E8F0)),
          borderRadius: BorderRadius.circular(8)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value.isEmpty ? '' : value,
          isDense: true,
          isExpanded: true,
          style: const TextStyle(fontSize: 12.5, color: Color(0xFF1E293B)),
          items: [
            DropdownMenuItem(
                value: '',
                child: Text(placeholder,
                    style: const TextStyle(fontSize: 12.5),
                    overflow: TextOverflow.ellipsis)),
            for (final o in options)
              DropdownMenuItem(
                  value: o.key,
                  child: Text(o.value,
                      style: const TextStyle(fontSize: 12.5),
                      overflow: TextOverflow.ellipsis)),
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
          Text(_error ?? 'Gagal memuat data',
              style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
              textAlign: TextAlign.center),
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
          Icon(Icons.inventory_2_outlined, size: 36, color: Color(0xFFCBD5E1)),
          SizedBox(height: 10),
          Text('Belum ada aset',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF334155))),
          SizedBox(height: 4),
          Text('Ubah kata kunci atau tambah aset baru.',
              style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
        ],
      ),
    );
  }

  // Lebar tetap + scroll horizontal (bukan FlexColumnWidth) — kolom flex bisa
  // kolaps hampir 0px di layar sempit dan bikin header kepotong per huruf.
  static const List<double> _kColWidthValues = [
    160,
    260,
    140,
    140,
    140,
    160,
    120
  ];
  static double get _kTableWidth => _kColWidthValues.reduce((a, b) => a + b);
  static Map<int, TableColumnWidth> get _kColWidths => {
        for (var i = 0; i < _kColWidthValues.length; i++)
          i: FixedColumnWidth(_kColWidthValues[i]),
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
    const style = TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: Color(0xFF64748B),
        letterSpacing: .3);
    Widget h(String t, {TextAlign align = TextAlign.left}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Text(t,
              style: style,
              textAlign: align,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              softWrap: false),
        );
    return TableRow(
      decoration: const BoxDecoration(
        color: Color(0xFFF8FAFC),
        border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB))),
      ),
      children: [
        h('KODE ASET'),
        h('NAMA ASET'),
        h('COMPANY'),
        h('LOKASI'),
        h('KATEGORI'),
        h('AREA MAINTENANCE'),
        h('STATUS', align: TextAlign.center),
      ],
    );
  }

  TableRow _dataRow(Map<String, dynamic> r) {
    final code = (r['AssetCode'] ?? r['asset_code'] ?? '-').toString();
    final name = (r['AssetName'] ?? r['asset_name'] ?? '-').toString();
    final brand = (r['brand'] ?? '—').toString();
    final company = (r['CompanyName'] ?? r['company_name'] ?? '-').toString();
    final location =
        (r['LocationAsset'] ?? r['location_name'] ?? '-').toString();
    final category =
        (r['CategoryAsset'] ?? r['category_name'] ?? '-').toString();
    final area = r['mtc_area_key']?.toString();
    final inactive =
        (r['active']?.toString().toLowerCase() ?? '') == 'inactive';
    final status = woStatusInfo(inactive ? 'inactive' : 'active');

    Widget cell(Widget child) => TableRowInkWell(
          onTap: () => _openDetail(r),
          child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: child),
        );
    Widget text(String t,
            {Color color = const Color(0xFF475569),
            FontWeight weight = FontWeight.w400,
            double size = 12}) =>
        cell(Text(t,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style:
                TextStyle(fontSize: size, color: color, fontWeight: weight)));

    return TableRow(
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0xFFF1F5F9)))),
      children: [
        text(code,
            color: const Color(0xFF1D4ED8),
            weight: FontWeight.w600,
            size: 12.5),
        cell(Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF1E293B))),
            Text(brand,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          ],
        )),
        text(company),
        text(location),
        text(category),
        text(_areaLabel(area)),
        cell(Align(
          alignment: Alignment.center,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
                color: status.bg, borderRadius: BorderRadius.circular(999)),
            child: Text(status.label,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: status.fg)),
          ),
        )),
      ],
    );
  }

  static const Map<String, String> _kAreaLabel = {
    'GSU_WNB': 'GSU - WNB',
    'GSU_INJECT': 'GSU - Inject',
    'RU_SAWMILL': 'RU - Sawmill',
    'RU_PRODUCTION': 'RU - FJLB',
  };

  String _areaLabel(String? v) {
    if (v == null || v.isEmpty) return '-';
    return _kAreaLabel[v] ?? v;
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
          Text('Menampilkan $start-$end dari $_total',
              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          const Spacer(),
          DropdownButtonHideUnderline(
            child: DropdownButton<int>(
              value: _perPage,
              isDense: true,
              style: const TextStyle(fontSize: 12, color: Color(0xFF1E293B)),
              items: _kPerPageOptions
                  .map((n) =>
                      DropdownMenuItem(value: n, child: Text('$n / halaman')))
                  .toList(),
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
            onPressed: _page > 1
                ? () {
                    setState(() => _page -= 1);
                    _load();
                  }
                : null,
            icon: const Icon(Icons.chevron_left, size: 18),
          ),
          Text('$_page / $_totalPages',
              style:
                  const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
          IconButton(
            onPressed: _page < _totalPages
                ? () {
                    setState(() => _page += 1);
                    _load();
                  }
                : null,
            icon: const Icon(Icons.chevron_right, size: 18),
          ),
        ],
      ),
    );
  }
}
