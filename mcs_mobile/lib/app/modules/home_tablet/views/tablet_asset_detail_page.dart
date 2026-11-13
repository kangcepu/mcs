import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/utils/wo_status.dart';
import '../../../data/providers/api_service.dart';
import 'tablet_asset_related_manager.dart';

const _brand = Color(0xFF1B54E0);
const _ink = Color(0xFF0F172A);
const _muted = Color(0xFF64748B);
const _line = Color(0xFFE2E8F0);
const _surface = Color(0xFFF8FAFC);

class _AssetTab {
  final String key;
  final String label;
  final IconData icon;

  const _AssetTab(this.key, this.label, this.icon);
}

const _baseTabs = <_AssetTab>[
  _AssetTab('general', 'General', Icons.info_outline),
  _AssetTab('bom', 'Parts / BOM', Icons.account_tree_outlined),
  _AssetTab('related', 'Aset Terkait', Icons.hub_outlined),
  _AssetTab('custom', 'Custom Detail', Icons.tune_outlined),
  _AssetTab('gallery', 'Attachment / Gallery', Icons.photo_library_outlined),
  _AssetTab('history', 'History', Icons.history),
];

class TabletAssetDetailPage extends StatefulWidget {
  final String assetCode;
  final Map<String, dynamic> initialRow;
  final VoidCallback onBack;
  final ValueChanged<String> onOpenAsset;

  const TabletAssetDetailPage({
    super.key,
    required this.assetCode,
    required this.initialRow,
    required this.onBack,
    required this.onOpenAsset,
  });

  @override
  State<TabletAssetDetailPage> createState() => _TabletAssetDetailPageState();
}

class _TabletAssetDetailPageState extends State<TabletAssetDetailPage> {
  String _tab = 'general';
  bool _loading = true;
  bool _fetching = false;
  String? _error;
  Map<String, dynamic> _asset = {};
  List<Map<String, dynamic>> _customDetails = [];
  bool _canWriteAsset = false;

  @override
  void initState() {
    super.initState();
    _asset = Map<String, dynamic>.from(widget.initialRow);
    _loadPermission();
    _load();
  }

