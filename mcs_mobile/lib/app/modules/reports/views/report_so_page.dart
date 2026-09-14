import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/report_so_controller.dart';

class ReportSoPage extends StatelessWidget {
  const ReportSoPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportSoController());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Report SO'),
      ),
      body: Column(
        children: [
          _FilterCard(controller: controller),
          Expanded(
            child: Obx(() {
              if (controller.isLoading.value && controller.rows.isEmpty) {
                return const Center(child: CircularProgressIndicator());
              }

              if (controller.errorMessage.value.isNotEmpty) {
                return RefreshIndicator(
                  onRefresh: controller.refreshData,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      const SizedBox(height: 140),
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Text(
                            controller.errorMessage.value,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Color(0xFFB45309),
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }

              if (controller.rows.isEmpty) {
                return RefreshIndicator(
                  onRefresh: controller.refreshData,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 140),
                      Center(
                        child: Text(
                          'Tidak ada data report SO',
                          style: TextStyle(
                            color: Color(0xFF6B7280),
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }

              return RefreshIndicator(
                onRefresh: controller.refreshData,
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  itemCount: controller.rows.length + 1,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      return Text(
                        'Total: ${controller.rows.length} data',
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF4B5563),
                        ),
                      );
                    }

                    final row = controller.rows[index - 1];
                    return _ReportSoCard(
                      row: row,
                      onView: () => controller.openDetail(row),
                      onPrint: () => controller.printRow(row),
                    );
                  },
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

class _FilterCard extends StatelessWidget {
  final ReportSoController controller;

  const _FilterCard({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        children: [
          TextField(
            controller: controller.noSoController,
            decoration: const InputDecoration(
              labelText: 'No SO',
              hintText: 'SO.000...',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),
          Obx(
            () => DropdownButtonFormField<String>(
              initialValue: controller.selectedType.value.isEmpty
                  ? null
                  : controller.selectedType.value,
              isDense: true,
              decoration: const InputDecoration(
                labelText: 'Type',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'ASSET', child: Text('ASSET')),
                DropdownMenuItem(value: 'BOM', child: Text('BOM')),
              ],
              onChanged: (value) {
                controller.selectedType.value = value ?? '';
              },
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Obx(
                  () => OutlinedButton.icon(
                    onPressed: () => controller.pickStartDate(context),
                    icon: const Icon(Icons.date_range, size: 16),
                    label: Text(
                      controller.startDate.value.isEmpty
                          ? 'Start Date'
                          : controller.startDate.value,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Obx(
                  () => OutlinedButton.icon(
                    onPressed: () => controller.pickEndDate(context),
                    icon: const Icon(Icons.date_range, size: 16),
                    label: Text(
                      controller.endDate.value.isEmpty
                          ? 'End Date'
                          : controller.endDate.value,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: controller.fetchList,
                  icon: const Icon(Icons.filter_alt_outlined),
                  label: const Text('Filter'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: controller.resetFilter,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Reset'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReportSoCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final VoidCallback onView;
  final VoidCallback onPrint;

  const _ReportSoCard({
    required this.row,
    required this.onView,
    required this.onPrint,
  });

  int _toInt(dynamic value) => int.tryParse(value.toString()) ?? 0;

  @override
  Widget build(BuildContext context) {
    final type = (row['type'] ?? '-').toString();
    final badgeColor =
        type == 'BOM' ? const Color(0xFF2563EB) : const Color(0xFF6B7280);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  (row['no_so'] ?? '-').toString(),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: badgeColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  type,
                  style: TextStyle(
                    color: badgeColor,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _line('Tanggal', (row['tanggal'] ?? '-').toString()),
          _line('Locked Date', (row['locked_date'] ?? '-').toString()),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                  child: _metric('Total Asset', _toInt(row['asset_total']))),
              Expanded(
                  child:
                      _metric('Asset Checked', _toInt(row['asset_checked']))),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(child: _metric('Total BOM', _toInt(row['bom_total']))),
              Expanded(
                  child: _metric('BOM Checked', _toInt(row['bom_checked']))),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onView,
                  icon: const Icon(Icons.visibility_outlined, size: 16),
                  label: const Text('Lihat'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onPrint,
                  icon: const Icon(Icons.print_outlined, size: 16),
                  label: const Text('Cetak'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _line(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text(
        '$label: $value',
        style: const TextStyle(
          fontSize: 12,
          color: Color(0xFF4B5563),
        ),
      ),
    );
  }

  Widget _metric(String label, int value) {
    return Text(
      '$label: $value',
      style: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: Color(0xFF1F2937),
      ),
    );
  }
}
