import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../controllers/report_so_detail_controller.dart';

class ReportSoDetailPage extends StatelessWidget {
  const ReportSoDetailPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ReportSoDetailController());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Report SO'),
      ),
      body: Obx(() {
        if (controller.isLoading.value && controller.header.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        if (!controller.found.value) {
          return RefreshIndicator(
            onRefresh: controller.loadDetail,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 140),
                Center(
                  child: Text(
                    controller.errorMessage.value.isEmpty
                        ? 'Data SO tidak ditemukan'
                        : controller.errorMessage.value,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
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
          onRefresh: controller.loadDetail,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            children: [
              _HeaderCard(controller: controller),
              const SizedBox(height: 10),
              _SectionCard(
                title: 'Detail Asset',
                count: controller.assetDetails.length,
                child: _SimpleTable(
                  headers: const [
                    'Asset Code',
                    'Asset Name',
                    'Status',
                    'Updated By'
                  ],
                  rows: controller.assetDetails
                      .map((row) => [
                            controller.readValue(row, 'asset_code'),
                            controller.readValue(row, 'asset_name'),
                            controller.readValue(row, 'status'),
                            controller.readValue(row, 'username'),
                          ])
                      .toList(),
                ),
              ),
              const SizedBox(height: 10),
              _SectionCard(
                title: 'Detail BOM',
                count: controller.bomDetails.length,
                child: _SimpleTable(
                  headers: const [
                    'Asset',
                    'Header',
                    'Part',
                    'Qty OH',
                    'Qty Found',
                    'UOM',
                    'Remark'
                  ],
                  rows: controller.bomDetails
                      .map((row) => [
                            controller.readValue(row, 'asset_code'),
                            controller.readValue(row, 'header'),
                            controller.readValue(row, 'part'),
                            controller.readValue(row, 'qty_on_hand'),
                            controller.readValue(row, 'qty_found'),
                            controller.readValue(row, 'uom'),
                            controller.readValue(row, 'remark'),
                          ])
                      .toList(),
                ),
              ),
              const SizedBox(height: 10),
              _SectionCard(
                title: 'Part Temuan',
                count: controller.nonPartDetails.length,
                child: _SimpleTable(
                  headers: const ['Part Name', 'Qty', 'Remark'],
                  rows: controller.nonPartDetails
                      .map((row) => [
                            controller.readValue(row, 'part_name'),
                            controller.readValue(row, 'qty'),
                            controller.readValue(row, 'remark'),
                          ])
                      .toList(),
                ),
              ),
              const SizedBox(height: 10),
              _SectionCard(
                title: 'Asset Temuan',
                count: controller.nonAssetDetails.length,
                child: _SimpleTable(
                  headers: const ['Asset Name', 'Location', 'Remark'],
                  rows: controller.nonAssetDetails
                      .map((row) => [
                            controller.readValue(row, 'name'),
                            controller.readValue(row, 'location'),
                            controller.readValue(row, 'remark'),
                          ])
                      .toList(),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  final ReportSoDetailController controller;

  const _HeaderCard({required this.controller});

  @override
  Widget build(BuildContext context) {
    final header = controller.header;
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
          const Text(
            'Informasi SO',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 8),
          _line('No SO', (header['no_so'] ?? '-').toString()),
          _line('Tanggal', (header['tanggal'] ?? '-').toString()),
          _line('Type', (header['type'] ?? '-').toString()),
          _line('Locked Date', (header['locked_date'] ?? '-').toString()),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: controller.printCurrent,
              icon: const Icon(Icons.print_outlined),
              label: const Text('Cetak'),
            ),
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
}

class _SectionCard extends StatelessWidget {
  final String title;
  final int count;
  final Widget child;

  const _SectionCard({
    required this.title,
    required this.count,
    required this.child,
  });

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
          Text(
            '$title ($count)',
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _SimpleTable extends StatelessWidget {
  final List<String> headers;
  final List<List<String>> rows;

  const _SimpleTable({
    required this.headers,
    required this.rows,
  });

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 10),
        child: Text(
          'Tidak ada data',
          style: TextStyle(
            color: Color(0xFF6B7280),
            fontSize: 12,
          ),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowHeight: 36,
        dataRowMinHeight: 34,
        dataRowMaxHeight: 42,
        columns: headers
            .map(
              (header) => DataColumn(
                label: Text(
                  header,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            )
            .toList(),
        rows: rows
            .map(
              (row) => DataRow(
                cells: row
                    .map(
                      (cell) => DataCell(
                        Text(
                          cell,
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                    )
                    .toList(),
              ),
            )
            .toList(),
      ),
    );
  }
}
