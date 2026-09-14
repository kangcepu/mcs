import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/report_asset_mutation_controller.dart';

class ReportAssetMutationPage extends StatelessWidget {
  const ReportAssetMutationPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportAssetMutationController());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Asset Mutation Request'),
      ),
      floatingActionButton: Obx(
        () => controller.canCreate.value
            ? FloatingActionButton.extended(
                onPressed: controller.openCreateRequest,
                icon: const Icon(Icons.add),
                label: const Text('Request'),
              )
            : const SizedBox.shrink(),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: TextField(
              controller: controller.searchController,
              onChanged: controller.onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Cari Doc No, Company, Location, Creator',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                isDense: true,
              ),
            ),
          ),
          Obx(
            () => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Text(
                    'Total: ${controller.requests.length} dokumen',
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF4B5563),
                    ),
                  ),
                  const Spacer(),
                  if (controller.canApprove.value)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDBEAFE),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'APPROVER',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF1D4ED8),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: Obx(() {
              if (controller.isFirstLoad.value && controller.isLoading.value) {
                return const Center(child: CircularProgressIndicator());
              }

              if (controller.requests.isEmpty) {
                return RefreshIndicator(
                  onRefresh: controller.refreshData,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 140),
                      Center(
                        child: Text(
                          'Data mutation request tidak ditemukan',
                          style: TextStyle(
                            fontSize: 14,
                            color: Color(0xFF6B7280),
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
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  itemCount: controller.requests.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final row = controller.requests[index];
                    final statusText = controller.status(row);
                    return _MutationRequestCard(
                      docNo: controller.docNo(row),
                      date: controller.date(row),
                      status: statusText,
                      statusColor: controller.statusColor(statusText),
                      companyBefore: controller.companyBefore(row),
                      locationBefore: controller.locationBefore(row),
                      creator: controller.creator(row),
                      detailCount: controller.detailCount(row),
                      onTap: () => controller.openDetail(row),
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

class _MutationRequestCard extends StatelessWidget {
  final String docNo;
  final String date;
  final String status;
  final Color statusColor;
  final String companyBefore;
  final String locationBefore;
  final String creator;
  final int detailCount;
  final VoidCallback onTap;

  const _MutationRequestCard({
    required this.docNo,
    required this.date,
    required this.status,
    required this.statusColor,
    required this.companyBefore,
    required this.locationBefore,
    required this.creator,
    required this.detailCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
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
                      docNo,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF111827),
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      status,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: statusColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _LabelRow(label: 'Date', value: date),
              _LabelRow(label: 'Location Before', value: locationBefore),
              _LabelRow(label: 'Company Before', value: companyBefore),
              _LabelRow(label: 'Creator', value: creator),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(
                    Icons.list_alt_outlined,
                    size: 14,
                    color: Color(0xFF6B7280),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '$detailCount item',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF6B7280),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  const Text(
                    'Lihat Detail',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF2563EB),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LabelRow extends StatelessWidget {
  final String label;
  final String value;

  const _LabelRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(
            fontSize: 12,
            color: Color(0xFF374151),
          ),
          children: [
            TextSpan(
              text: '$label: ',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            TextSpan(text: value),
          ],
        ),
      ),
    );
  }
}
