import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/constants/app_colors.dart';
import '../controllers/report_wo_recap_controller.dart';
import '../../../data/models/wo_constants.dart';

const Color _bg = Color(0xFFF6F8FB);
const Color _border = Color(0xFFE5E7EB);
const Color _textDark = Color(0xFF111827);
const Color _textMuted = Color(0xFF6B7280);

const List<String> _monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const Map<String, Color> _moduleColors = {
  'meso': Color(0xFF7C3AED),
  'maintenance': Color(0xFF0F766E),
  'production': Color(0xFFEA580C),
  'is': Color(0xFF2563EB),
  'ga': Color(0xFF0891B2),
};

String _pick(Map<String, dynamic> row, List<String> keys) {
  for (final key in keys) {
    final value = row[key];
    if (value != null && '$value'.trim().isNotEmpty) return '$value'.trim();
  }
  return '';
}

String _titleCase(String value) => value
    .toLowerCase()
    .split(RegExp(r'\s+'))
    .where((w) => w.isNotEmpty)
    .map((w) => '${w[0].toUpperCase()}${w.substring(1)}')
    .join(' ');

String _statusLabel(String raw) => WoStatusLabels.of(raw);

String _formatDate(String raw) {
  final value = raw.trim();
  if (value.isEmpty || value.startsWith('0000')) return '-';
  final parsed = DateTime.tryParse(value.replaceFirst(' ', 'T'));
  if (parsed == null) return value;
  final d = parsed.isUtc ? parsed.toLocal() : parsed;
  return '${d.day.toString().padLeft(2, '0')} ${_monthNames[d.month - 1]} ${d.year}';
}

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _formatNumber(int n) {
  final digits = n.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digits[i]);
  }
  return buffer.toString();
}

String _percent(int n, int total) =>
    total > 0 ? '${(n / total * 100).toStringAsFixed(1)}%' : '-';

Color _statusColor(String raw) {
  final s = raw.trim().toUpperCase();
  if (s.startsWith('WAIT')) return const Color(0xFFB45309);
  if (s == 'CLOSED') return const Color(0xFF15803D);
  if (s == 'REJECT' || s == 'DECLINE' || s == 'VOID') {
    return const Color(0xFFB91C1C);
  }
  return const Color(0xFF1D4ED8);
}

class ReportWoRecapPage extends StatelessWidget {
  const ReportWoRecapPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportWoRecapController());

    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        centerTitle: false,
        title: const Text(
          'Recap Work Order',
          style: TextStyle(fontSize: 18),
        ),
        actions: [
          _ExportButton(
            controller: controller,
            format: 'xlsx',
            icon: Icons.table_chart_outlined,
            tooltip: 'Export Excel',
          ),
          _ExportButton(
            controller: controller,
            format: 'pdf',
            icon: Icons.picture_as_pdf_outlined,
            tooltip: 'Export PDF',
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Obx(() {
        if (!controller.isReady.value) {
          return const Center(child: CircularProgressIndicator());
        }
        if (controller.allowedModules.isEmpty) {
          return const _CenterMessage(
            icon: Icons.lock_outline,
            title: 'Tidak ada akses',
            message: 'Anda tidak punya akses ke modul Work Order manapun.',
          );
        }
        return Column(
          children: [
            _SearchBar(controller: controller),
            _ModuleTabs(controller: controller),
            Expanded(child: _RecapBody(controller: controller)),
          ],
        );
      }),
    );
  }
}

class _ExportButton extends StatelessWidget {
  final ReportWoRecapController controller;
  final String format;
  final IconData icon;
  final String tooltip;

  const _ExportButton({
    required this.controller,
    required this.format,
    required this.icon,
    required this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final busy = controller.exporting.value;
      if (busy == format) {
        return const SizedBox(
          width: 48,
          height: 48,
          child: Center(
            child: SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            ),
          ),
        );
      }
      return IconButton(
        tooltip: tooltip,
        icon: Icon(icon, size: 22),
        onPressed: busy.isEmpty ? () => controller.export(format) : null,
      );
    });
  }
}

class _SearchBar extends StatelessWidget {
  final ReportWoRecapController controller;

