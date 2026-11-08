import 'package:flutter/material.dart';
import '../../../core/widgets/mini_charts.dart';
import '../../../data/providers/api_service.dart';
import '../../../data/repositories/dashboard_repository.dart';
import '../../../data/repositories/approval_repository.dart';
import '../../../data/models/approval_center_model.dart';

/// Warna semantik — disalin persis dari `SEMANTIC_COLORS`/`SEVERITY_COLORS`
/// di `mcs_web/src/components/ui/mini-charts.tsx`, supaya dashboard tablet
/// memakai palet yang sama persis dengan web, bukan kira-kira.
const _cBrand = Color(0xFF1B54E0);
const _cSuccess = Color(0xFF16A34A);
const _cWarning = Color(0xFFF59E0B);
const _cDanger = Color(0xFFE11D48);
const _cViolet = Color(0xFF7C3AED);
const _cBrandShades = [
  Color(0xFF1642B8),
  Color(0xFF1B54E0),
  Color(0xFF2F72F7),
  Color(0xFF5998FF),
  Color(0xFF8EBDFF),
  Color(0xFFBCD7FF),
];
const _cSeverity = [Color(0xFF16A34A), Color(0xFFEAB308), Color(0xFFF97316), Color(0xFFEF4444)];

Color _shadeForRank(int i, int n) {
  if (n <= 1) return _cBrandShades[1];
  final idx = ((i / (n - 1).clamp(1, 1 << 30)) * (_cBrandShades.length - 1)).round();
  return _cBrandShades[idx.clamp(0, _cBrandShades.length - 1)];
}

const List<int> _kRanges = [7, 14, 30, 90];

/// Dashboard tablet — padanan layout web `/dashboard` (KPI, Preventive
/// Harian, Tren WO, Komposisi Status, WO per Modul/Umur/Company, Aset
/// Tersering, Rincian Status, Antrian Approval, WO Terbaru), dibangun
/// native dari endpoint agregat yang sama (`/v2/dashboard`,
/// `/v2/work-orders`, approval summary) yang sudah dipakai di Home HP.
/// Tidak ada endpoint baru yang dibutuhkan untuk halaman ini.
class TabletDashboardPage extends StatefulWidget {
  const TabletDashboardPage({super.key});

  @override
  State<TabletDashboardPage> createState() => _TabletDashboardPageState();
}

class _TabletDashboardPageState extends State<TabletDashboardPage> {
  final _dashboardRepo = DashboardRepository();
  final _approvalRepo = ApprovalRepository();

