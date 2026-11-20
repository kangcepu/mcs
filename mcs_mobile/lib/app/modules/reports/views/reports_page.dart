import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/routes/app_routes.dart';
import '../../../data/repositories/report_center_repository.dart';
import '../controllers/reports_controller.dart';

class ReportsPage extends StatefulWidget {
  final String group;
  const ReportsPage({super.key, this.group = 'main'});

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  late final ReportsController controller;

  String get title => switch (widget.group) {
        'ncr' => 'NCR Report',
        'master' => 'Master Report',
        _ => 'Main Report',
      };

  @override
  void initState() {
    super.initState();
    controller = Get.put(ReportsController());
    controller.reportSearch.value = '';
    controller.reportCategory.value = '';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: Text(title),
        actions: [
          IconButton(
            tooltip: 'Refresh katalog',
            onPressed: controller.loadExternalReports,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.loadExternalReports,
        child: Obx(() => CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TextField(
                          onChanged: (value) =>
                              controller.reportSearch.value = value,
                          decoration: InputDecoration(
                            hintText: 'Cari report…',
                            prefixIcon: const Icon(Icons.search_rounded),
                            filled: true,
                            fillColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 12),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                          ),
                        ),
                        if (widget.group == 'main') ...[
                          const SizedBox(height: 10),
                          _QrShortcut(
                            onTap: () => Get.toNamed(AppRoutes.reportQr),
                          ),
                        ],
                        if (controller
                            .externalCategoriesFor(widget.group)
                            .isNotEmpty) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            height: 34,
                            child: ListView(
                              scrollDirection: Axis.horizontal,
                              children: [
                                _categoryChip(controller, 'Semua', ''),
                                ...controller
                                    .externalCategoriesFor(widget.group)
                                    .map(
                                      (item) =>
                                          _categoryChip(controller, item, item),
                                    ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                if (controller.loadingExternal.value)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (controller.externalError.value.isNotEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _ErrorPanel(
                      message: controller.externalError.value,
                      onRetry: controller.loadExternalReports,
                    ),
                  )
                else ...[
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                    sliver: SliverLayoutBuilder(
                      builder: (context, constraints) {
                        final width = constraints.crossAxisExtent;
                        final columns = width >= 1000
                            ? 4
                            : width >= 650
                                ? 3
                                : width >= 440
                                    ? 2
                                    : 1;
                        final reports =
                            controller.filteredExternalReportsFor(widget.group);
                        if (reports.isEmpty) {
                          return const SliverToBoxAdapter(
                            child: Padding(
                              padding: EdgeInsets.symmetric(vertical: 40),
                              child: Center(
                                  child: Text('Report tidak ditemukan.')),
                            ),
                          );
                        }
                        return SliverGrid(
                          delegate: SliverChildBuilderDelegate(
                            (context, index) => _ExternalReportCard(
                              report: reports[index],
                              onTap: () => _openReportSheet(
                                  context, controller, reports[index]),
                            ),
                            childCount: reports.length,
                          ),
                          gridDelegate:
                              SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: columns,
                            crossAxisSpacing: 10,
                            mainAxisSpacing: 10,
                            mainAxisExtent: 142,
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ],
            )),
      ),
    );
  }

  Widget _categoryChip(
      ReportsController controller, String label, String value) {
    final selected = controller.reportCategory.value == value;
    return Padding(
      padding: const EdgeInsets.only(right: 7),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => controller.reportCategory.value = value,
        visualDensity: VisualDensity.compact,
      ),
    );
  }

  void _openReportSheet(BuildContext context, ReportsController controller,
      ExternalReportItem report) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ReportGeneratorSheet(
        controller: controller,
        report: report,
      ),
    );
  }
}

class _QrShortcut extends StatelessWidget {
  final VoidCallback onTap;
  const _QrShortcut({required this.onTap});

