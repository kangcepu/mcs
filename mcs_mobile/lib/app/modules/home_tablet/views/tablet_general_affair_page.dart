import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../data/providers/api_service.dart';
import '../widgets/tablet_submodule_mini_dashboard.dart';

class TabletGeneralAffairPage extends StatefulWidget {
  const TabletGeneralAffairPage({super.key});
  @override
  State<TabletGeneralAffairPage> createState() =>
      _TabletGeneralAffairPageState();
}

class _TabletGeneralAffairPageState extends State<TabletGeneralAffairPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  bool _loading = true;
  String _module = 'GA01';
  List<Map<String, dynamic>> _tasks = [],
      _cctv = [],
      _weighbridge = [],
      _ncr = [],
      _reports = [];
  Map<String, dynamic> _dashboard = {};
  static const _modules = [
    'GA01',
    'GA02',
    'GA03',
    'GA04',
    'GA05',
    'GA06',
    'GA07'
  ];
  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 6, vsync: this);
    _tabs.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _list(Response response) {
    final body = response.data;
    final data = body is Map ? body['data'] : null;
    return data is List
        ? data
            .whereType<Map>()
            .map((x) => Map<String, dynamic>.from(x))
            .toList()
        : [];
  }

  String _error(Object error) => error is DioException
      ? (error.response?.data is Map
              ? (error.response?.data['message']?.toString())
              : null) ??
          'Server GA tidak dapat dihubungi.'
      : error.toString();
  void _snack(String message, {bool error = false}) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(message),
          backgroundColor:
              error ? Colors.red.shade700 : Colors.green.shade700));
  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ApiService();
      final values = await Future.wait([
        api.get('/v2/general-affair/dashboard'),
        api.get('/v2/general-affair/tasks',
            queryParameters: {'module_code': _module}),
        api.get('/v2/general-affair/cctv-events'),
        api.get('/v2/general-affair/weighbridge'),
        api.get('/v2/general-affair/ncr'),
        api.get('/v2/general-affair/publications')
      ]);
      if (!mounted) return;
      setState(() {
        _dashboard =
            Map<String, dynamic>.from((values[0].data as Map)['data'] ?? {});
        _tasks = _list(values[1]);
        _cctv = _list(values[2]);
        _weighbridge = _list(values[3]);
        _ncr = _list(values[4]);
        _reports = _list(values[5]);
      });
    } catch (e) {
      if (mounted) _snack(_error(e), error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _changeModule(String value) async {
    setState(() => _module = value);
    await _load();
  }

  Future<void> _transition(Map<String, dynamic> row, String action) async {
    try {
      await ApiService().post(
          '/v2/general-affair/tasks/${row['id']}/transition',
          data: {'action': action});
      _snack('Status task diperbarui.');
      await _load();
    } catch (e) {
      _snack(_error(e), error: true);
    }
  }

  Future<void> _evidence(Map<String, dynamic> row) async {
    final source = await showModalBottomSheet<ImageSource>(
        context: context,
        builder: (_) => SafeArea(
                child: Wrap(children: [
              ListTile(
                  leading: const Icon(Icons.camera_alt_outlined),
                  title: const Text('Ambil foto'),
                  onTap: () => Navigator.pop(context, ImageSource.camera)),
              ListTile(
                  leading: const Icon(Icons.photo_library_outlined),
                  title: const Text('Pilih dari galeri'),
                  onTap: () => Navigator.pop(context, ImageSource.gallery)),
            ])));
    if (source == null) return;
    final file = await ImagePicker().pickImage(
        source: source, imageQuality: 78, maxWidth: 1800, maxHeight: 1800);
    if (file == null) return;
    try {
      final form = FormData.fromMap({
        'evidence_type': 'SUPPORTING',
        'files': await MultipartFile.fromFile(file.path, filename: file.name),
      });
      await ApiService()
          .post('/v2/general-affair/tasks/${row['id']}/evidence', data: form);
      _snack('Evidence tersimpan.');
      await _load();
    } catch (error) {
      _snack(_error(error), error: true);
    }
  }

  Future<void> _create() async {
    final success = await showDialog<bool>(
        context: context,
        builder: (_) => _GaCreateDialog(tab: _tabs.index, module: _module));
    if (success == true) {
      _snack('Data GA tersimpan.');
      await _load();
    }
  }

  int _metric(String group, String key) =>
      int.tryParse('${(_dashboard[group] as Map?)?[key] ?? 0}') ?? 0;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('General Affair',
                    style:
                        TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                SizedBox(height: 3),
                Text(
                    'GA01–GA10 · operasional, CCTV, timbang, NCR, dan governance.',
                    style: TextStyle(color: Color(0xFF64748B)))
              ])),
          OutlinedButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh')),
          const SizedBox(width: 8),
          FilledButton.icon(
              onPressed: _tabs.index == 0 || _tabs.index == 4 ? null : _create,
              icon: const Icon(Icons.add),
              label: const Text('Tambah'))
        ]),
        const SizedBox(height: 16),
        const TabletSubmoduleMiniDashboard(group: 'GENERAL_AFFAIR'),
        const SizedBox(height: 14),
        SizedBox(
            height: 78,
            child: Row(children: [
              _Metric('Task terbuka', _metric('tasks', 'open_tasks'),
                  Icons.assignment_outlined),
              _Metric('Validasi', _metric('tasks', 'pending_validation'),
                  Icons.verified_outlined),
              _Metric('CCTV offline', _metric('cctv', 'offline'),
                  Icons.videocam_off_outlined),
              _Metric('NCR', _metric('ncr', 'open_count'),
                  Icons.report_problem_outlined)
            ])),
        const SizedBox(height: 14),
        Container(
            decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: const Color(0xFFE2E8F0)),
                borderRadius: BorderRadius.circular(10)),
            child: TabBar(
                controller: _tabs,
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                tabs: const [
                  Tab(text: 'Dashboard Submodul'),
                  Tab(text: 'Operasional GA01–GA07'),
                  Tab(text: 'CCTV GA08'),
                  Tab(text: 'Timbang GA09'),
                  Tab(text: 'Exception & NCR'),
                  Tab(text: 'Governance GA10')
                ])),
        if (_tabs.index == 1)
          Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: _modules
                      .map((x) => ChoiceChip(
                          label: Text(x),
                          selected: _module == x,
                          onSelected: (_) => _changeModule(x)))
                      .toList()))
        else
          const SizedBox(height: 12),
        Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(controller: _tabs, children: [
                    const _GaSubmoduleDashboardPanel(),
                    _taskList(),
                    _simple(
                        _cctv,
                        (x) =>
                            '${x['camera_code'] ?? '-'} · ${x['camera_name'] ?? '-'}',
                        (x) =>
                            '${x['location_name'] ?? '-'} · offline ${x['offline_at'] ?? '-'} · ${x['repeat_count'] ?? 0}x'),
                    _simple(
                        _weighbridge,
                        (x) =>
                            '${x['ticket_number'] ?? '-'} · ${x['vehicle_plate'] ?? '-'}',
                        (x) => '${x['ticket_entry_at'] ?? '-'}'),
                    _simple(
                        _ncr,
                        (x) =>
                            '${x['ncr_number'] ?? '-'} · ${x['title'] ?? '-'}',
                        (x) =>
                            '${x['module_code'] ?? '-'} · ${x['severity'] ?? '-'}'),
                    _simple(
                        _reports,
                        (x) =>
                            '${x['publication_number'] ?? '-'} · v${x['version_no'] ?? 1}',
                        (x) =>
                            '${x['company_code'] ?? '-'} · ${x['period_start'] ?? '-'} s/d ${x['period_end'] ?? '-'}')
                  ]))
      ]));
  Widget _taskList() {
    if (_tasks.isEmpty) return _empty('Belum ada task $_module.');
    return GridView.builder(
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: 520,
            mainAxisExtent: 160,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10),
        itemCount: _tasks.length,
        itemBuilder: (_, i) {
          final x = _tasks[i], status = '${x['status'] ?? ''}';
          final action = status == 'PLANNED'
              ? 'START'
              : status == 'IN_PROGRESS'
                  ? 'SUBMIT'
                  : status == 'SUBMITTED'
                      ? 'CHECK'
                      : status == 'CHECKED'
                          ? 'APPROVE'
                          : status == 'APPROVED'
                              ? 'CLOSE'
                              : null;
          return _card(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Row(children: [
                  Expanded(
                      child: Text('${x['task_number'] ?? '-'}',
                          style: const TextStyle(fontWeight: FontWeight.w700))),
                  _Badge(status)
                ]),
                const SizedBox(height: 7),
                Text('${x['title'] ?? '-'}',
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                const Spacer(),
                Text(
                    '${x['company_code'] ?? '-'} · ${x['location_name'] ?? '-'}',
                    style: const TextStyle(
                        fontSize: 12, color: Color(0xFF64748B))),
                Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                  if (['PLANNED', 'IN_PROGRESS', 'REJECTED'].contains(status))
                    IconButton(
                        tooltip: 'Tambah evidence',
                        onPressed: () => _evidence(x),
                        icon: const Icon(Icons.attach_file)),
                  if (action != null)
                    TextButton(
                        onPressed: () => _transition(x, action),
                        child: Text(_actionLabel(action)))
                ])
              ]));
        });
  }

  String _actionLabel(String action) =>
      {
        'START': 'Mulai',
        'SUBMIT': 'Submit',
        'CHECK': 'Validasi',
        'APPROVE': 'Approve',
        'CLOSE': 'Close'
      }[action] ??
      action;
  Widget _simple(
      List<Map<String, dynamic>> rows,
      String Function(Map<String, dynamic>) title,
      String Function(Map<String, dynamic>) subtitle) {
    if (rows.isEmpty) return _empty('Belum ada data.');
    return ListView.separated(
        itemCount: rows.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          final x = rows[i];
          return _card(
              child: Row(children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(title(x),
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(subtitle(x),
                      style: const TextStyle(
                          fontSize: 12, color: Color(0xFF64748B)))
                ])),
            _Badge('${x['status'] ?? '-'}')
          ]));
        });
  }

  Widget _empty(String text) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.inbox_outlined, size: 48, color: Color(0xFF94A3B8)),
        const SizedBox(height: 8),
        Text(text, style: const TextStyle(color: Color(0xFF64748B)))
      ]));
  Widget _card({required Widget child}) => Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFE2E8F0)),
          borderRadius: BorderRadius.circular(10)),
      child: child);
}

