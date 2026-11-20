import 'package:flutter/material.dart';
import '../../../data/repositories/preventive_ncr_repository.dart';

class PreventiveNcrPage extends StatefulWidget {
  const PreventiveNcrPage({super.key});
  @override
  State<PreventiveNcrPage> createState() => _PreventiveNcrPageState();
}

class _PreventiveNcrPageState extends State<PreventiveNcrPage> {
  final repository = PreventiveNcrRepository();
  final search = TextEditingController();
  List<PreventiveNcrItem> items = const [];
  String status = '', type = '';
  bool loading = true;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final value =
          await repository.list(q: search.text, status: status, type: type);
      if (mounted) {
        setState(() => items = value);
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: const Color(0xFFF5F7FA),
        appBar: AppBar(
          title: const Text('Preventive NCR'),
          actions: [
            IconButton(onPressed: load, icon: const Icon(Icons.refresh))
          ],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  TextField(
                    controller: search,
                    onSubmitted: (_) => load(),
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.search),
                      hintText: 'Cari NCR, WO, atau aset…',
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                          child: _select(status, 'Semua status', const [
                        '',
                        'OPEN',
                        'IN_PROGRESS',
                        'PENDING_VERIFICATION',
                        'CLOSED'
                      ], (v) {
                        status = v;
                        load();
                      })),
                      const SizedBox(width: 10),
                      Expanded(
                          child: _select(type, 'Semua jenis', const [
                        '',
                        'MISSED_SCHEDULE',
                        'LATE_COMPLETION'
                      ], (v) {
                        type = v;
                        load();
                      })),
                    ],
                  ),
                ],
              ),
            ),
            if (loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: error != null
                  ? Center(
                      child: Text(error!,
                          style: const TextStyle(color: Colors.red)))
                  : RefreshIndicator(
                      onRefresh: load,
                      child: items.isEmpty
                          ? ListView(children: const [
                              SizedBox(height: 160),
                              Center(child: Text('Belum ada NCR preventive'))
                            ])
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                              itemCount: items.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 10),
                              itemBuilder: (_, index) => _card(items[index]),
                            ),
                    ),
            ),
          ],
        ),
      );
  Widget _select(String value, String hint, List<String> values,
          ValueChanged<String> changed) =>
      DropdownButtonFormField<String>(
          initialValue: value,
          isExpanded: true,
          decoration: InputDecoration(
              filled: true,
              fillColor: Colors.white,
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(10))),
          items: values
              .map((v) => DropdownMenuItem(
                  value: v,
                  child: Text(v.isEmpty ? hint : v.replaceAll('_', ' '),
                      overflow: TextOverflow.ellipsis)))
              .toList(),
          onChanged: (v) => changed(v ?? ''));
  Widget _card(PreventiveNcrItem item) => Card(
      child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => _detail(item),
          child: Padding(
              padding: const EdgeInsets.all(14),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                        color: item.severity == 'HIGH'
                            ? Colors.red.shade50
                            : Colors.amber.shade50,
                        borderRadius: BorderRadius.circular(10)),
                    child: Icon(Icons.report_problem_outlined,
                        color: item.severity == 'HIGH'
                            ? Colors.red
                            : Colors.orange)),
                const SizedBox(width: 12),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(item.title,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text('${item.number} · ${item.module}',
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFF64748B))),
                      Text('${item.assetCode} · ${item.woNumber}',
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFF64748B))),
                      const SizedBox(height: 7),
                      Wrap(spacing: 6, children: [
                        _chip(item.status, Colors.blue),
                        _chip(
                            item.severity,
                            item.severity == 'HIGH'
                                ? Colors.red
                                : Colors.orange)
                      ])
                    ]))
              ]))));
  Widget _chip(String text, MaterialColor color) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
          color: color.shade50, borderRadius: BorderRadius.circular(20)),
      child: Text(text.replaceAll('_', ' '),
          style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: color.shade700)));
  Future<void> _detail(PreventiveNcrItem item) async {
    final assigned = TextEditingController(text: item.assignedTo ?? '');
    final root = TextEditingController(text: item.rootCause ?? '');
    final corrective = TextEditingController(text: item.correctiveAction ?? '');
    final preventive = TextEditingController(text: item.preventiveAction ?? '');
    String nextStatus = item.status;
    await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        builder: (context) => StatefulBuilder(
            builder: (context, update) => Padding(
                padding: EdgeInsets.fromLTRB(
                    20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
                child: SingleChildScrollView(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(item.number,
                          style: const TextStyle(
                              fontSize: 19, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 5),
                      Text(item.description),
                      const SizedBox(height: 16),
                      _field(
                          'Status',
                          DropdownButtonFormField<String>(
                              initialValue: nextStatus,
                              items: const [
                                'OPEN',
                                'IN_PROGRESS',
                                'PENDING_VERIFICATION',
                                'CLOSED',
                                'CANCELLED'
                              ]
                                  .map((v) => DropdownMenuItem(
                                      value: v,
                                      child: Text(v.replaceAll('_', ' '))))
                                  .toList(),
                              onChanged: (v) =>
                                  update(() => nextStatus = v ?? nextStatus))),
                      _field('PIC', TextField(controller: assigned)),
                      _field('Root cause',
                          TextField(controller: root, maxLines: 2)),
                      _field('Corrective action',
                          TextField(controller: corrective, maxLines: 2)),
                      _field('Preventive action',
                          TextField(controller: preventive, maxLines: 2)),
                      SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                              onPressed: () async {
                                try {
                                  await repository.update(item.id, {
                                    'status': nextStatus,
                                    'assigned_to': assigned.text,
                                    'root_cause': root.text,
                                    'corrective_action': corrective.text,
                                    'preventive_action': preventive.text,
                                    'action_note': 'Diperbarui dari tablet'
                                  });
                                  if (context.mounted) {
                                    Navigator.pop(context);
                                  }
                                  await load();
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(content: Text(e.toString())));
                                  }
                                }
                              },
                              child: const Text('Simpan tindak lanjut')))
                    ])))));
    assigned.dispose();
    root.dispose();
    corrective.dispose();
    preventive.dispose();
  }

  Widget _field(String label, Widget child) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 5),
        child
      ]));
}
