import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../../core/utils/company_label_helper.dart';
import '../../../data/models/work_order_model.dart' hide Material;
import '../controllers/wo_void_controller.dart';

class WoVoidPage extends GetView<WoVoidController> {
  const WoVoidPage({super.key});

  static const Map<String, String> _moduleLabels = {
    'tb_wo_mtc_operational': 'WO MTC',
    'tb_wo_mtc': 'WO MESO',
    'tb_wo_it': 'WO IS',
    'tb_wo_ga': 'WO GA',
    'tb_wo_preventive': 'WO Pro',
  };

  static const Map<String, Color> _moduleColors = {
    '': Color(0xFF475569),
    'tb_wo_mtc_operational': Color(0xFF00b894),
    'tb_wo_mtc': Color(0xFF8e44ad),
    'tb_wo_it': Color(0xFF1976D2),
    'tb_wo_ga': Color(0xFF16A085),
    'tb_wo_preventive': Color(0xFF8B4513),
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FB),
      appBar: AppBar(title: const Text('WO VOID')),
      body: Obx(() {
        if (controller.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        final filtered = controller.filteredCandidates;
        return RefreshIndicator(
          onRefresh: controller.loadCandidates,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
            children: [
              _DateSummaryStrip(controller: controller),
              const SizedBox(height: 12),
              _ModuleFilterStrip(controller: controller),
              const SizedBox(height: 12),
              if (filtered.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 60),
                  child: Center(
                    child: Text(
                      'Tidak ada WO preventive (H-1 atau overdue)\ntanpa progress untuk filter ini.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else ...[
                _SelectAllRow(controller: controller, visible: filtered),
                const SizedBox(height: 8),
                ...filtered.map((wo) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: _candidateCard(context, wo),
                    )),
              ],
            ],
          ),
        );
      }),
      bottomNavigationBar: Obx(() {
        final count = controller.selectedWoNumbers.length;
        if (count == 0) return const SizedBox.shrink();
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: controller.isBulkVoiding.value
                    ? null
                    : () => _confirmBulkVoid(context, count),
                icon: controller.isBulkVoiding.value
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.block_outlined),
                label: Text(controller.isBulkVoiding.value
                    ? 'Memproses...'
                    : 'VOID $count WO Terpilih'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _candidateCard(BuildContext context, WorkOrder wo) {
    final isVoiding = controller.voidingWoNumber.value == wo.woNumber;
    final moduleLabel = _moduleLabels[wo.sourceTable] ?? wo.sourceTable ?? '-';
    final moduleColor =
        _moduleColors[wo.sourceTable] ?? const Color(0xFF2563EB);
    final selected = controller.isSelected(wo.woNumber);
    final headerTitle = [
      shortCompanyLabel(wo.company),
      (wo.assetName ?? '').trim(),
      wo.jobTitle.trim(),
    ].where((item) => item.isNotEmpty && item != '-').join(' | ');
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(4),
        onTap: isVoiding ? null : () => controller.toggleSelectOne(wo.woNumber),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              SizedBox(
                width: 24,
                height: 24,
                child: Checkbox(
                  value: selected,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                  onChanged: isVoiding
                      ? null
                      : (_) => controller.toggleSelectOne(wo.woNumber),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(children: [
                      Expanded(
                        child: Text(headerTitle.isEmpty ? '-' : headerTitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: moduleColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: Text(moduleLabel,
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                color: moduleColor)),
                      ),
                    ]),
                    Text(
                      wo.woNumber.isEmpty ? '-' : wo.woNumber,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11, color: Color(0xFF64748B)),
                    ),
                    /* Legacy asset/WO detail layout.
                      Text(
                        '${wo.assetName?.isNotEmpty == true ? wo.assetName! : '-'}  •  ${wo.woNumber}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 11, color: Color(0xFF64748B)),
                      ),
                    */
                    if (isVoiding)
                      const Padding(
                        padding: EdgeInsets.only(top: 3),
                        child: Row(children: [
                          SizedBox(
                            width: 11,
                            height: 11,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          SizedBox(width: 6),
                          Text('Memproses...', style: TextStyle(fontSize: 10)),
                        ]),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmBulkVoid(BuildContext context, int count) async {
    final reasonController = TextEditingController();
    final confirmed = await Get.dialog<bool>(AlertDialog(
      title: Text('Void $count WO Preventive'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Alasan ini akan tercatat di rekap WO untuk semua WO yang dipilih.',
            style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: reasonController,
            maxLines: 3,
            decoration: const InputDecoration(
                labelText: 'Alasan void', border: OutlineInputBorder()),
          ),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Get.back(result: false),
            child: const Text('Batal')),
        ElevatedButton(
          onPressed: () {
            if (reasonController.text.trim().isEmpty) return;
            Get.back(result: true);
          },
          style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red, foregroundColor: Colors.white),
          child: const Text('VOID'),
        ),
      ],
    ));
    if (confirmed == true) {
      await controller.voidSelected(reasonController.text.trim());
    }
    reasonController.dispose();
  }
}

class _DateSummaryStrip extends StatelessWidget {
  final WoVoidController controller;

  const _DateSummaryStrip({required this.controller});

  @override
  Widget build(BuildContext context) {
    final days = controller.dateSummary;
    final today = DateTime.now();
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        childAspectRatio: 1.7,
      ),
      itemCount: days.length,
      itemBuilder: (context, index) {
        final entry = days[index];
        final isToday = entry.date.year == today.year &&
            entry.date.month == today.month &&
            entry.date.day == today.day;
        return _DateBox(dateCount: entry, highlight: isToday);
      },
    );
  }
}

class _DateBox extends StatelessWidget {
  final DateCount dateCount;
  final bool highlight;