class _GaSubmoduleDashboardPanel extends StatefulWidget {
  const _GaSubmoduleDashboardPanel();
  @override
  State<_GaSubmoduleDashboardPanel> createState() =>
      _GaSubmoduleDashboardPanelState();
}

class _GaSubmoduleDashboardPanelState
    extends State<_GaSubmoduleDashboardPanel> {
  static const modules = {
    'GA01': 'Daily Cleaning',
    'GA02': 'Waste & TPS',
    'GA03': 'Garden & Drainage',
    'GA04': 'Outdoor Monitoring',
    'GA05': 'Pallet & Facility',
    'GA06': 'Preventive Plan',
    'GA07': 'Preventive WO',
    'GA08': 'CCTV Offline',
    'GA09': 'Weighbridge',
    'GA10': 'Weekly Governance',
  };
  static const views = [
    'Overview',
    'Process Queue',
    'Exception & NCR',
    'Performance & Trend'
  ];
  String module = 'GA01', view = 'Overview', company = '', site = '';
  late String from, to;
  bool loading = true;
  Map<String, dynamic> data = {};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    to = _date(now);
    from = _date(now.subtract(const Duration(days: 29)));
    _load();
  }

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  List<Map<String, dynamic>> _rows(String key) {
    final value = data[key];
    return value is List
        ? value
            .whereType<Map>()
            .map((row) => Map<String, dynamic>.from(row))
            .toList()
        : [];
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      final response = await ApiService()
          .get('/v2/general-affair/submodule-dashboard', queryParameters: {
        'module_code': module,
        'date_from': from,
        'date_to': to,
        if (company.isNotEmpty) 'company': company,
        if (site.isNotEmpty) 'site': site,
      });
      if (!mounted) return;
      setState(() => data = Map<String, dynamic>.from(
          (response.data as Map)['data'] as Map? ?? {}));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(error is DioException && error.response?.data is Map
                ? error.response?.data['message']?.toString() ??
                    'Dashboard gagal dimuat.'
                : 'Dashboard gagal dimuat.')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _filters() async {
    final companyController = TextEditingController(text: company);
    final siteController = TextEditingController(text: site);
    var start = DateTime.tryParse(from) ?? DateTime.now();
    var end = DateTime.tryParse(to) ?? DateTime.now();
    final accepted = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(builder: (_, setDialog) {
              Future<void> pick(bool isStart) async {
                final picked = await showDatePicker(
                    context: dialogContext,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                    initialDate: isStart ? start : end);
                if (picked != null) {
                  setDialog(() => isStart ? start = picked : end = picked);
                }
              }

              return AlertDialog(
                  title: const Text('Filter dashboard GA'),
                  content: SizedBox(
                      width: 440,
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        TextField(
                            controller: companyController,
                            decoration: const InputDecoration(
                                labelText: 'Company',
                                hintText: 'Kosong = semua company')),
                        const SizedBox(height: 10),
                        TextField(
                            controller: siteController,
                            decoration: const InputDecoration(
                                labelText: 'Site',
                                hintText: 'Kosong = semua site')),
                        const SizedBox(height: 12),
                        Row(children: [
                          Expanded(
                              child: OutlinedButton.icon(
                                  onPressed: () => pick(true),
                                  icon: const Icon(Icons.date_range_outlined),
                                  label: Text(_date(start)))),
                          const SizedBox(width: 8),
                          Expanded(
                              child: OutlinedButton.icon(
                                  onPressed: () => pick(false),
                                  icon: const Icon(Icons.event_outlined),
                                  label: Text(_date(end))))
                        ])
                      ])),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(dialogContext, false),
                        child: const Text('Batal')),
                    FilledButton(
                        onPressed: () => Navigator.pop(dialogContext, true),
                        child: const Text('Terapkan'))
                  ]);
            }));
    if (accepted == true) {
      company = companyController.text.trim();
      site = siteController.text.trim();
      from = _date(start);
      to = _date(end);
      await _load();
    }
    companyController.dispose();
    siteController.dispose();
  }

  int _number(dynamic value) => int.tryParse('$value') ?? 0;
  Widget _panel({required Widget child}) => Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE2E8F0))),
      child: child);

  @override
  Widget build(BuildContext context) {
    final kpis = _rows('kpis');
    final summary = Map<String, dynamic>.from(data['summary'] as Map? ?? {});
    return Column(children: [
      Row(children: [
        Expanded(
            child: DropdownButtonFormField<String>(
                initialValue: module,
                decoration: const InputDecoration(
                    labelText: 'Submodul', border: OutlineInputBorder()),
                items: modules.entries
                    .map((entry) => DropdownMenuItem(
                        value: entry.key,
                        child: Text('${entry.key} · ${entry.value}')))
                    .toList(),
                onChanged: (value) async {
                  if (value == null) return;
                  setState(() => module = value);
                  await _load();
                })),
        const SizedBox(width: 8),
        OutlinedButton.icon(
            onPressed: _filters,
            icon: const Icon(Icons.tune),
            label: Text('$from – $to')),
        const SizedBox(width: 8),
        IconButton(onPressed: _load, icon: const Icon(Icons.refresh))
      ]),
      const SizedBox(height: 10),
      if (loading)
        const Expanded(child: Center(child: CircularProgressIndicator()))
      else
        Expanded(
            child: ListView(children: [
          SizedBox(
              height: 130,
              child: Row(
                  children: kpis
                      .map((kpi) => Expanded(
                              child: Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: _panel(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                  Text('${kpi['code'] ?? '-'}',
                                      style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                          color: Color(0xFF2563EB))),
                                  const SizedBox(height: 4),
                                  Text('${kpi['label'] ?? '-'}',
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 12)),
                                  const Spacer(),
                                  Text(
                                      kpi['value'] == null
                                          ? 'N/M'
                                          : '${kpi['value']}%',
                                      style: const TextStyle(
                                          fontSize: 24,
                                          fontWeight: FontWeight.w800)),
                                  Text(
                                      '${kpi['numerator'] ?? 0} dari ${kpi['denominator'] ?? 0}',
                                      style: const TextStyle(
                                          fontSize: 10,
                                          color: Color(0xFF64748B)))
                                ])),
                          )))
                      .toList())),
          const SizedBox(height: 10),
          SizedBox(
              height: 70,
              child: Row(children: [
                _summary('Total', _number(summary['total'])),
                _summary('Selesai', _number(summary['completed'])),
                _summary('Terbuka', _number(summary['open_count'])),
                _summary('Validasi', _number(summary['pending_validation'])),
                _summary('Exception', _number(summary['overdue']), danger: true)
              ])),
          const SizedBox(height: 10),
          Wrap(
              spacing: 7,
              runSpacing: 7,
              children: views
                  .map((item) => ChoiceChip(
                      label: Text(item),
                      selected: view == item,
                      onSelected: (_) => setState(() => view = item)))
                  .toList()),
          const SizedBox(height: 10),
          if (view == 'Overview') _overview(),
          if (view == 'Process Queue') _queue(_rows('queue'), false),
          if (view == 'Exception & NCR') _queue(_rows('ncrs'), true),
          if (view == 'Performance & Trend') _performance()
        ]))
    ]);
  }

  Widget _summary(String label, int value, {bool danger = false}) => Expanded(
      child: Padding(
          padding: const EdgeInsets.only(right: 7),
          child: _panel(
              child: Row(children: [
            Icon(danger ? Icons.warning_amber : Icons.analytics_outlined,
                color: danger && value > 0
                    ? const Color(0xFFE11D48)
                    : const Color(0xFF2563EB)),
            const SizedBox(width: 8),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$value',
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w700)),
              Text(label,
                  style:
                      const TextStyle(fontSize: 10, color: Color(0xFF64748B)))
            ])
          ]))));

  Widget _overview() {
    final statuses = _rows('status_counts');
    final trend = _rows('trend');
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
          child: _panel(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
            const Text('Komposisi status',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            ...statuses.map((row) => ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('${row['status'] ?? '-'}'),
                trailing: Text('${row['count'] ?? 0}',
                    style: const TextStyle(fontWeight: FontWeight.w700))))
          ]))),
      const SizedBox(width: 10),
      Expanded(child: _trend(trend))
    ]);
  }

  Widget _trend(List<Map<String, dynamic>> rows) => _panel(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Tren periode',
            style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          const Text('Belum ada tren.',
              style: TextStyle(color: Color(0xFF64748B)))
        else
          ...rows.take(20).map((row) {
            final total = _number(row['planned']);
            final done = _number(row['completed']);
            return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(children: [
                  SizedBox(width: 90, child: Text('${row['date'] ?? '-'}')),
                  Expanded(
                      child: LinearProgressIndicator(
                          value: total > 0 ? done / total : 0,
                          minHeight: 8,
                          borderRadius: BorderRadius.circular(10))),
                  SizedBox(
                      width: 70,
                      child: Text('$done/$total', textAlign: TextAlign.right))
                ]));
          })
      ]));

  Widget _queue(List<Map<String, dynamic>> rows, bool ncr) => _panel(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(ncr ? 'Exception & NCR' : 'Process Queue',
            style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          Text(ncr ? 'Tidak ada NCR pada filter ini.' : 'Queue kosong.',
              style: const TextStyle(color: Color(0xFF64748B)))
        else
          ...rows.map((row) => ListTile(
              contentPadding: EdgeInsets.zero,
              title:
                  Text('${row['reference'] ?? '-'} · ${row['title'] ?? '-'}'),
              subtitle: Text(
                  '${row['owner'] ?? 'Belum ditugaskan'} · due ${row['due_at'] ?? '-'}'),
              trailing:
                  _Badge('${ncr ? row['severity'] : row['status'] ?? '-'}')))
      ]));

  Widget _performance() {
    final comparisons = _rows('comparisons');
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(child: _trend(_rows('trend'))),
      const SizedBox(width: 10),
      Expanded(
          child: _panel(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
            const Text('Perbandingan lokasi/site',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (comparisons.isEmpty)
              const Text('Belum ada data pembanding.',
                  style: TextStyle(color: Color(0xFF64748B)))
            else
              ...comparisons.map((row) {
                final total = _number(row['total']);
                final done = _number(row['completed']);
                return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Column(children: [
                      Row(children: [
                        Expanded(child: Text('${row['label'] ?? '-'}')),
                        Text('$done/$total')
                      ]),
                      const SizedBox(height: 3),
                      LinearProgressIndicator(
                          value: total > 0 ? done / total : 0,
                          minHeight: 7,
                          borderRadius: BorderRadius.circular(8))
                    ]));
              })
          ])))
    ]);
  }
}