  @override
  Widget build(BuildContext context) => Material(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFBFDBFE)),
            ),
            child: const Row(
              children: [
                CircleAvatar(
                  radius: 19,
                  backgroundColor: Color(0xFF2563EB),
                  child: Icon(Icons.qr_code_2_rounded,
                      color: Colors.white, size: 22),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Cetak QR Asset & BOM / Part',
                          style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F172A))),
                      SizedBox(height: 2),
                      Text('Buat label QR langsung dari tablet.',
                          style: TextStyle(
                              fontSize: 12, color: Color(0xFF64748B))),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: Color(0xFF2563EB)),
              ],
            ),
          ),
        ),
      );
}

class _ExternalReportCard extends StatelessWidget {
  final ExternalReportItem report;
  final VoidCallback onTap;
  const _ExternalReportCard({required this.report, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: const Icon(Icons.picture_as_pdf_outlined,
                        size: 20, color: Color(0xFF2563EB)),
                  ),
                  const Spacer(),
                  Text(report.format,
                      style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF64748B))),
                ],
              ),
              const SizedBox(height: 9),
              Text(report.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A))),
              const SizedBox(height: 3),
              Text(
                report.description.isEmpty
                    ? report.category
                    : report.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 11.5, color: Color(0xFF64748B)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReportGeneratorSheet extends StatefulWidget {
  final ReportsController controller;
  final ExternalReportItem report;
  const _ReportGeneratorSheet({required this.controller, required this.report});

  @override
  State<_ReportGeneratorSheet> createState() => _ReportGeneratorSheetState();
}

class _ReportGeneratorSheetState extends State<_ReportGeneratorSheet> {
  final Map<String, String> _values = {};
  final Map<String, TextEditingController> _text = {};
  ReportFilterOptions _options = const ReportFilterOptions();
  bool _loadingOptions = false;

  @override
  void initState() {
    super.initState();
    for (final param in widget.report.params) {
      _values[param] = '';
      _text[param] = TextEditingController();
    }
    _loadOptions();
  }

  @override
  void dispose() {
    for (final controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadOptions() async {
    if (!widget.report.params.any((item) => [
          'company',
          'location',
          'category',
          'status',
          'type_wo',
          'priority',
          'shift',
          'id_division'
        ].contains(item))) {
      return;
    }
    setState(() => _loadingOptions = true);
    try {
      final result = await widget.controller.loadFilterOptions(
        widget.report,
        Map<String, String>.from(_values),
      );
      if (mounted) setState(() => _options = result);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(error.toString().replaceFirst('Exception: ', '')),
        ));
      }
    } finally {
      if (mounted) setState(() => _loadingOptions = false);
    }
  }

  Map<String, String> get _cleanValues => {
        for (final entry in _values.entries)
          if (entry.value.trim().isNotEmpty) entry.key: entry.value.trim(),
      };

  void _openReport() {
    widget.controller.previewExternalReport(widget.report, _cleanValues);
  }

  void _resetFilters() {
    setState(() {
      for (final key in _values.keys) {
        _values[key] = '';
        _text[key]?.clear();
      }
    });
    _loadOptions();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 14, 18, 16 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFCBD5E1),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(widget.report.title,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            if (widget.report.description.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(widget.report.description,
                  style: const TextStyle(color: Color(0xFF64748B))),
            ],
            const SizedBox(height: 16),
            if (_loadingOptions)
              const LinearProgressIndicator(minHeight: 2)
            else if (widget.report.params.isEmpty)
              _info('Report ini tidak menyediakan filter tambahan.')
            else
              ...widget.report.params.map(_buildField),
            Obx(() {
              if (!widget.controller.generating.value) {
                return const SizedBox.shrink();
              }
              final progress = widget.controller.generationProgress.value;
              return Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFBFDBFE)),
                ),
                child: Column(
                  children: [
                    Row(children: [
                      const Expanded(child: Text('Membuat dokumen…')),
                      Text('$progress%',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ]),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(value: progress / 100),
                  ],
                ),
              );
            }),
            if (_cleanValues.isNotEmpty)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed:
                      widget.controller.generating.value ? null : _resetFilters,
                  icon: const Icon(Icons.restart_alt_rounded, size: 18),
                  label: const Text('Reset filter'),
                ),
              ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: Obx(() => FilledButton.icon(
                    onPressed:
                        widget.controller.generating.value ? null : _openReport,
                    icon: widget.controller.generating.value
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.visibility_outlined),
                    label: Text(widget.controller.generating.value
                        ? 'Mohon tunggu…'
                        : 'Buka Report'),
                  )),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildField(String param) {
    switch (param) {
      case 'company':
        return _dropdown('Company', param, _options.companies,
            onChanged: (_) async {
          _values['location'] = '';
          await _loadOptions();
        });
      case 'location':
        return _dropdown('Lokasi', param, _options.locations);
      case 'category':
        return _dropdown('Kategori', param, _options.categories);
      case 'status':
        if (widget.report.reportType == 'report-assets') {
          return _dropdown('Status', param, const [
            {'value': 'active', 'label': 'Aktif'},
            {'value': 'inactive', 'label': 'Nonaktif'},
          ]);
        }
        return _dropdown('Status', param, _options.statuses);
      case 'type_wo':
        return _dropdown('Tipe Work Order', param, _options.types);
      case 'priority':
        return _dropdown('Prioritas', param, _options.priorities);
      case 'shift':
        return _dropdown('Shift', param, _options.shifts);
      case 'id_division':
        return _dropdown('Divisi', param, _options.divisions);
      case 'job_executor':
        return _input('Eksekutor', param, 'Nama atau kode eksekutor');
      case 'date_from':
        return _date('Tanggal mulai', param);
      case 'date_to':
        return _date('Tanggal selesai', param);
      case 'q':
        return _input('Pencarian (opsional)', param,
            'Cari nomor, nama, kode, atau deskripsi');
      default:
        return _input(param.replaceAll('_', ' '), param, 'Isi $param');
    }
  }

  Widget _input(String label, String key, String hint) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: _text[key],
          onChanged: (value) => _values[key] = value,
          decoration: InputDecoration(labelText: label, hintText: hint),
        ),
      );

  Widget _dropdown(String label, String key, List<Map<String, String>> options,
          {Future<void> Function(String?)? onChanged}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: DropdownButtonFormField<String>(
          key: ValueKey('$key:${_values[key]}'),
          initialValue: _values[key] ?? '',
          decoration: InputDecoration(labelText: label),
          isExpanded: true,
          items: [
            DropdownMenuItem(
              value: '',
              child: Text('Semua ${label.toLowerCase()}'),
            ),
            ...options.where((item) => (item['value'] ?? '').isNotEmpty).map(
                  (item) => DropdownMenuItem(
                    value: item['value'],
                    child: Text(item['label'] ?? item['value'] ?? ''),
                  ),
                ),
          ],
          onChanged: (value) async {
            setState(() => _values[key] = value ?? '');
            await onChanged?.call(value);
          },
        ),
      );

  Widget _date(String label, String key) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: _text[key],
          readOnly: true,
          decoration: InputDecoration(
            labelText: label,
            suffixIcon: (_values[key] ?? '').isEmpty
                ? const Icon(Icons.calendar_today_outlined, size: 18)
                : IconButton(
                    tooltip: 'Hapus tanggal',
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: () => setState(() {
                      _values[key] = '';
                      _text[key]!.clear();
                    }),
                  ),
          ),
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              firstDate: DateTime(2020),
              lastDate: DateTime.now().add(const Duration(days: 365)),
              initialDate: DateTime.now(),
            );
            if (picked == null) return;
            final value =
                '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
            setState(() {
              _values[key] = value;
              _text[key]!.text = value;
            });
          },
        ),
      );

  Widget _info(String text) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(text, style: const TextStyle(color: Color(0xFF64748B))),
      );
}

class _ErrorPanel extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorPanel({required this.message, required this.onRetry});
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.error_outline, size: 42, color: Color(0xFFDC2626)),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Coba lagi')),
          ]),
        ),
      );
}