  int _range = 7;
  bool _loading = true;
  bool _fetching = false;
  String? _error;
  Map<String, dynamic>? _summary;
  ApprovalSummary? _approvalSummary;
  List<Map<String, dynamic>> _recentWo = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _summary == null;
      _fetching = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _dashboardRepo.getDashboardSummary(range: _range),
        _approvalRepo.getSummary(),
        _loadRecentWo(),
      ]);
      setState(() {
        _summary = results[0] as Map<String, dynamic>;
        _approvalSummary = results[1] as ApprovalSummary;
        _recentWo = results[2] as List<Map<String, dynamic>>;
        _loading = false;
        _fetching = false;
      });
    } catch (e) {
      setState(() {
        _error = '$e';
        _loading = false;
        _fetching = false;
      });
    }
  }

  Future<List<Map<String, dynamic>>> _loadRecentWo() async {
    try {
      final response = await ApiService().get(
        '/v2/work-orders',
        queryParameters: {'page': 1, 'per_page': 8},
      );
      final data = response.data;
      if (data['success'] == true || data['status'] == true) {
        final list = (data['data'] as List? ?? []);
        return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  static int _asInt(dynamic v) {
    if (v == null) return 0;
    if (v is int) return v;
    if (v is double) return v.round();
    return int.tryParse('$v') ?? 0;
  }

  static double? _asDoubleN(dynamic v) {
    if (v == null) return null;
    if (v is double) return v;
    if (v is int) return v.toDouble();
    return double.tryParse('$v');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _summary == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: const TextStyle(color: _cDanger)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('Coba lagi')),
          ],
        ),
      );
    }

    final data = _summary ?? {};
    final totals = Map<String, dynamic>.from(data['totals'] as Map? ?? {});
    final delta = Map<String, dynamic>.from(data['delta'] as Map? ?? {});
    final byType = Map<String, dynamic>.from(data['by_type'] as Map? ?? {});
    final agingList = (data['aging'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final trendList = (data['trend'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final preventiveDailyList = (data['preventive_daily'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final byModule = (data['by_module'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final byCompany = (data['by_company'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final topAssets = (data['top_assets'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final byStatus = (data['by_status'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();

    final open = _asInt(totals['open']);
    final inProgress = _asInt(totals['in_progress']);
    final closed = _asInt(totals['closed']);
    final total = _asInt(totals['total']);
    final rejected = _asInt(totals['rejected']);
    final overdue = agingList.length >= 4
        ? _asInt(agingList[2]['count']) + _asInt(agingList[3]['count'])
        : 0;
    final approvalCount = (_approvalSummary?.woApprovals ?? 0) +
        (_approvalSummary?.woClosings ?? 0) +
        (_approvalSummary?.materials ?? 0) +
        (_approvalSummary?.mutations ?? 0);

    final activeModules = byModule.where((m) => _asInt(m['total']) > 0).toList();
    final zeroModules = byModule.where((m) => _asInt(m['total']) == 0).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(),
        child: Opacity(
          opacity: _fetching && !_loading ? 0.7 : 1,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeaderRow(),
              const SizedBox(height: 16),
              _buildKpiGrid([
                _KpiData('Menunggu Approval', '$approvalCount', Icons.verified_outlined, _cWarning, const Color(0xFFFFFBEB)),
                _KpiData('WO Overdue', '$overdue', Icons.warning_amber_rounded, _cDanger, const Color(0xFFFFF1F2), sub: 'Umur WO terbuka > 7 hari'),
                _KpiData('Sedang Berjalan', '${open + inProgress}', Icons.autorenew, _cViolet, const Color(0xFFF5F3FF), sub: '$open antre · $inProgress dikerjakan'),
                _KpiData('Ditutup', '$closed', Icons.check_circle_outline, _cSuccess, const Color(0xFFECFDF5), pct: _asDoubleN(delta['closed_pct'])),
              ]),
              const SizedBox(height: 10),
              _buildKpiGrid([
                _KpiData('Total WO ($_range h)', '$total', Icons.access_time, _cBrand, const Color(0xFFEFF4FF), pct: _asDoubleN(delta['total_pct']), neutral: true),
                _KpiData('WO Corrective', '${_asInt(byType['corrective'])}', Icons.build_outlined, _cWarning, const Color(0xFFFFFBEB), pct: _asDoubleN(byType['corrective_pct']), sub: 'Makin sedikit makin baik'),
                _KpiData('WO Project', '${_asInt(byType['project'])}', Icons.folder_outlined, _cViolet, const Color(0xFFF5F3FF), pct: _asDoubleN(byType['project_pct']), neutral: true),
                null,
              ], preventiveRatio: byType),
              const SizedBox(height: 16),
              _card(
                title: 'Preventive Harian',
                trailing: _legendRow(),
                child: preventiveDailyList.isNotEmpty
                    ? DailyStatusBars(
                        data: preventiveDailyList
                            .map((d) => DailyStatusPoint(
                                  '${d['date']}',
                                  _asDoubleN(d['closed_pct']) ?? 0,
                                  _asDoubleN(d['in_progress_pct']) ?? 0,
                                  _asDoubleN(d['open_pct']) ?? 0,
                                  _asInt(d['total']),
                                ))
                            .toList(),
                      )
                    : const Text('Belum ada data', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
              ),
              const SizedBox(height: 16),
              LayoutBuilder(builder: (context, c) {
                final wide = c.maxWidth > 820;
                final trendCard = _card(
                  title: 'Tren Work Order',
                  trailing: Text(
                    '${data['from'] ?? ''} – ${data['to'] ?? ''}',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                  ),
                  child: TrendChartFull(
                    height: 170,
                    data: trendList
                        .map((t) => TrendPoint(
                              '${t['date']}',
                              _asDoubleN(t['created']) ?? 0,
                              _asDoubleN(t['closed']) ?? 0,
                              _asDoubleN(t['closed_corrective']) ?? 0,
                            ))
                        .toList(),
                  ),
                );
                final statusCard = _card(
                  title: 'Komposisi Status',
                  child: _buildStackedStatus(total, open, inProgress, closed, rejected),
                );
                if (!wide) {
                  return Column(children: [trendCard, const SizedBox(height: 16), statusCard]);
                }
                return IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(flex: 2, child: trendCard),
                      const SizedBox(width: 16),
                      Expanded(flex: 1, child: statusCard),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 16),
              LayoutBuilder(builder: (context, c) {
                final moduleItems = [
                  ...activeModules.asMap().entries.map((e) => MiniBarItem(
                        '${e.value['label']}',
                        _asInt(e.value['total']),
                        color: _shadeForRank(e.key, activeModules.length),
                        sub: '${_asInt(e.value['open']) + _asInt(e.value['in_progress'])} aktif',
                      )),
                  if (zeroModules.isNotEmpty)
                    MiniBarItem(
                      'Lainnya',
                      0,
                      color: const Color(0xFFCBD5E1),
                      sub: '${zeroModules.length} modul tanpa aktivitas',
                    ),
                ];
                final agingItems = agingList.asMap().entries
                    .map((e) => MiniBarItem('${e.value['bucket']}', _asInt(e.value['count']), color: _cSeverity[e.key.clamp(0, 3)]))
                    .toList();
                final companyItems = byCompany.asMap().entries
                    .map((e) => MiniBarItem('${e.value['company']}', _asInt(e.value['total']), color: _shadeForRank(e.key, byCompany.length)))
                    .toList();
                final cards = [
                  _card(title: 'WO per Modul', child: _barListOrEmpty(moduleItems)),
                  _card(
                    title: 'Umur WO Terbuka',
                    titleIcon: Icons.warning_amber_rounded,
                    titleIconColor: _cWarning,
                    child: _barListOrEmpty(agingItems),
                  ),
                  _card(title: 'WO per Company', child: _barListOrEmpty(companyItems)),
                ];
                return _responsiveTriple(c.maxWidth, cards);
              }),
              const SizedBox(height: 16),
              LayoutBuilder(builder: (context, c) {
                final assetItems = topAssets
                    .map((a) => MiniBarItem(
                          '${a['asset_name'] ?? a['asset_code'] ?? '#${a['asset_id']}'}',
                          _asInt(a['count']),
                          sub: a['asset_code'] != null && '${a['asset_code']}'.isNotEmpty ? '${a['asset_code']}' : null,
                        ))
                    .toList();
                final statusItems = byStatus.map((s) => MiniBarItem('${s['label']}', _asInt(s['count']))).toList();
                final wide = c.maxWidth > 700;
                final a = _card(title: 'Aset Paling Sering WO', child: _barListOrEmpty(assetItems));
                final b = _card(title: 'Rincian Status', child: _barListOrEmpty(statusItems));
                if (!wide) return Column(children: [a, const SizedBox(height: 16), b]);
                return IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [Expanded(child: a), const SizedBox(width: 16), Expanded(child: b)],
                  ),
                );
              }),
              const SizedBox(height: 16),
              LayoutBuilder(builder: (context, c) {
                final wide = c.maxWidth > 820;
                final approvalCard = _card(title: 'Antrian Approval', child: _approvalQueueList());
                final recentCard = _card(title: 'Work Order Terbaru', child: _recentWoTable());
                if (!wide) return Column(children: [approvalCard, const SizedBox(height: 16), recentCard]);
                return IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(flex: 1, child: approvalCard),
                      const SizedBox(width: 16),
                      Expanded(flex: 2, child: recentCard),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  'Angka mengikuti hak akses modul & divisi Anda. Diperbarui ${data['generated_at'] ?? ''}.',
                  style: const TextStyle(fontSize: 10.5, color: Color(0xFF94A3B8)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _responsiveTriple(double width, List<Widget> cards) {
    if (width > 900) {
      return IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: cards[0]),
            const SizedBox(width: 16),
            Expanded(child: cards[1]),
            const SizedBox(width: 16),
            Expanded(child: cards[2]),
          ],
        ),
      );
    }
    if (width > 600) {
      return Column(
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [Expanded(child: cards[0]), const SizedBox(width: 16), Expanded(child: cards[1])],
            ),
          ),
          const SizedBox(height: 16),
          cards[2],
        ],
      );
    }
    return Column(children: [cards[0], const SizedBox(height: 16), cards[1], const SizedBox(height: 16), cards[2]]);
  }

  Widget _barListOrEmpty(List<MiniBarItem> items) {
    if (items.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: Text('Tidak ada data.', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)))),
      );
    }
    return MiniBarList(items: items);
  }

  Widget _buildHeaderRow() {
    return Row(
      children: [
        const Expanded(
          child: Text(
            'Dashboard',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
          ),
        ),
        Container(
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(border: Border.all(color: const Color(0xFFE2E8F0)), borderRadius: BorderRadius.circular(8)),
          child: Row(
            children: _kRanges.map((r) {
              final active = r == _range;
              return GestureDetector(
                onTap: () {
                  setState(() => _range = r);
                  _load();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: active ? _cBrand : Colors.transparent,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '$r hari',
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: active ? Colors.white : const Color(0xFF64748B),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          onPressed: _load,
          icon: _fetching
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.refresh, size: 18),
          style: IconButton.styleFrom(
            backgroundColor: Colors.white,
            side: const BorderSide(color: Color(0xFFE2E8F0)),
          ),
        ),
      ],
    );
  }

  Widget _buildKpiGrid(List<_KpiData?> items, {Map<String, dynamic>? preventiveRatio}) {
    return LayoutBuilder(builder: (context, c) {
      final cross = c.maxWidth > 900 ? 4 : (c.maxWidth > 600 ? 2 : 1);
      return GridView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: cross,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          mainAxisExtent: 96,
        ),
        children: items.map((it) {
          if (it == null && preventiveRatio != null) {
            return _preventiveRatioCard(preventiveRatio);
          }
          return _kpiCard(it!);
        }).toList(),
      );
    });
  }

  Widget _kpiCard(_KpiData it) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: it.bg, borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.center,
            child: Icon(it.icon, size: 15, color: it.color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(it.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, color: Color(0xFF64748B))),
                Text(it.value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
                if (it.sub != null)
                  Text(it.sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 9.5, color: Color(0xFF94A3B8))),
                if (it.pct != null) _deltaLabel(it.pct!, it.neutral),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _preventiveRatioCard(Map<String, dynamic> byType) {
    final ratio = _asDoubleN(byType['preventive_ratio']);
    final deltaPts = _asDoubleN(byType['preventive_ratio_delta_pts']);
    final preventive = _asInt(byType['preventive']);
    final corrective = _asInt(byType['corrective']);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: const Color(0xFFECFDF5), borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.center,
            child: const Icon(Icons.shield_outlined, size: 15, color: _cSuccess),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const Flexible(
                      child: Text('Rasio Preventive', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, color: Color(0xFF64748B))),
                    ),
                    const SizedBox(width: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(999)),
                      child: const Text('target 90%', style: TextStyle(fontSize: 8.5, color: Color(0xFF64748B))),
                    ),
                  ],
                ),
                Text(ratio == null ? '-' : '${ratio.toStringAsFixed(0)}%', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
                Text('$preventive PM vs $corrective CM', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 9.5, color: Color(0xFF94A3B8))),
                if (deltaPts != null) _deltaLabel(deltaPts, false, suffix: ' poin'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _deltaLabel(double pct, bool neutral, {String suffix = '% vs periode lalu'}) {
    if (neutral) {
      return Text(
        '${pct >= 0 ? '+' : ''}${pct.toStringAsFixed(0)}$suffix',
        style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w600, color: Color(0xFF64748B)),
      );
    }
    final good = pct >= 0;
    final color = good ? _cSuccess : _cDanger;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(good ? Icons.arrow_outward : Icons.south_east, size: 10, color: color),
        const SizedBox(width: 1),
        Flexible(
          child: Text(
            '${pct.abs().toStringAsFixed(0)}$suffix',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w600, color: color),
          ),
        ),
      ],
    );
  }

  Widget _legendRow() {
    Widget dot(Color c, String l) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 7, height: 7, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
            const SizedBox(width: 4),
            Text(l, style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B))),
          ],
        );
    return Wrap(
      spacing: 12,
      children: [dot(_cSuccess, 'Selesai'), dot(_cBrand, 'Dikerjakan'), dot(_cWarning, 'Belum')],
    );
  }

  Widget _buildStackedStatus(int total, int open, int inProgress, int closed, int rejected) {
    final segments = [
      ('Antre', open, _cWarning),
      ('Dikerjakan', inProgress, _cBrand),
      ('Ditutup', closed, _cSuccess),
      ('Ditolak/Void', rejected, _cDanger),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text('$total', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
            const SizedBox(width: 6),
            const Text('total WO', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: SizedBox(
            height: 10,
            child: total <= 0
                ? Container(color: const Color(0xFFF1F5F9))
                : Row(
                    children: segments
                        .where((s) => s.$2 > 0)
                        .map((s) => Expanded(flex: s.$2, child: Container(color: s.$3)))
                        .toList(),
                  ),
          ),
        ),
        const SizedBox(height: 12),
        ...segments.map((s) {
          final pct = total > 0 ? (s.$2 / total * 100).round() : null;
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                Container(width: 9, height: 9, decoration: BoxDecoration(color: s.$3, borderRadius: BorderRadius.circular(2))),
                const SizedBox(width: 8),
                Expanded(child: Text(s.$1, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)))),
                Text('${s.$2}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF1F2937))),
                const SizedBox(width: 8),
                SizedBox(width: 32, child: Text(pct == null ? '-' : '$pct%', textAlign: TextAlign.right, style: const TextStyle(fontSize: 11.5, color: Color(0xFF94A3B8)))),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _approvalQueueList() {
    final s = _approvalSummary;
    if (s == null) {
      return const Text('-', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)));
    }
    final rows = [
      ('WO Approval', s.woApprovals),
      ('WO Closing', s.woClosings),
      ('Material Request', s.materials),
      ('Asset Mutation', s.mutations),
    ];
    return Column(
      children: rows
          .map((r) => Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(8)),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(r.$1, style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569))),
                    Text('${r.$2}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Color(0xFF0F172A))),
                  ],
                ),
              ))
          .toList(),
    );
  }

  static const Map<String, Color> _toneGreen = {'bg': Color(0xFFECFDF5), 'fg': Color(0xFF047857)};

  (Color, Color, String) _statusTone(String raw) {
    final s = raw.toLowerCase().trim();
    if (s.contains('close') || s.contains('done') || s.contains('complete') || s.contains('approve') || s.contains('active')) {
      return (_toneGreen['bg']!, _toneGreen['fg']!, raw);
    }
    if (s.contains('reject') || s.contains('decline') || s.contains('void') || s.contains('fail') || s.contains('error')) {
      return (const Color(0xFFFFF1F2), const Color(0xFFBE123C), raw);
    }
    if (s.contains('progress') || s.contains('running')) {
      return (const Color(0xFFECFEFF), const Color(0xFF0E7490), raw);
    }
    if (s.contains('wait') || s.contains('pending') || s.contains('hold') || s.contains('need')) {
      return (const Color(0xFFFFFBEB), const Color(0xFF92400E), raw);
    }
    return (const Color(0xFFF1F5F9), const Color(0xFF475569), raw);
  }

  Widget _recentWoTable() {
    if (_recentWo.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: Text('Belum ada data.', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)))),
      );
    }
    const moduleLabel = {'meso': 'MESO', 'maintenance': 'Maintenance', 'production': 'Production', 'is': 'IS', 'ga': 'GA'};
    return Column(
      children: [
        Row(
          children: const [
            Expanded(flex: 3, child: Text('No. WO', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFF94A3B8)))),
            Expanded(flex: 4, child: Text('Deskripsi', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFF94A3B8)))),
            Expanded(flex: 2, child: Text('Modul', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFF94A3B8)))),
            Expanded(flex: 2, child: Text('Status', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFF94A3B8)))),
          ],
        ),
        const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Divider(height: 1)),
        ..._recentWo.map((r) {
          final status = '${r['status'] ?? ''}';
          final tone = _statusTone(status);
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(flex: 3, child: Text('${r['wo_number'] ?? '-'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)))),
                Expanded(flex: 4, child: Text('${r['job_title'] ?? '-'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: Color(0xFF475569)))),
                Expanded(flex: 2, child: Text(moduleLabel['${r['module'] ?? ''}'] ?? '${r['module'] ?? '-'}', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)))),
                Expanded(
                  flex: 2,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(color: tone.$1, borderRadius: BorderRadius.circular(999)),
                      child: Text(status, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: tone.$2)),
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _card({required String title, Widget? trailing, IconData? titleIcon, Color? titleIconColor, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              if (titleIcon != null) ...[
                Icon(titleIcon, size: 15, color: titleIconColor ?? const Color(0xFF64748B)),
                const SizedBox(width: 6),
              ],
              Expanded(
                child: Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF111827))),
              ),
              if (trailing != null) trailing,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _KpiData {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final Color bg;
  final String? sub;
  final double? pct;
  final bool neutral;
  _KpiData(this.label, this.value, this.icon, this.color, this.bg, {this.sub, this.pct, this.neutral = false});
}