class _Metric extends StatelessWidget {
  final String label;
  final int value;
  final IconData icon;
  const _Metric(this.label, this.value, this.icon);
  @override
  Widget build(BuildContext context) => Expanded(
      child: Container(
          margin: const EdgeInsets.only(right: 9),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFE2E8F0)),
              borderRadius: BorderRadius.circular(10)),
          child: Row(children: [
            Icon(icon, color: const Color(0xFF2563EB)),
            const SizedBox(width: 10),
            Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('$value',
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w700)),
                  Text(label,
                      style: const TextStyle(
                          fontSize: 11, color: Color(0xFF64748B)))
                ])
          ])));
}

class _Badge extends StatelessWidget {
  final String value;
  const _Badge(this.value);
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
          color: const Color(0xFFEFF6FF),
          borderRadius: BorderRadius.circular(20)),
      child: Text(value.replaceAll('_', ' '),
          style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: Color(0xFF1D4ED8))));
}

class _GaCreateDialog extends StatefulWidget {
  final int tab;
  final String module;
  const _GaCreateDialog({required this.tab, required this.module});
  @override
  State<_GaCreateDialog> createState() => _GaCreateDialogState();
}

class _GaCreateDialogState extends State<_GaCreateDialog> {
  final _form = GlobalKey<FormState>();
  final Map<String, TextEditingController> c = {
    for (final x in [
      'company',
      'site',
      'location',
      'title',
      'description',
      'date',
      'camera',
      'offline',
      'ticket',
      'plate',
      'ticket_at',
      'cctv_plate',
      'period_start',
      'period_end'
    ])
      x: TextEditingController()
  };
  bool busy = false;
  @override
  void initState() {
    super.initState();
    c['date']!.text = DateTime.now().toIso8601String().substring(0, 10);
  }

