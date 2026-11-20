import 'package:flutter/material.dart';

import '../../../data/providers/api_service.dart';

class TabletAssetPicSummaryPage extends StatefulWidget {
  final VoidCallback onBack;
  final ValueChanged<Map<String, dynamic>> onSelectPic;
  final VoidCallback onSelectMissing;

  const TabletAssetPicSummaryPage({
    super.key,
    required this.onBack,
    required this.onSelectPic,
    required this.onSelectMissing,
  });

  @override
  State<TabletAssetPicSummaryPage> createState() =>
      _TabletAssetPicSummaryPageState();
}

class _TabletAssetPicSummaryPageState extends State<TabletAssetPicSummaryPage> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _rows = [];
  int _missing = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiService().get('/v2/assets/pic-summary');
      final body = response.data;
      if (body is! Map ||
          (body['success'] != true && body['status'] != true) ||
          body['data'] is! Map) {
        throw Exception(body is Map
            ? body['message']
            : 'Response ringkasan PIC tidak valid.');
      }
      final data = body['data'] as Map;
      if (!mounted) return;
      setState(() {
        _rows = (data['rows'] as List? ?? [])
            .whereType<Map>()
            .map((row) => Map<String, dynamic>.from(row))
            .toList();
        _missing = _int(data['missing_pic']);
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          OutlinedButton.icon(
              onPressed: widget.onBack,
              icon: const Icon(Icons.arrow_back, size: 18),
              label: const Text('Kembali ke Aset')),
          const SizedBox(width: 12),
          const Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Aset per PIC',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A))),
                Text('Ringkasan kepemilikan dan tanggung jawab aset per user.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              ])),
          IconButton.outlined(
              onPressed: _loading ? null : _load,
              tooltip: 'Muat ulang',
              icon: const Icon(Icons.refresh, size: 18)),
        ]),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
              child: _metric(Icons.people_outline, 'PIC terdaftar',
                  '${_rows.length}', const Color(0xFF1B54E0))),
          const SizedBox(width: 12),
          Expanded(
              child: InkWell(
                  onTap: widget.onSelectMissing,
                  borderRadius: BorderRadius.circular(12),
                  child: _metric(
                      Icons.person_off_outlined,
                      'Aset aktif belum punya PIC',
                      '$_missing',
                      const Color(0xFFB45309),
                      warning: true))),
        ]),
        const SizedBox(height: 14),
        Expanded(
            child: Container(
          decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0))),
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text(_error!,
                          style: const TextStyle(color: Color(0xFFE11D48))),
                      const SizedBox(height: 10),
                      OutlinedButton(
                          onPressed: _load, child: const Text('Coba lagi'))
                    ]))
                  : _rows.isEmpty
                      ? const Center(
                          child: Text('Belum ada aset yang memiliki PIC.',
                              style: TextStyle(color: Color(0xFF64748B))))
                      : ListView.separated(
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (_, index) {
                            final row = _rows[index];
                            return ListTile(
                              onTap: () => widget.onSelectPic(row),
                              leading: const CircleAvatar(
                                  backgroundColor: Color(0xFFEFF4FF),
                                  child: Icon(Icons.person_outline,
                                      color: Color(0xFF1B54E0))),
                              title: Text('${row['pic_name'] ?? '-'}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              subtitle: Text([row['username'], row['division']]
                                  .where((value) =>
                                      value != null && '$value'.isNotEmpty)
                                  .join(' · ')),
                              trailing: Wrap(
                                  spacing: 18,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    _count('Total', row['total_assets']),
                                    _count('Aktif', row['active_assets']),
                                    _count('Inventory IT',
                                        row['inventory_it_assets']),
                                    _count('Disabled', row['disabled_assets']),
                                    const Icon(Icons.chevron_right,
                                        color: Color(0xFF94A3B8)),
                                  ]),
                            );
                          },
                        ),
        )),
      ]),
    );
  }

  Widget _metric(IconData icon, String label, String value, Color color,
          {bool warning = false}) =>
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: warning ? const Color(0xFFFFFBEB) : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: warning
                    ? const Color(0xFFFDE68A)
                    : const Color(0xFFE2E8F0))),
        child: Row(children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 11.5, color: color)),
            Text(value,
                style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF0F172A)))
          ])
        ]),
      );

  Widget _count(String label, dynamic value) => SizedBox(
      width: 76,
      child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('${_int(value)}',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
        Text(label,
            style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)))
      ]));

  static int _int(dynamic value) =>
      value is num ? value.toInt() : int.tryParse('$value') ?? 0;
}
