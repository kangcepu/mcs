import 'package:flutter/material.dart';

import '../../../core/services/realtime_service.dart';
import '../../../data/models/wo_mtc_model.dart';
import '../../../data/repositories/wo_mtc_repository.dart';

class AssetHistoryPage extends StatefulWidget {
  final String assetCode;
  final String assetName;
  final List<WorkOrderMtc> history;
  final String idEquipment;

  const AssetHistoryPage({
    super.key,
    required this.assetCode,
    required this.assetName,
    required this.history,
    this.idEquipment = '',
  });

  @override
  State<AssetHistoryPage> createState() => _AssetHistoryPageState();
}

class _AssetHistoryPageState extends State<AssetHistoryPage> {
  _HistoryFilter _filter = _HistoryFilter.all;
  late List<WorkOrderMtc> _history = widget.history;
  RealtimeSubscription? _realtime;

  @override
  void initState() {
    super.initState();
    if (widget.idEquipment.isEmpty) return;
    final repository = WoMtcRepository();
    _realtime = RealtimeSubscription(
      topics: const ['wo'],
      onChange: () async {
        final fresh = await repository.getAssetHistory(widget.idEquipment);
        if (!mounted) return;
        setState(() => _history = fresh);
      },
    );
  }

  @override
  void dispose() {
    _realtime?.dispose();
    super.dispose();
  }

  int get _correctiveCount => _history
      .where((item) => _kindOf(item) == _HistoryKind.corrective)
      .length;

  int get _preventiveCount => _history
      .where((item) => _kindOf(item) == _HistoryKind.preventive)
      .length;

  int get _projectCount => _history
      .where((item) => _kindOf(item) == _HistoryKind.project)
      .length;

  List<WorkOrderMtc> get _visibleHistory {
    if (_filter == _HistoryFilter.all) return _history;

    final expectedKind = _filter == _HistoryFilter.corrective
        ? _HistoryKind.corrective
        : _filter == _HistoryFilter.preventive
            ? _HistoryKind.preventive
            : _HistoryKind.project;
    return _history
        .where((item) => _kindOf(item) == expectedKind)
        .toList();
  }

  _HistoryKind _kindOf(WorkOrderMtc workOrder) {
    final type = workOrder.typeWo.trim().toUpperCase();
    if (type == 'PROJECT') return _HistoryKind.project;
    if (['PREVENTIVE', 'PREVENTIVE MAINTENANCE', 'PREV MAINTENANCE', 'PM']
        .contains(type)) {
      return _HistoryKind.preventive;
    }
    return _HistoryKind.corrective;
  }

  @override
  Widget build(BuildContext context) {
    final visibleHistory = _visibleHistory;
    return Scaffold(
      appBar: AppBar(title: const Text('Asset History')),
      body: Column(
        children: [
          _buildAssetHeader(),
          _buildFilterBar(),
          Expanded(
            child: visibleHistory.isEmpty
                ? Center(
                    child: Text(
                      _filter == _HistoryFilter.all
                          ? 'Belum ada riwayat WO untuk asset ini.'
                          : 'Belum ada riwayat untuk filter ini.',
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                    itemCount: visibleHistory.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) =>
                        _buildHistoryCard(visibleHistory[index]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildAssetHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 9),
      color: const Color(0xFFF0FDFA),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.assetCode,
                  style: const TextStyle(
                    color: Color(0xFF0F766E),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  widget.assetName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            '${_history.length}\nWO',
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: Colors.black54,
              fontSize: 12,
              height: 1.25,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: _HistoryFilterButton(
              label: 'All',
              count: _history.length,
              color: const Color(0xFF334155),
              selected: _filter == _HistoryFilter.all,
              onTap: () => setState(() => _filter = _HistoryFilter.all),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _HistoryFilterButton(
              label: 'Cor',
              count: _correctiveCount,
              color: const Color(0xFF2563EB),
              selected: _filter == _HistoryFilter.corrective,
              onTap: () => setState(() => _filter = _HistoryFilter.corrective),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _HistoryFilterButton(
              label: 'Prev',
              count: _preventiveCount,
              color: const Color(0xFF16A34A),
              selected: _filter == _HistoryFilter.preventive,
              onTap: () => setState(() => _filter = _HistoryFilter.preventive),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _HistoryFilterButton(
              label: 'Pro',
              count: _projectCount,
              color: const Color(0xFF9333EA),
              selected: _filter == _HistoryFilter.project,
              onTap: () => setState(() => _filter = _HistoryFilter.project),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryCard(WorkOrderMtc workOrder) {
    final kind = _kindOf(workOrder);
    return Card(
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    workOrder.woNumber,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                _KindLabel(kind: kind),
              ],
            ),
            const SizedBox(height: 7),
            Text(workOrder.jobTitle.isEmpty ? '-' : workOrder.jobTitle),
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(Icons.calendar_today_outlined,
                    size: 14, color: Colors.black54),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    workOrder.date.isEmpty ? '-' : workOrder.date,
                    style: const TextStyle(color: Colors.black54),
                  ),
                ),
                _StatusLabel(status: workOrder.status),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum _HistoryKind { corrective, preventive, project }

enum _HistoryFilter {
  all('All'),
  corrective('Cor'),
  preventive('Prev'),
  project('Pro');

  final String label;

  const _HistoryFilter(this.label);
}

class _HistoryFilterButton extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  const _HistoryFilterButton({
    required this.label,
    required this.count,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Ink(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.13) : Colors.white,
          borderRadius: BorderRadius.circular(9),
          border: Border.all(
            color: selected
                ? color.withValues(alpha: 0.35)
                : const Color(0xFFE2E8F0),
          ),
        ),
        child: Column(
          children: [
            Text(
              '$count',
              style: TextStyle(
                color: color,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 1),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _KindLabel extends StatelessWidget {
  final _HistoryKind kind;

  const _KindLabel({required this.kind});

  @override
  Widget build(BuildContext context) {
    String label;
    Color color;
    switch (kind) {
      case _HistoryKind.corrective:
        label = 'CORRECTIVE';
        color = const Color(0xFF2563EB);
        break;
      case _HistoryKind.preventive:
        label = 'PREVENTIVE';
        color = const Color(0xFF16A34A);
        break;
      case _HistoryKind.project:
        label = 'PROJECT';
        color = const Color(0xFF9333EA);
        break;
    }

    return Chip(
      label: Text(label),
      labelStyle:
          TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700),
      backgroundColor: color.withValues(alpha: 0.10),
      side: BorderSide.none,
      visualDensity: VisualDensity.compact,
    );
  }
}

class _StatusLabel extends StatelessWidget {
  final String status;

  const _StatusLabel({required this.status});

  @override
  Widget build(BuildContext context) {
    final normalized = status.toUpperCase();
    final color =
        normalized.contains('CLOSE') || normalized.contains('COMPLETE')
            ? Colors.green
            : normalized.contains('VOID') || normalized.contains('REJECT')
                ? Colors.red
                : normalized.contains('PROGRESS')
                    ? Colors.orange
                    : Colors.blue;
    return Chip(
      label: Text(status.isEmpty ? '-' : status),
      labelStyle: TextStyle(color: color, fontSize: 10),
      backgroundColor: color.withValues(alpha: 0.12),
      side: BorderSide.none,
      visualDensity: VisualDensity.compact,
    );
  }
}
