import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/reports_controller.dart';

class ReportLegacyPage extends StatelessWidget {
  const ReportLegacyPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportsController());
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(title: const Text('Report Legacy')),
      body: Obx(() {
        if (controller.reports.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Tidak ada Report Legacy yang tersedia untuk akses Anda.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF64748B)),
              ),
            ),
          );
        }
        return LayoutBuilder(builder: (context, constraints) {
          final maxWidth =
              constraints.maxWidth >= 900 ? 880.0 : double.infinity;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: maxWidth),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Format report lama',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF64748B)),
                      ),
                      const SizedBox(height: 10),
                      ...controller.reports.map((item) => Padding(
                            padding: const EdgeInsets.only(bottom: 9),
                            child: Material(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              child: ListTile(
                                onTap: () => controller.openReport(item),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12)),
                                leading: Container(
                                  padding: const EdgeInsets.all(9),
                                  decoration: BoxDecoration(
                                    color: item.color.withValues(alpha: .1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(item.icon, color: item.color),
                                ),
                                title: Text(item.title,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                subtitle: Text(item.subtitle),
                                trailing:
                                    const Icon(Icons.chevron_right_rounded),
                              ),
                            ),
                          )),
                    ],
                  ),
                ),
              ),
            ],
          );
        });
      }),
    );
  }
}
