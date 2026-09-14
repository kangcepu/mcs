import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/report_wo_recap_controller.dart';

class ReportWoRecapPage extends StatelessWidget {
  const ReportWoRecapPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportWoRecapController());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Recap Work Order'),
      ),
      body: Obx(() {
        if (controller.isLoading.value &&
            controller.itStats.isEmpty &&
            controller.mesoStats.isEmpty &&
            controller.mtcStats.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        return RefreshIndicator(
          onRefresh: controller.refreshData,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFC7D2FE)),
                ),
                child: Text(
                  'Total Work Order: ${controller.totalAll}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF3730A3),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _RecapCard(
                title: 'WO ITIS',
                accent: const Color(0xFF2563EB),
                stats: controller.itStats,
                onTapOpen: () => controller.openModule('IT'),
              ),
              const SizedBox(height: 10),
              _RecapCard(
                title: 'WO MESO',
                accent: const Color(0xFF7C3AED),
                stats: controller.mesoStats,
                onTapOpen: () => controller.openModule('MESO'),
              ),
              const SizedBox(height: 10),
              _RecapCard(
                title: 'WO MTC',
                accent: const Color(0xFF0F766E),
                stats: controller.mtcStats,
                onTapOpen: () => controller.openModule('MTC'),
              ),
            ],
          ),
        );
      }),
    );
  }
}

class _RecapCard extends StatelessWidget {
  final String title;
  final Color accent;
  final Map<String, int> stats;
  final VoidCallback onTapOpen;

  const _RecapCard({
    required this.title,
    required this.accent,
    required this.stats,
    required this.onTapOpen,
  });

  int _read(Map<String, int> map, String key) => map[key] ?? 0;

  @override
  Widget build(BuildContext context) {
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
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: accent,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
              TextButton(
                onPressed: onTapOpen,
                child: const Text('Buka WO'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatChip(label: 'Open', value: _read(stats, 'open')),
              _StatChip(label: 'Progress', value: _read(stats, 'in_progress')),
              _StatChip(label: 'Closed', value: _read(stats, 'closed')),
              _StatChip(label: 'Total', value: _read(stats, 'total')),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final int value;

  const _StatChip({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$label: $value',
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: Color(0xFF374151),
        ),
      ),
    );
  }
}