  Future<void> _loadPermission() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(
        () => _canWriteAsset = (prefs.getInt('privilage_asset') ?? 0) == 1);
  }

  Future<void> _load() async {
    setState(() {
      _loading = _asset.isEmpty;
      _fetching = true;
      _error = null;
    });
    try {
      final responses = await Future.wait([
        ApiService().get(
          '/v2/assets/detail',
          queryParameters: {'asset': widget.assetCode},
        ),
        ApiService().get(
          '/v2/assets/custom-details',
          queryParameters: {'asset_code': widget.assetCode},
        ),
      ]);
      final detailBody = responses[0].data;
      if (detailBody is! Map ||
          (detailBody['success'] != true && detailBody['status'] != true) ||
          detailBody['data'] is! Map) {
        throw Exception(
          detailBody is Map
              ? detailBody['message'] ?? 'Aset tidak ditemukan.'
              : 'Response detail aset tidak valid.',
        );
      }
      final customBody = responses[1].data;
      final customRows = customBody is Map &&
              (customBody['success'] == true || customBody['status'] == true)
          ? _maps(customBody['data'])
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() {
        _asset = Map<String, dynamic>.from(detailBody['data'] as Map);
        _customDetails = customRows;
        _loading = false;
        _fetching = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _loading = false;
        _fetching = false;
      });
    }
  }

  List<_AssetTab> get _tabs {
    final tabs = <_AssetTab>[_baseTabs.first];
    if (_asset['energy_profile'] is Map) {
      tabs.add(const _AssetTab(
        'energy',
        'Profil Energy',
        Icons.bolt_outlined,
      ));
    }
    if (_asset['fleet_profile'] is Map) {
      tabs.add(const _AssetTab(
        'fleet',
        'Profil Fleet',
        Icons.local_shipping_outlined,
      ));
    }
    tabs.addAll(_baseTabs.skip(1));
    return tabs;
  }

  String get _name => _value(
        _asset['AssetName'] ?? _asset['asset_name'],
        fallback: widget.assetCode,
      );

  bool get _inactive =>
      '${_asset['active'] ?? _asset['status']}'.toLowerCase() == 'inactive';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildHeader(),
        if (!_loading && _error == null) _buildTabs(),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? _buildError()
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: _buildTabContent(),
                    ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    final status = woStatusInfo(_inactive ? 'inactive' : 'active');
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 16, 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: _line)),
      ),
      child: Row(
        children: [
          IconButton.outlined(
            tooltip: 'Kembali ke daftar aset',
            onPressed: widget.onBack,
            icon: const Icon(Icons.arrow_back, size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      _name,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: _ink,
                      ),
                    ),
                    if (!_loading)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: status.bg,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          status.label,
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: status.fg,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  widget.assetCode,
                  style: const TextStyle(fontSize: 12, color: _muted),
                ),
              ],
            ),
          ),
          IconButton.outlined(
            tooltip: 'Muat ulang detail',
            onPressed: _fetching ? null : _load,
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

  Widget _buildTabs() {
    return Container(
      width: double.infinity,
      color: Colors.white,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: _tabs.map((tab) {
            final active = _tab == tab.key;
            return InkWell(
              onTap: () => setState(() => _tab = tab.key),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: active ? _brand : Colors.transparent,
                      width: 2,
                    ),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      tab.icon,
                      size: 16,
                      color: active ? _brand : _muted,
                    ),
                    const SizedBox(width: 7),
                    Text(
                      tab.label,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        color: active ? _brand : _muted,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildTabContent() {
    switch (_tab) {
      case 'bom':
        return _buildBom();
      case 'related':
        return _buildRelated();
      case 'custom':
        return _buildCustom();
      case 'gallery':
        return _buildGallery();
      case 'history':
        return _buildHistory();
      case 'energy':
        return _buildEnergy();
      case 'fleet':
        return _buildFleet();
      default:
        return _buildGeneral();
    }
  }

  Widget _buildGeneral() {
    final fields = <MapEntry<String, String>>[
      MapEntry('Kode Aset', _value(_asset['AssetCode'])),
      MapEntry('Nama Aset', _name),
      MapEntry('Alias', _value(_asset['AliasName'] ?? _asset['alias_name'])),
      MapEntry(
        'Company',
        _value(_asset['CompanyName'] ?? _asset['company_name']),
      ),
      MapEntry(
        'Lokasi',
        _value(_asset['LocationAsset'] ?? _asset['location_name']),
      ),
      MapEntry(
        'Kategori',
        _value(_asset['CategoryAsset'] ?? _asset['category_name']),
      ),
      MapEntry('Merek', _value(_asset['brand'])),
      MapEntry(
        'No. Seri / Remarks',
        _value(_asset['Remarks'] ?? _asset['serial_number']),
      ),
      MapEntry('Status', _inactive ? 'Nonaktif' : 'Aktif'),
    ];
    final parentCode = _value(_asset['parent_asset_code'], fallback: '');
    final description = _value(
      _asset['Keterangan'] ?? _asset['description'],
      fallback: '',
    );
    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _descriptionGrid(fields),
          if (parentCode.isNotEmpty) ...[
            const SizedBox(height: 16),
            Material(
              color: const Color(0xFFEFF4FF),
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => widget.onOpenAsset(parentCode),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      const Icon(Icons.account_tree, size: 18, color: _brand),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Text(
                          'Berada di dalam: ${_value(_asset['parent_asset_name'], fallback: parentCode)} ($parentCode)',
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF1D4ED8),
                          ),
                        ),
                      ),
                      const Icon(Icons.chevron_right, size: 18, color: _brand),
                    ],
                  ),
                ),
              ),
            ),
          ],
          if (description.isNotEmpty) ...[
            const Divider(height: 30),
            const Text(
              'Keterangan',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: _muted,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              description,
              style: const TextStyle(
                  fontSize: 13, height: 1.45, color: Color(0xFF334155)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildEnergy() {
    final profile = _map(_asset['energy_profile']);
    return _panel(
      child: _section(
        'Profil Energy',
        'Extension Energy yang tertaut pada AssetID ini.',
        _descriptionGrid([
          MapEntry('Jenis aset', _value(profile['energy_type'])),
          MapEntry('Jenis utility', _value(profile['utility_type'])),
          MapEntry('Kode profil', _value(profile['profile_code'])),
          MapEntry('Ownership', _value(profile['ownership_custodian'])),
          MapEntry(
              'Tanggal commissioning', _date(profile['commissioning_date'])),
          MapEntry('Status', _value(profile['status'])),
          if (profile['meter_number'] != null)
            MapEntry('Nomor meter', _value(profile['meter_number'])),
          if (profile['meter_unit'] != null)
            MapEntry('Satuan meter', _value(profile['meter_unit'])),
          if (profile['rated_kva'] != null)
            MapEntry('Rated kVA', _value(profile['rated_kva'])),
          if (profile['tank_number'] != null)
            MapEntry('Nomor tank', _value(profile['tank_number'])),
        ]),
      ),
    );
  }

  Widget _buildFleet() {
    final profile = _map(_asset['fleet_profile']);
    final meterUnit = '${profile['meter_type']}' == 'ODOMETER' ? 'km' : 'jam';
    return _panel(
      child: _section(
        'Profil Fleet',
        'Data kendaraan atau forklift yang tertaut pada asset ini.',
        _descriptionGrid([
          MapEntry('Jenis', _value(profile['vehicle_type'])),
          MapEntry('Nomor registrasi', _value(profile['registration_number'])),
          MapEntry('Merek', _value(profile['make'])),
          MapEntry('Model', _value(profile['model'])),
          MapEntry('Tahun', _value(profile['manufacture_year'])),
          MapEntry(
            'Odometer / Hour meter',
            '${_value(profile['current_meter'])} $meterUnit',
          ),
          MapEntry('Custodian', _value(profile['custodian_name'])),
          MapEntry('Department', _value(profile['department_name'])),
          MapEntry('Status', _value(profile['status'])),
        ]),
      ),
    );
  }

  Widget _buildBom() {
    final parts = _maps(_asset['parts']);
    if (parts.isEmpty) {
      return _empty(Icons.account_tree_outlined, 'Belum ada part / BOM');
    }
    return _panel(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          _tableHeader(['PART', 'STOK', 'STATUS'], const [5, 2, 2]),
          ...parts.map((part) {
            final level = _int(part['level'], fallback: 1).clamp(1, 8);
            final partName = _value(
              part['part'] ??
                  part['part_name'] ??
                  part['nama_part'] ??
                  part['header'],
            );
            final active = _int(part['is_active'], fallback: 1) != 0;
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: Color(0xFFF1F5F9))),
              ),
              child: Row(
                children: [
                  Expanded(
                    flex: 5,
                    child: Padding(
                      padding: EdgeInsets.only(left: (level - 1) * 16.0),
                      child: Text(
                        partName,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: part['part'] == null
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: _ink,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text(
                      '${_value(part['qty_on_hand'])} ${_value(part['uom'], fallback: '')}'
                          .trim(),
                      textAlign: TextAlign.right,
                      style: const TextStyle(fontSize: 12, color: _muted),
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Text(
                      active ? 'Aktif' : 'Nonaktif',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: active ? const Color(0xFF15803D) : _muted,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildRelated() {
    return TabletAssetRelatedManager(
      assetCode: widget.assetCode,
      children: _maps(_asset['children']),
      groups: _maps(_asset['related_groups']),
      canWrite: _canWriteAsset,
      onOpenAsset: widget.onOpenAsset,
      onChanged: _load,
    );
  }

  Widget _buildCustom() {
    if (_customDetails.isEmpty) {
      return _empty(Icons.tune_outlined, 'Belum ada Custom Detail');
    }
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 960 ? 3 : 2;
      const gap = 12.0;
      final width = (constraints.maxWidth - (columns - 1) * gap) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: _customDetails.map((row) {
          final images = _maps(row['images']);
          return SizedBox(
            width: width,
            child: _panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _value(row['bagian'], fallback: 'Custom Detail'),
                    style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: _ink),
                  ),
                  const Divider(height: 20),
                  _miniField('Bagian Mesin', row['bagian_mesin']),
                  _miniField('Part Mesin', row['part_mesin']),
                  _miniField('Kondisi', row['kondisi']),
                  _miniField('Durasi', row['durasi_pengecekan']),
                  _miniField('PIC', row['pic']),
                  _miniField('Part Diperlukan', row['part_diperlukan']),
                  if (images.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      '${images.length} gambar terlampir',
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: _brand),
                    ),
                  ],
                ],
              ),
            ),
          );
        }).toList(),
      );
    });
  }

  Widget _miniField(String label, dynamic value) => Padding(
        padding: const EdgeInsets.only(bottom: 7),
        child: RichText(
          text: TextSpan(
            style: const TextStyle(
                fontSize: 11.5, height: 1.35, color: Color(0xFF334155)),
            children: [
              TextSpan(text: '$label: ', style: const TextStyle(color: _muted)),
              TextSpan(
                  text: _value(value),
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      );

  Widget _buildGallery() {
    final attachments = _maps(_asset['attachments']);
    if (attachments.isEmpty) {
      return _empty(Icons.photo_library_outlined, 'Belum ada lampiran / foto');
    }
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 1000
          ? 4
          : constraints.maxWidth >= 650
              ? 3
              : 2;
      const gap = 12.0;
      final width = (constraints.maxWidth - (columns - 1) * gap) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: gap,
        children: attachments.map((file) {
          final isImage = '${file['type']}' == 'image';
          final url =
              ApiConstants.mediaUrl('${file['url'] ?? file['filename'] ?? ''}');
          return SizedBox(
            width: width,
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: isImage && url.isNotEmpty
                    ? () => _showImage(url, _value(file['name']))
                    : null,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _line),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AspectRatio(
                        aspectRatio: 16 / 9,
                        child: isImage && url.isNotEmpty
                            ? Image.network(
                                url,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _filePlaceholder(
                                    Icons.broken_image_outlined),
                              )
                            : _filePlaceholder(Icons.description_outlined),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _value(file['name'] ?? file['filename']),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: _ink),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _value(file['category_name'],
                                  fallback: isImage ? 'Gambar' : 'Dokumen'),
                              style: const TextStyle(
                                  fontSize: 10.5, color: _muted),
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

  Widget _filePlaceholder(IconData icon) => Container(
        color: _surface,
        alignment: Alignment.center,
        child: Icon(icon, size: 36, color: const Color(0xFF94A3B8)),
      );

  void _showImage(String url, String title) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 8, 8),
              child: Row(
                children: [
                  Expanded(
                      child: Text(title,
                          style: const TextStyle(fontWeight: FontWeight.w600))),
                  IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close)),
                ],
              ),
            ),
            Flexible(
                child: InteractiveViewer(
                    child: Image.network(url, fit: BoxFit.contain))),
          ],
        ),
      ),
    );
  }

  Widget _buildHistory() {
    final locations = _maps(_asset['location_history']);
    final workOrders = _maps(_asset['history']);
    return Column(
      children: [
        _panel(
          child: _section(
            'Riwayat Lokasi',
            'Jejak ruangan atau lokasi yang pernah ditempati aset ini.',
            locations.isEmpty
                ? const Text('Belum ada riwayat lokasi.',
                    style: TextStyle(fontSize: 12, color: _muted))
                : Column(
                    children: locations.map((row) {
                      final initial =
                          '${row['event_type']}'.toUpperCase() == 'INITIAL';
                      final from = _value(row['location_from']);
                      final to = _value(row['location_to']);
                      return _timelineItem(
                        initial ? 'Lokasi awal: $to' : '$from → $to',
                        '${_date(row['moved_at'])}${row['changed_by'] == null ? '' : ' · ${row['changed_by']}'}',
                        _value(row['note'], fallback: ''),
                      );
                    }).toList(),
                  ),
          ),
        ),
        const SizedBox(height: 14),
        _panel(
          child: _section(
            'Riwayat Pekerjaan',
            'Seluruh work order yang pernah terkait dengan aset ini.',
            workOrders.isEmpty
                ? const Text('Belum ada riwayat pekerjaan.',
                    style: TextStyle(fontSize: 12, color: _muted))
                : Column(
                    children: workOrders.map((row) {
                      return _timelineItem(
                        _value(row['job_title']),
                        '${_date(row['created_at'])}${row['wo_source'] == null ? '' : ' · ${row['wo_source']}'}',
                        row['wo_number'] == null
                            ? ''
                            : 'WO ${row['wo_number']}',
                      );
                    }).toList(),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _timelineItem(String title, String meta, String body) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration:
                    const BoxDecoration(color: _brand, shape: BoxShape.circle),
              ),
              Container(width: 1, height: 54, color: _line),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: _ink)),
                  const SizedBox(height: 3),
                  Text(meta,
                      style: const TextStyle(fontSize: 10.5, color: _muted)),
                  if (body.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(body,
                        style: const TextStyle(
                            fontSize: 11.5, color: Color(0xFF475569))),
                  ],
                ],
              ),
            ),
          ),
        ],
      );

  Widget _descriptionGrid(List<MapEntry<String, String>> fields) {
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 900 ? 3 : 2;
      const gap = 18.0;
      final width = (constraints.maxWidth - (columns - 1) * gap) / columns;
      return Wrap(
        spacing: gap,
        runSpacing: 18,
        children: fields.map((field) {
          return SizedBox(
            width: width,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(field.key,
                    style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: _muted)),
                const SizedBox(height: 4),
                Text(field.value,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _ink)),
              ],
            ),
          );
        }).toList(),
      );
    });
  }

  Widget _section(String title, String subtitle, Widget child) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w800, color: _ink)),
          const SizedBox(height: 3),
          Text(subtitle, style: const TextStyle(fontSize: 11.5, color: _muted)),
          const SizedBox(height: 16),
          child,
        ],
      );

  Widget _panel(
          {required Widget child,
          EdgeInsetsGeometry padding = const EdgeInsets.all(18)}) =>
      Container(
        width: double.infinity,
        padding: padding,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _line),
        ),
        clipBehavior: Clip.antiAlias,
        child: child,
      );

  Widget _tableHeader(List<String> labels, List<int> flex) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        color: _surface,
        child: Row(
          children: List.generate(
            labels.length,
            (index) => Expanded(
              flex: flex[index],
              child: Text(
                labels[index],
                textAlign: index == 0 ? TextAlign.left : TextAlign.center,
                style: const TextStyle(
                    fontSize: 10.5, fontWeight: FontWeight.w700, color: _muted),
              ),
            ),
          ),
        ),
      );

  Widget _empty(IconData icon, String message) => _panel(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 38),
          child: Column(
            children: [
              Icon(icon, size: 38, color: const Color(0xFFCBD5E1)),
              const SizedBox(height: 10),
              Text(message,
                  style: const TextStyle(fontSize: 13, color: _muted)),
            ],
          ),
        ),
      );

  Widget _buildError() => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline,
                  size: 40, color: Color(0xFFE11D48)),
              const SizedBox(height: 10),
              Text(_error ?? 'Gagal memuat detail aset.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 13, color: _muted)),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: _load, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );

  static List<Map<String, dynamic>> _maps(dynamic value) =>
      (value as List? ?? const [])
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();

  static Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  static String _value(dynamic value, {String fallback = '-'}) {
    final text = '${value ?? ''}'.trim();
    return text.isEmpty ? fallback : text;
  }

  static int _int(dynamic value, {int fallback = 0}) =>
      value is num ? value.toInt() : int.tryParse('$value') ?? fallback;

  static String _date(dynamic value) {
    final raw = '${value ?? ''}'.trim();
    if (raw.isEmpty) return '-';
    final parsed = DateTime.tryParse(raw);
    return parsed == null ? raw : DateFormat('dd MMM yyyy').format(parsed);
  }
}