  const _SearchBar({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 40,
              child: ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller.searchController,
                builder: (context, value, _) => TextField(
                  controller: controller.searchController,
                  onChanged: controller.onSearchChanged,
                  textInputAction: TextInputAction.search,
                  style: const TextStyle(fontSize: 13),
                  decoration: InputDecoration(
                    isDense: true,
                    filled: true,
                    fillColor: Colors.white,
                    hintText: 'Cari no. WO, pekerjaan, aset',
                    hintStyle:
                        const TextStyle(fontSize: 13, color: _textMuted),
                    prefixIcon: const Icon(Icons.search, size: 18),
                    prefixIconConstraints:
                        const BoxConstraints(minWidth: 36, minHeight: 36),
                    suffixIcon: value.text.isEmpty
                        ? null
                        : IconButton(
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(
                                minWidth: 36, minHeight: 36),
                            icon: const Icon(Icons.close, size: 16),
                            onPressed: controller.clearSearch,
                          ),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: _border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: _border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: AppColors.primary),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Obx(() {
            final count = controller.activeFilterCount;
            return Material(
              color: count > 0 ? AppColors.primary : Colors.white,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => _openFilterSheet(context, controller),
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: count > 0 ? AppColors.primary : _border,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.tune,
                        size: 18,
                        color: count > 0 ? Colors.white : _textDark,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        count > 0 ? 'Filter ($count)' : 'Filter',
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: count > 0 ? Colors.white : _textDark,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _ModuleTabs extends StatelessWidget {
  final ReportWoRecapController controller;

  const _ModuleTabs({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final modules = controller.allowedModules.toList();
      final active = controller.activeModule.value;
      return SizedBox(
        height: 42,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
          itemCount: modules.length,
          separatorBuilder: (_, __) => const SizedBox(width: 6),
          itemBuilder: (context, index) {
            final key = modules[index];
            final selected = key == active;
            final label = ReportWoRecapController.moduleLabels[key] ?? key;
            return InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => controller.selectModule(key),
              child: Container(
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: selected ? AppColors.primary : Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: selected ? AppColors.primary : _border,
                  ),
                ),
                child: Text(
                  'WO $label',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : _textDark,
                  ),
                ),
              ),
            );
          },
        ),
      );
    });
  }
}

class _RecapBody extends StatelessWidget {
  final ReportWoRecapController controller;

  const _RecapBody({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final rows = controller.rows.toList();
      final loading = controller.isLoading.value;
      final error = controller.errorMessage.value;
      final loadingMore = controller.isLoadingMore.value;
      final hasMore = controller.hasMore.value;
      final total = controller.total.value;
      final width = MediaQuery.of(context).size.width;
      final columns = width >= 1100 ? 3 : (width >= 720 ? 2 : 1);

      Widget listSection;
      if (loading && rows.isEmpty) {
        listSection = const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 48),
            child: Center(child: CircularProgressIndicator()),
          ),
        );
      } else if (error.isNotEmpty) {
        listSection = SliverToBoxAdapter(
          child: _CenterMessage(
            icon: Icons.error_outline,
            title: 'Gagal memuat data',
            message: error,
            actionLabel: 'Coba lagi',
            onAction: controller.reload,
          ),
        );
      } else if (rows.isEmpty) {
        listSection = const SliverToBoxAdapter(
          child: _CenterMessage(
            icon: Icons.inbox_outlined,
            title: 'Tidak ada work order',
            message: 'Sesuaikan filter lalu coba lagi.',
          ),
        );
      } else if (columns == 1) {
        listSection = SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          sliver: SliverList.separated(
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) => _WoCard(
              row: rows[index],
              onTap: () => controller.openDetail(rows[index]),
            ),
          ),
        );
      } else {
        listSection = SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          sliver: SliverGrid.builder(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              mainAxisExtent: 150,
            ),
            itemCount: rows.length,
            itemBuilder: (context, index) => _WoCard(
              row: rows[index],
              onTap: () => controller.openDetail(rows[index]),
            ),
          ),
        );
      }

      return RefreshIndicator(
        onRefresh: controller.reload,
        child: CustomScrollView(
          controller: controller.scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(child: _KpiStrip(controller: controller)),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
                child: Text(
                  _summaryText(controller, rows.length, total),
                  style: const TextStyle(fontSize: 11, color: _textMuted),
                ),
              ),
            ),
            listSection,
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Center(
                  child: loadingMore
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : (!hasMore && rows.isNotEmpty
                          ? const Text(
                              'Semua data sudah ditampilkan',
                              style:
                                  TextStyle(fontSize: 11, color: _textMuted),
                            )
                          : const SizedBox.shrink()),
                ),
              ),
            ),
          ],
        ),
      );
    });
  }

  String _summaryText(ReportWoRecapController c, int shown, int total) {
    final kpi = c.kpi.value;
    final base = 'Menampilkan ${_formatNumber(shown)} dari ${_formatNumber(total)} WO';
    if (c.isKpiLoading.value) return '$base • menghitung ringkasan...';
    if (c.kpiError.value.isNotEmpty) return '$base • ringkasan gagal dimuat';
    if (kpi.truncated) {
      return '$base • ringkasan dari ${_formatNumber(kpi.total)} baris pertama';
    }
    return '$base • ringkasan dari seluruh hasil filter';
  }
}