  @override
  void dispose() {
    for (final x in c.values) {
      x.dispose();
    }
    super.dispose();
  }

  Widget field(String key, String label,
          {bool required = false, bool date = false, bool dateTime = false}) =>
      TextFormField(
          controller: c[key],
          decoration: InputDecoration(
              labelText: label, border: const OutlineInputBorder()),
          readOnly: date || dateTime,
          validator: required
              ? (v) => v?.trim().isEmpty == true ? 'Wajib diisi' : null
              : null,
          onTap: date
              ? () => _pickDate(key)
              : dateTime
                  ? () => _pickDateTime(key)
                  : null,
          maxLines: key == 'description' ? 3 : 1);
  Future<void> _pickDate(String key) async {
    final d = await showDatePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: DateTime(2100),
        initialDate: DateTime.now());
    if (d != null) {
      c[key]!.text = d.toIso8601String().substring(0, 10);
    }
  }

  Future<void> _pickDateTime(String key) async {
    final d = await showDatePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: DateTime(2100),
        initialDate: DateTime.now());
    if (d == null || !mounted) return;
    final t =
        await showTimePicker(context: context, initialTime: TimeOfDay.now());
    if (t != null) {
      c[key]!.text =
          '${d.toIso8601String().substring(0, 10)}T${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    }
  }

  Future<void> save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      String path;
      Map<String, dynamic> data = {
        'company_code': c['company']!.text,
        'site_code': c['site']!.text
      };
      if (widget.tab == 1) {
        path = '/v2/general-affair/tasks';
        data.addAll({
          'module_code': widget.module,
          'location_name': c['location']!.text,
          'title': c['title']!.text,
          'description': c['description']!.text,
          'planned_date': c['date']!.text
        });
      } else if (widget.tab == 2) {
        path = '/v2/general-affair/cctv-events';
        data.addAll({
          'camera_object_id': c['camera']!.text,
          'offline_at': c['offline']!.text
        });
      } else if (widget.tab == 3) {
        path = '/v2/general-affair/weighbridge';
        data.addAll({
          'ticket_number': c['ticket']!.text,
          'vehicle_plate': c['plate']!.text,
          'ticket_entry_at': c['ticket_at']!.text,
          'cctv_plate': c['cctv_plate']!.text
        });
      } else {
        path = '/v2/general-affair/publications';
        data.addAll({
          'period_start': c['period_start']!.text,
          'period_end': c['period_end']!.text,
          'report_variant': 'WEEKLY_GA'
        });
      }
      await ApiService().post(path, data: data);
      if (mounted) {
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e is DioException
                ? (e.response?.data is Map
                        ? e.response?.data['message']?.toString()
                        : 'Gagal menyimpan') ??
                    'Gagal menyimpan'
                : e.toString())));
      }
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: Text(
              'Tambah ${widget.tab == 1 ? widget.module : widget.tab == 2 ? 'CCTV Offline' : widget.tab == 3 ? 'Rekonsiliasi Timbang' : 'Governance Mingguan'}'),
          content: SizedBox(
              width: 620,
              child: SingleChildScrollView(
                  child: Form(
                      key: _form,
                      child: Column(children: [
                        if (widget.tab != 2) ...[
                          field('company', 'Company', required: true),
                          const SizedBox(height: 10)
                        ],
                        field('site', 'Site'),
                        const SizedBox(height: 10),
                        if (widget.tab == 1) ...[
                          field('title', 'Judul', required: true),
                          const SizedBox(height: 10),
                          field('location', 'Lokasi', required: true),
                          const SizedBox(height: 10),
                          field('date', 'Tanggal rencana',
                              required: true, date: true),
                          const SizedBox(height: 10),
                          field('description', 'Keterangan')
                        ],
                        if (widget.tab == 2) ...[
                          field('camera', 'ID master CCTV', required: true),
                          const SizedBox(height: 10),
                          field('offline', 'Mulai offline',
                              required: true, dateTime: true)
                        ],
                        if (widget.tab == 3) ...[
                          field('ticket', 'Nomor tiket', required: true),
                          const SizedBox(height: 10),
                          field('plate', 'Nomor kendaraan', required: true),
                          const SizedBox(height: 10),
                          field('ticket_at', 'Waktu tiket',
                              required: true, dateTime: true),
                          const SizedBox(height: 10),
                          field('cctv_plate', 'Plate dari CCTV')
                        ],
                        if (widget.tab == 5) ...[
                          field('period_start', 'Awal periode',
                              required: true, date: true),
                          const SizedBox(height: 10),
                          field('period_end', 'Akhir periode',
                              required: true, date: true)
                        ]
                      ])))),
          actions: [
            TextButton(
                onPressed: busy ? null : () => Navigator.pop(context),
                child: const Text('Batal')),
            FilledButton(
                onPressed: busy ? null : save,
                child: busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Simpan'))
          ]);
}