  const _DateBox({required this.dateCount, required this.highlight});

  @override
  Widget build(BuildContext context) {
    final hasCount = dateCount.count > 0;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: highlight ? const Color(0xFFEFF3FF) : Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: highlight ? const Color(0xFF2563EB) : const Color(0xFFE2E8F0),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            DateFormat('dd/MM').format(dateCount.date),
            style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: Color(0xFF64748B)),
          ),
          Text(
            hasCount ? '${dateCount.count}' : '-',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color:
                  hasCount ? const Color(0xFF059669) : const Color(0xFF94A3B8),
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectAllRow extends StatelessWidget {
  final WoVoidController controller;
  final List<WorkOrder> visible;

  const _SelectAllRow({required this.controller, required this.visible});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Checkbox(
          value: controller.allVisibleSelected,
          onChanged: (_) => controller.toggleSelectAllVisible(),
        ),
        const Text('Pilih Semua', style: TextStyle(fontSize: 13)),
        const Spacer(),
        Text(
          '${controller.selectedWoNumbers.length} dipilih',
          style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
        ),
      ],
    );
  }
}

class _ModuleFilterStrip extends StatelessWidget {
  final WoVoidController controller;

  const _ModuleFilterStrip({required this.controller});

  @override
  Widget build(BuildContext context) {
    const filters = WoVoidController.moduleFilters;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        childAspectRatio: 2.75,
      ),
      itemCount: filters.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return _ModuleFilterChip(
            label: 'Semua',
            count: controller.countOf(''),
            color: WoVoidPage._moduleColors['']!,
            active: controller.selectedModule.value.isEmpty,
            onTap: () => controller.toggleModule(''),
          );
        }

        final item = filters[index - 1];
        final key = item['key']!;
        return _ModuleFilterChip(
          label: item['label']!,
          count: controller.countOf(key),
          color: WoVoidPage._moduleColors[key] ?? const Color(0xFF2563EB),
          active: controller.selectedModule.value == key,
          onTap: () => controller.toggleModule(key),
        );
      },
    );
  }
}

class _ModuleFilterChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  final bool active;
  final VoidCallback onTap;

  const _ModuleFilterChip({
    required this.label,
    required this.count,
    required this.color,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: active ? color : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? color : const Color(0xFFE2E8F0),
            ),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: color.withValues(alpha: 0.18),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '$count',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: active ? Colors.white : color,
                ),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: active ? Colors.white : const Color(0xFF334155),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