class _KpiStrip extends StatelessWidget {
  final ReportWoRecapController controller;

  const _KpiStrip({required this.controller});

  @override
  Widget build(BuildContext context) => Obx(_buildStrip);

  Widget _buildStrip() {
    final kpi = controller.kpi.value;
    final loading = controller.isKpiLoading.value;
    final failed = controller.kpiError.value.isNotEmpty;
    final t = kpi.total;

    String value(int n) => loading || failed ? '-' : _formatNumber(n);
    String sub(int n, String fallback) =>
        loading || failed ? fallback : _percent(n, t);

    final tiles = <_KpiTile>[
      _KpiTile(
        label: 'Total WO',
        value: value(t),
        sub: 'hasil filter',
        color: _textDark,
      ),
      _KpiTile(
        label: 'Waiting',
        value: value(kpi.waiting),
        sub: sub(kpi.waiting, '-'),
        color: const Color(0xFFB45309),
      ),
      _KpiTile(
        label: 'In Progress',
        value: value(kpi.progress),
        sub: sub(kpi.progress, '-'),
        color: const Color(0xFF1D4ED8),
      ),
      _KpiTile(
        label: 'Closed',
        value: value(kpi.closed),
        sub: sub(kpi.closed, '-'),
        color: const Color(0xFF15803D),
      ),
      _KpiTile(
        label: 'Ditolak/Void',
        value: value(kpi.rejected),
        sub: sub(kpi.rejected, '-'),
        color: const Color(0xFFB91C1C),
      ),
      _KpiTile(
        label: 'Emergency',
        value: value(kpi.emergency),
        sub: 'prioritas',
        color: const Color(0xFFDC2626),
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 640) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(10, 4, 10, 8),
            child: Row(
              children: [
                for (var i = 0; i < tiles.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: tiles[i]),
                ],
              ],
            ),
          );
        }
        return SizedBox(
          height: 70,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(10, 4, 10, 8),
            itemCount: tiles.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) =>
                SizedBox(width: 104, child: tiles[index]),
          ),
        );
      },
    );
  }
}

class _KpiTile extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  final Color color;

  const _KpiTile({
    required this.label,
    required this.value,
    required this.sub,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 11, color: _textMuted),
          ),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 17,
              height: 1.2,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10, color: _textMuted),
          ),
        ],
      ),
    );
  }
}

