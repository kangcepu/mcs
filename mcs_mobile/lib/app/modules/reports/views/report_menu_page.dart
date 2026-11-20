import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/routes/app_routes.dart';

class ReportMenuPage extends StatelessWidget {
  const ReportMenuPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(title: const Text('Report')),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 700;
          return SingleChildScrollView(
            padding: EdgeInsets.all(wide ? 24 : 16),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 980),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Pilih jenis report',
                        style: TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 5),
                    const Text(
                      'Report dikelompokkan berdasarkan fungsi agar lebih mudah dicari.',
                      style: TextStyle(color: Color(0xFF64748B)),
                    ),
                    const SizedBox(height: 20),
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: wide ? 3 : 1,
                      crossAxisSpacing: 16,
                      mainAxisSpacing: 16,
                      childAspectRatio: wide ? 2.15 : 2.35,
                      children: [
                        _ReportMenuCard(
                          title: 'Main Report',
                          description:
                              'Report operasional utama serta akses cepat Cetak QR.',
                          icon: Icons.dashboard_customize_outlined,
                          color: const Color(0xFF2563EB),
                          onTap: () => Get.toNamed(AppRoutes.reportMain),
                        ),
                        _ReportMenuCard(
                          title: 'NCR Report',
                          description:
                              'Report NCR dan ketidaksesuaian yang sudah tersedia.',
                          icon: Icons.report_problem_outlined,
                          color: const Color(0xFFDC2626),
                          onTap: () => Get.toNamed(AppRoutes.reportNcr),
                        ),
                        _ReportMenuCard(
                          title: 'Master Report',
                          description:
                              'Report master data, katalog, mapping, dan lokasi.',
                          icon: Icons.storage_outlined,
                          color: const Color(0xFF7C3AED),
                          onTap: () => Get.toNamed(AppRoutes.reportMaster),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ReportMenuCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _ReportMenuCard({
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: .1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: color, size: 27),
                ),
                const SizedBox(width: 15),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: const TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 5),
                      Text(description,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12.5, color: Color(0xFF64748B))),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.chevron_right_rounded,
                    color: Color(0xFF94A3B8)),
              ],
            ),
          ),
        ),
      );
}
