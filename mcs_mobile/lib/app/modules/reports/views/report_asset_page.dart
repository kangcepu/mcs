import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/routes/app_routes.dart';
import '../controllers/report_asset_controller.dart';

class ReportAssetPage extends StatelessWidget {
  const ReportAssetPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportAssetController());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Report Asset'),
      ),
      body: Column(
        children: [
          Obx(
            () => Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Dashboard Assets',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF111827),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _SummaryCard(
                          label: 'UC',
                          count: controller.companyAssetCount('UC'),
                          isSelected: controller.selectedCompany.value == 'UC',
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _SummaryCard(
                          label: 'GSU',
                          count: controller.companyAssetCount('GSU'),
                          isSelected: controller.selectedCompany.value == 'GSU',
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _SummaryCard(
                          label: 'RU',
                          count: controller.companyAssetCount('RU'),
                          isSelected: controller.selectedCompany.value == 'RU',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: TextField(
              controller: controller.searchController,
              onChanged: controller.onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Cari Asset Code, Asset Name, Company',
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Total Assets: ${controller.totalAssetCount}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF4B5563),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: DropdownButtonFormField<String>(
                      initialValue: controller.companyOptions.contains(
                        controller.selectedCompany.value,
                      )
                          ? controller.selectedCompany.value
                          : 'ALL',
                      decoration: InputDecoration(
                        labelText: 'Filter Company',
                        prefixIcon: const Icon(Icons.business_outlined),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        isDense: true,
                      ),
                      items: controller.companyOptions
                          .map(
                            (company) => DropdownMenuItem<String>(
                              value: company,
                              child: Text(
                                company == 'ALL'
                                    ? 'Semua Company'
                                    : company,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value != null) {
                          controller.selectCompany(value);
                        }
                      },
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Lokasi',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF111827),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (controller.selectedCompany.value == 'ALL')
                    const Text(
                      'Pilih company terlebih dahulu',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF6B7280),
                      ),
                    )
                  else if (controller.locationSummaries.isEmpty)
                    const Text(
                      'Belum ada data lokasi',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF6B7280),
                      ),
                    )
                  else
                    SizedBox(
                      width: double.infinity,
                      child: DropdownButtonFormField<String>(
                        initialValue: controller.locationOptions.contains(
                          controller.selectedLocation.value,
                        )
                            ? controller.selectedLocation.value
                            : 'ALL',
                        decoration: InputDecoration(
                          labelText: 'Filter Lokasi',
                          prefixIcon: const Icon(Icons.location_on_outlined),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          isDense: true,
                        ),
                        items: controller.locationOptions
                            .map(
                              (location) => DropdownMenuItem<String>(
                                value: location,
                                child: SizedBox(
                                  width: double.infinity,
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          location == 'ALL'
                                              ? 'Semua Lokasi'
                                              : location,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Text(
                                        '${location == 'ALL' ? controller.filteredAssetsByCompany.length : controller.locationAssetCount(location)} Assets',
                                        textAlign: TextAlign.right,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          if (value != null) {
                            controller.selectLocation(value);
                          }
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: Obx(() {
              if (controller.isFirstLoad.value && controller.isLoading.value) {
                return const Center(child: CircularProgressIndicator());
              }

              if (!controller.isReadyToShowAssetList) {
                return RefreshIndicator(
                  onRefresh: controller.refreshData,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 140),
                      Center(
                        child: Text(
                          'Pilih company dan lokasi untuk melihat list assets',
                          style: TextStyle(
                            fontSize: 14,
                            color: Color(0xFF6B7280),
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                );
              }

              if (controller.filteredAssets.isEmpty) {
                return RefreshIndicator(
                  onRefresh: controller.refreshData,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 140),
                      Center(
                        child: Text(
                          'Data asset tidak ditemukan',
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
                  itemCount: controller.filteredAssets.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final row = controller.filteredAssets[index];
                    return _AssetCard(
                      row: row,
                      name: controller.assetName(row),
                      code: controller.assetCode(row),
                      company: controller.normalizedCompany(row),
                      category: controller.category(row),
                      location: controller.location(row),
                      remark: controller.remark(row),
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

class _SummaryCard extends StatelessWidget {
  final String label;
  final int count;
  final bool isSelected;

  const _SummaryCard({
    required this.label,
    required this.count,
    required this.isSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: isSelected ? const Color(0xFFEAF2FF) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isSelected ? const Color(0xFF2563EB) : const Color(0xFFE5E7EB),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: isSelected
                  ? const Color(0xFF1D4ED8)
                  : const Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '$count Assets',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: Color(0xFF111827),
            ),
          ),
        ],
      ),
    );
  }
}

class _AssetCard extends StatelessWidget {
  final Map<String, dynamic> row;
  final String name;
  final String code;
  final String company;
  final String category;
  final String location;
  final String remark;

  const _AssetCard({
    required this.row,
    required this.name,
    required this.code,
    required this.company,
    required this.category,
    required this.location,
    required this.remark,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Get.toNamed(
          AppRoutes.reportAssetDetail,
          arguments: {'row': row},
        ),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF111827),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                code,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF2563EB),
                ),
              ),
              const SizedBox(height: 10),
              _LabelRow(label: 'Company', value: company),
              _LabelRow(label: 'Category', value: category),
              _LabelRow(label: 'Location', value: location),
              _LabelRow(label: 'Keterangan', value: remark),
              const SizedBox(height: 2),
              const Row(
                children: [
                  Icon(
                    Icons.visibility_outlined,
                    size: 14,
                    color: Color(0xFF6B7280),
                  ),
                  SizedBox(width: 6),
                  Text(
                    'Lihat Detail',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF6B7280),
                      fontWeight: FontWeight.w600,
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