class _WoCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final VoidCallback onTap;

  const _WoCard({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final moduleKey = _pick(row, ['module']).toLowerCase();
    final moduleLabel = _pick(row, ['module_label', 'module']).toUpperCase();
    final moduleColor = _moduleColors[moduleKey] ?? AppColors.primary;
    final statusRaw = _pick(row, ['status']);
    final statusColor = _statusColor(statusRaw);
    final priority = _pick(row, ['priority']);
    final isEmergency = priority.toUpperCase() == 'EMERGENCY';
    final assetName = _pick(row, ['asset_name', 'AssetName']);
    final assetCode = _pick(row, ['asset_code', 'AssetCode']);
    final asset = [assetName, assetCode].where((e) => e.isNotEmpty).join(' • ');
    final title = _pick(row, ['job_title', 'title']);
    final pic = _pick(row, ['pic', 'job_executor']);
    final meta = [
      _pick(row, ['type_wo']),
      if (pic.isNotEmpty) 'PIC: $pic',
      _pick(row, ['company']),
    ].where((e) => e.isNotEmpty).join(' • ');

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _pick(row, ['wo_number']).isEmpty
                          ? '-'
                          : _pick(row, ['wo_number']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: _textDark,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _formatDate(_pick(row, ['date'])),
                    style: const TextStyle(fontSize: 11, color: _textMuted),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  _Badge(text: moduleLabel, color: moduleColor),
                  const SizedBox(width: 4),
                  Flexible(
                    child: _Badge(
                      text: _statusLabel(statusRaw),
                      color: statusColor,
                    ),
                  ),
                  if (priority.isNotEmpty) ...[
                    const SizedBox(width: 4),
                    _Badge(
                      text: _titleCase(priority),
                      color: isEmergency
                          ? const Color(0xFFDC2626)
                          : const Color(0xFF6B7280),
                      filled: isEmergency,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              if (asset.isNotEmpty)
                Text(
                  asset,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: _textDark,
                  ),
                ),
              if (title.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child: Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF374151),
                    ),
                  ),
                ),
              if (meta.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(
                    meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, color: _textMuted),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final Color color;
  final bool filled;

  const _Badge({required this.text, required this.color, this.filled = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: filled ? color : color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          color: filled ? Colors.white : color,
        ),
      ),
    );
  }
}

class _CenterMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final Future<void> Function()? onAction;

  const _CenterMessage({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: const Color(0xFF9CA3AF)),
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: _textDark,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12.5, color: _textMuted),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: onAction,
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

Future<void> _openFilterSheet(
  BuildContext context,
  ReportWoRecapController controller,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    constraints: const BoxConstraints(maxWidth: 680),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => _FilterSheet(controller: controller),
  );
}

class _FilterSheet extends StatefulWidget {
  final ReportWoRecapController controller;

  const _FilterSheet({required this.controller});

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String _company;
  late String _division;
  late String _type;
  late String _priority;
  late String _status;
  late String _from;
  late String _to;
  late final TextEditingController _executor;

  ReportWoRecapController get c => widget.controller;

  @override
  void initState() {
    super.initState();
    _company = c.company.value;
    _division = c.idDivision.value;
    _type = c.typeWo.value;
    _priority = c.priority.value;
    _status = c.status.value;
    _from = c.dateFrom.value;
    _to = c.dateTo.value;
    _executor = TextEditingController(text: c.jobExecutor.value);
  }

  @override
  void dispose() {
    _executor.dispose();
    super.dispose();
  }

  void _apply() {
    c.applyFilters(
      company: _company,
      idDivision: _division,
      typeWo: _type,
      jobExecutor: _executor.text.trim(),
      priority: _priority,
      status: _status,
      dateFrom: _from,
      dateTo: _to,
    );
    Navigator.of(context).pop();
  }

