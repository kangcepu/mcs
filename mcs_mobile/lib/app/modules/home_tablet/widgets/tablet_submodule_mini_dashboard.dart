import 'package:flutter/material.dart';

import '../../../data/providers/api_service.dart';

class TabletSubmoduleMiniDashboard extends StatefulWidget {
  final String group;
  const TabletSubmoduleMiniDashboard({super.key, required this.group});
  @override
  State<TabletSubmoduleMiniDashboard> createState() =>
      _TabletSubmoduleMiniDashboardState();
}

class _TabletSubmoduleMiniDashboardState
    extends State<TabletSubmoduleMiniDashboard> {
  bool loading = true;
  List<Map<String, dynamic>> rows = [];
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final response = await ApiService().get('/v2/dashboard/submodules',
          queryParameters: {'group': widget.group});
      final body = response.data;
      final data = body is Map ? body['data'] : null;
      if (mounted) {
        setState(() {
          rows = data is List
              ? data
                  .whereType<Map>()
                  .map((x) => Map<String, dynamic>.from(x))
                  .toList()
              : [];
          loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const SizedBox(
          height: 108, child: Center(child: CircularProgressIndicator()));
    }
    if (rows.isEmpty) {
      return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE2E8F0))),
          child: const Text(
              'Belum ada aktivitas submodul yang ditugaskan kepada Anda.',
              style: TextStyle(fontSize: 12, color: Color(0xFF64748B))));
    }
    return SizedBox(
        height: 108,
        child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) => card(rows[i])));
  }

  Widget card(Map<String, dynamic> x) => Container(
      width: 220,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: const Color(0xFFE2E8F0))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('${x['module_code']}',
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF2563EB))),
          const Spacer(),
          Text('${x['rollout_status']}',
              style: const TextStyle(fontSize: 9, color: Color(0xFF64748B)))
        ]),
        const SizedBox(height: 4),
        Text('${x['module_name']}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        const Spacer(),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          metric('Transaksi', x['transaction_count']),
          metric('Validasi', x['pending_count']),
          metric('Overdue', x['overdue_count'])
        ])
      ]));
  Widget metric(String label, dynamic value) => Column(children: [
        Text('${value ?? 0}',
            style: const TextStyle(fontWeight: FontWeight.w700)),
        Text(label,
            style: const TextStyle(fontSize: 8, color: Color(0xFF94A3B8)))
      ]);
}

class TabletModuleMiniDashboardPage extends StatelessWidget {
  final String group, title;
  const TabletModuleMiniDashboardPage(
      {super.key, required this.group, required this.title});
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.all(18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        const Text('Ringkasan submodul dan antrean validasi.',
            style: TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 14),
        TabletSubmoduleMiniDashboard(group: group)
      ]));
}