  void _reset() {
    c.resetFilters();
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(14, 10, 14, 10 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Filter',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: _textDark,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: _reset,
                  icon: const Icon(Icons.restart_alt, size: 18),
                  label: const Text('Reset'),
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ),
            Flexible(
              child: SingleChildScrollView(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final twoColumns = constraints.maxWidth >= 480;
                    final fieldWidth = twoColumns
                        ? (constraints.maxWidth - 8) / 2
                        : constraints.maxWidth;
                    return Obx(
                      () => Wrap(
                        spacing: 8,
                        runSpacing: 10,
                        children: [
                          _field(
                            fieldWidth,
                            _PickerField(
                              label: 'Company',
                              allLabel: 'Semua company',
                              options: c.companies.toList(),
                              value: _company,
                              onChanged: (v) => setState(() => _company = v),
                            ),
                          ),
                          _field(
                            fieldWidth,
                            _PickerField(
                              label: 'Divisi Executor',
                              allLabel: 'Semua divisi',
                              options: c.divisions.toList(),
                              value: _division,
                              onChanged: (v) => setState(() => _division = v),
                            ),
                          ),
                          _field(
                            fieldWidth,
                            _PickerField(
                              label: 'Type WO',
                              allLabel: 'WO All',
                              options: c.types.toList(),
                              value: _type,
                              onChanged: (v) => setState(() => _type = v),
                            ),
                          ),
                          _field(
                            fieldWidth,
                            _PickerField(
                              label: 'Prioritas',
                              allLabel: 'Semua prioritas',
                              options: c.priorities.toList(),
                              value: _priority,
                              onChanged: (v) => setState(() => _priority = v),
                            ),
                          ),
                          _field(
                            fieldWidth,
                            _PickerField(
                              label: 'Status',
                              allLabel: 'Semua status',
                              options: c.statuses.toList(),
                              value: _status,
                              onChanged: (v) => setState(() => _status = v),
                            ),
                          ),
                          _field(
                            fieldWidth,
                            TextField(
                              controller: _executor,
                              style: const TextStyle(fontSize: 13),
                              decoration: _decoration('PIC / Executor')
                                  .copyWith(hintText: 'Nama / kode executor'),
                            ),
                          ),
                          _field(
                            fieldWidth,
                            _DateField(
                              label: 'Start Date',
                              value: _from,
                              onChanged: (v) => setState(() => _from = v),
                            ),
                          ),
                          _field(
                            fieldWidth,
                            _DateField(
                              label: 'End Date',
                              value: _to,
                              onChanged: (v) => setState(() => _to = v),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _apply,
                child: const Text('Terapkan'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(double width, Widget child) =>
      SizedBox(width: width, child: child);
}

InputDecoration _decoration(String label) {
  return InputDecoration(
    labelText: label,
    isDense: true,
    labelStyle: const TextStyle(fontSize: 13),
    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: _border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: _border),
    ),
  );
}

class _PickerField extends StatelessWidget {
  final String label;
  final String allLabel;
  final List<RecapOption> options;
  final String value;
  final ValueChanged<String> onChanged;

  const _PickerField({
    required this.label,
    required this.allLabel,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final selected = options.where((o) => o.value == value).toList();
    final text = selected.isNotEmpty
        ? selected.first.label
        : (value.isNotEmpty ? value : allLabel);
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () async {
        final picked = await showModalBottomSheet<String>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.white,
          constraints: const BoxConstraints(maxWidth: 680),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          builder: (sheetContext) => _OptionSheet(
            title: label,
            allLabel: allLabel,
            options: options,
            value: value,
          ),
        );
        if (picked != null) onChanged(picked);
      },
      child: InputDecorator(
        decoration: _decoration(label).copyWith(
          suffixIcon: const Icon(Icons.arrow_drop_down, size: 22),
          suffixIconConstraints:
              const BoxConstraints(minWidth: 32, minHeight: 32),
        ),
        child: Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13,
            color: value.isEmpty ? _textMuted : _textDark,
          ),
        ),
      ),
    );
  }
}

class _OptionSheet extends StatelessWidget {
  final String title;
  final String allLabel;
  final List<RecapOption> options;
  final String value;

  const _OptionSheet({
    required this.title,
    required this.allLabel,
    required this.options,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.of(context).size.height * 0.6;
    final items = <RecapOption>[RecapOption('', allLabel), ...options];
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: _textDark,
                ),
              ),
            ),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final item = items[index];
                  final selected = item.value == value;
                  return ListTile(
                    dense: true,
                    visualDensity: VisualDensity.compact,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14),
                    title: Text(
                      item.label,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight:
                            selected ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                    trailing: selected
                        ? const Icon(Icons.check,
                            size: 18, color: AppColors.primary)
                        : null,
                    onTap: () => Navigator.of(context).pop(item.value),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  final String label;
  final String value;
  final ValueChanged<String> onChanged;

  const _DateField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () async {
        final now = DateTime.now();
        final initial = DateTime.tryParse(value) ?? now;
        final picked = await showDatePicker(
          context: context,
          initialDate: initial,
          firstDate: DateTime(2015),
          lastDate: DateTime(now.year + 2),
        );
        if (picked != null) onChanged(_isoDate(picked));
      },
      child: InputDecorator(
        decoration: _decoration(label).copyWith(
          suffixIcon: value.isEmpty
              ? const Icon(Icons.calendar_today_outlined, size: 16)
              : InkWell(
                  onTap: () => onChanged(''),
                  child: const Icon(Icons.close, size: 16),
                ),
          suffixIconConstraints:
              const BoxConstraints(minWidth: 32, minHeight: 32),
        ),
        child: Text(
          value.isEmpty ? 'Pilih tanggal' : value,
          style: TextStyle(
            fontSize: 13,
            color: value.isEmpty ? _textMuted : _textDark,
          ),
        ),
      ),
    );
  }
}
