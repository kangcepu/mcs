import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/wo_operational_detail_controller.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../data/models/work_order_model.dart' as wo_model;
import '../../../core/utils/media_picker_helper.dart';
import '../../../core/widgets/video_player_page.dart';
import '../../../core/widgets/request_part_dialog.dart';
import '../../../core/widgets/work_order_detail_tabs.dart';
import 'package:multi_select_flutter/multi_select_flutter.dart';

class _PartExecutionSection {
  final String label;
  final List<_PartExecutionEntry> entries;

  const _PartExecutionSection({
    required this.label,
    required this.entries,
  });
}

class _PartExecutionEntry {
  final int index;
  final wo_model.PreventivePartExecution row;

  const _PartExecutionEntry({
    required this.index,
    required this.row,
  });
}

class WoOperationalDetailPage extends GetView<WoOperationalDetailController> {
  const WoOperationalDetailPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Detail Work Order'),
        actions: [
          Obx(() => controller.canVoidPreventive
              ? IconButton(
                  icon: const Icon(Icons.cancel_outlined),
                  tooltip: 'Void preventive',
                  onPressed: () => _showVoidPreventiveDialog(context),
                )
              : const SizedBox.shrink()),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: controller.refresh,
          ),
        ],
      ),
      body: Obx(() {
        if (controller.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }

        if (controller.workOrder.value == null) {
          return const Center(child: Text('Data tidak ditemukan'));
        }

        return Stack(
          children: [
            RefreshIndicator(
              onRefresh: controller.refresh,
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHeaderCard(),
                    _buildTabNavigation(),
                    _buildSelectedTabContent(context),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ],
        );
      }),
    );
  }

  Widget _buildTabNavigation() {
    return Obx(() => WorkOrderDetailTabs(
          selectedIndex: controller.selectedDetailTab.value,
          onSelected: controller.setSelectedDetailTab,
        ));
  }

  Widget _buildSelectedTabContent(BuildContext context) {
    return Obx(() {
      switch (controller.selectedDetailTab.value) {
        case 1:
          return controller.isPreventiveWo
              ? Column(
                  children: [
                    const SizedBox(height: 8),
                    _buildPartExecutionCard(context),
                  ],
                )
              : Padding(
                  padding: const EdgeInsets.all(12),
                  child: _buildSimpleInfoCard(
                    title: 'Preventive',
                    child: const Text('WO ini bukan tipe preventive'),
                  ),
                );
        case 2:
          return Column(
            children: [
              _buildResourceActionPanel(context),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: _buildExecutorsCard(),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: _buildLaborCard(),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: _buildMaterialCard(),
              ),
            ],
          );
        case 3:
          return Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: _buildApprovalsCard(),
          );
        case 0:
        default:
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: _buildInfoCard(),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _buildAttachmentSummaryCard(),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        children: [
                          _buildExecutorSummaryCard(),
                          const SizedBox(height: 12),
                          _buildProgressSummaryCard(),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: _buildQuickInfoCard(),
              ),
              if (controller.isPreventiveWo)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                  child: _buildPreventiveSummaryCard(),
                ),
            ],
          );
      }
    });
  }

  Widget _buildHeaderCard() {
    final wo = controller.workOrder.value!;
    final rawAssetName = (wo.assetName ?? '').trim();
    final assetName = rawAssetName.isNotEmpty ? rawAssetName : '-';
    DateTime? parsedDate;
    try {
      parsedDate = DateTime.parse(wo.date);
    } catch (_) {
      parsedDate = null;
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        assetName,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        wo.jobTitle,
                        style: TextStyle(
                          fontSize: 14,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: controller.getStatusBgColor(wo.status),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        controller.getStatusLabel(wo.status),
                        style: TextStyle(
                          color: controller.getStatusColor(wo.status),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      (wo.priority).trim().isEmpty ? '-' : wo.priority,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFFF59E0B),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 14, color: AppColors.grey),
                const SizedBox(width: 6),
                Text(
                  parsedDate != null
                      ? formatDisplayDateValue(parsedDate)
                      : formatDisplayDate(wo.date),
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    wo.woNumber,
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard() {
    final wo = controller.workOrder.value!;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.description_outlined,
                size: 18,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Job Details',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF2d3436),
                  ),
                ),
              ),
              if (controller.canExecute)
                InkWell(
                  onTap: () => _showJobExplanationDialog(Get.context!),
                  borderRadius: BorderRadius.circular(10),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 2,
                    ),
                    child: Text(
                      'Edit',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          _buildJobDetailField('Job Title', wo.jobTitle),
          const SizedBox(height: 10),
          _buildJobDetailField('Job Requirement', wo.jobRequirement),
          if ((wo.jobExplanation ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            _buildJobDetailField(
              'Job Explanation',
              wo.jobExplanation ?? '',
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildJobDetailField(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value.trim().isEmpty ? '-' : value,
          style: const TextStyle(
            fontSize: 14,
            color: Color(0xFF2d3436),
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildSimpleInfoCard({
    required String title,
    Widget? child,
    String? actionLabel,
    VoidCallback? onActionTap,
  }) {
    final hasHeader = title.trim().isNotEmpty || actionLabel != null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasHeader)
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (actionLabel != null)
                  InkWell(
                    onTap: onActionTap,
                    borderRadius: BorderRadius.circular(10),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 2,
                      ),
                      child: Text(
                        actionLabel,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          if (hasHeader) const SizedBox(height: 10),
          child ?? const SizedBox(),
        ],
      ),
    );
  }

  Widget _buildResourceActionPanel(BuildContext context) {
    if (!controller.canExecute &&
        !controller.canComplete &&
        !controller.canClose) {
      return const SizedBox();
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: _buildSimpleInfoCard(
        title: 'Aksi Cepat',
        child: Column(
          children: [
            if (controller.canExecute) ...[
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Update Progress',
                      icon: Icons.edit_note,
                      backgroundColor: AppColors.primary,
                      onTap: () => _showJobExplanationDialog(context),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Labor / PIC',
                      icon: Icons.groups_2_outlined,
                      backgroundColor: const Color(0xFFF59E0B),
                      onTap: () => _showAddLaborDialog(context),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Request Part',
                      icon: Icons.inventory_2_outlined,
                      backgroundColor: const Color(0xFF9333EA),
                      onTap: () => _showAddMaterialDialog(context),
                    ),
                  ),
                  if (controller.canComplete) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: _buildQuickActionButton(
                        label: 'Selesaikan WO',
                        icon: Icons.done_all,
                        backgroundColor: const Color(0xFF2563EB),
                        onTap: () => _showJobExplanationDialog(
                          context,
                          forceComplete: true,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ] else if (controller.canComplete) ...[
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Selesaikan WO',
                      icon: Icons.done_all,
                      backgroundColor: const Color(0xFF2563EB),
                      onTap: () => _showJobExplanationDialog(context,
                          forceComplete: true),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildQuickActionButton({
    required String label,
    required IconData icon,
    required Color backgroundColor,
    required VoidCallback onTap,
  }) {
    return SizedBox(
      height: 46,
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 18),
        label: Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  Widget _buildPreventiveSummaryCard() {
    final total = controller.partExecutionRows.length;
    final done = controller.partExecutionRows
        .where((item) => item.maintenanceStatus == 'DONE')
        .length;
    final progress = total == 0 ? 0.0 : (done / total) * 100;

    return _buildSimpleInfoCard(
      title: 'Preventive Summary',
      child: total == 0
          ? Text(
              'Part preventive belum tersedia',
              style: TextStyle(color: AppColors.textSecondary),
            )
          : Row(
              children: [
                SizedBox(
                  width: 62,
                  height: 62,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CircularProgressIndicator(
                        value: progress / 100,
                        strokeWidth: 6,
                        backgroundColor: const Color(0xFFE5EAF1),
                        valueColor: const AlwaysStoppedAnimation<Color>(
                          Color(0xFF10B981),
                        ),
                      ),
                      Text(
                        '${progress.round()}%',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Part MTC',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$done dari $total item selesai',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _buildMetaPill(
                            label: 'Selesai $done',
                            backgroundColor: const Color(0xFFE6F9F2),
                            textColor: const Color(0xFF0F9D58),
                          ),
                          _buildMetaPill(
                            label: 'Belum ${total - done}',
                            backgroundColor: const Color(0xFFFFF2E6),
                            textColor: const Color(0xFFE17055),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildQuickInfoCard() {
    final photoCount = controller.servicePhotos.length;
    return _buildSimpleInfoCard(
      title: 'Quick Info',
      child: Row(
        children: [
          Expanded(
            child: _buildQuickInfoItem(
              icon: Icons.person_outline,
              label: 'Labor',
              value: '${controller.labor.length} orang',
            ),
          ),
          _buildQuickDivider(),
          Expanded(
            child: _buildQuickInfoItem(
              icon: Icons.inventory_2_outlined,
              label: 'Material',
              value: '${controller.materials.length} item',
            ),
          ),
          _buildQuickDivider(),
          Expanded(
            child: _buildQuickInfoItem(
              icon: Icons.photo_camera_back_outlined,
              label: 'Foto',
              value: '$photoCount Foto',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickInfoItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Column(
      children: [
        Icon(icon, size: 18, color: AppColors.primary),
        const SizedBox(height: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildQuickDivider() {
    return Container(
      width: 1,
      height: 34,
      color: const Color(0xFFE5EAF1),
    );
  }

  Widget _buildMetaPill({
    required String label,
    required Color backgroundColor,
    required Color textColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }

  String _formatTypeWoLabel(String raw) {
    final normalized = raw.trim().toLowerCase();
    switch (normalized) {
      case 'preventive':
      case 'preventive maintenance':
      case 'prev maintenance':
      case 'pm':
        return 'Preventive';
      case 'corrective':
      case 'corrective maintenance':
      case 'cm':
        return 'Corrective';
      case 'project':
        return 'Project';
      default:
        return raw.trim().isEmpty ? '-' : raw;
    }
  }

  Widget _buildAttachmentSummaryCard() {
    final wo = controller.workOrder.value!;
    final attachments = (wo.attachment ?? '')
        .split(',')
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty && item != '#')
        .toList(growable: false);
    final previewImages =
        controller.servicePhotos.where((item) => item.url.isNotEmpty).toList();
    final totalPhotos = previewImages.length;

    return _buildSimpleInfoCard(
      title: 'Attachments',
      actionLabel: totalPhotos > 0 ? '$totalPhotos Foto' : null,
      child: previewImages.isNotEmpty
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: AspectRatio(
                    aspectRatio: 1.2,
                    child: Image.network(
                      previewImages.first.url,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: const Color(0xFFF3F6FA),
                        child: const Center(child: Icon(Icons.broken_image)),
                      ),
                    ),
                  ),
                ),
                if (attachments.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    attachments.first,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            )
          : Text(
              'Belum ada lampiran',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
    );
  }

  Widget _buildExecutorSummaryCard() {
    return _buildSimpleInfoCard(
      title: 'Labor/PIC',
      actionLabel: controller.canExecute ? 'Edit' : null,
      onActionTap: controller.canExecute
          ? () => controller.setSelectedDetailTab(2)
          : null,
      child: Obx(() {
        final executorNames = _getExecutorDisplayNames();
        if (executorNames.isEmpty) {
          return Text(
            'Belum ada executor',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          );
        }

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFF22C55E),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  executorNames.join(', '),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }

  Widget _buildProgressSummaryCard() {
    final progress = _calculateProgressValue();
    return _buildSimpleInfoCard(
      title: '',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Progress',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
              Text(
                '${progress.round()}%',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Update :',
                style: TextStyle(
                  fontSize: 10,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  _buildLatestUpdateText(),
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildApprovalSummaryCard() {
    final latest =
        controller.approvals.isNotEmpty ? controller.approvals.last : null;
    final approvalName = latest == null ? '' : _getApprovalDisplayName(latest);
    return _buildSimpleInfoCard(
      title: 'Approval History',
      actionLabel: controller.approvals.length > 1 ? 'Lihat semua' : null,
      onActionTap: controller.approvals.length > 1
          ? () => controller.setSelectedDetailTab(3)
          : null,
      child: latest == null
          ? Text(
              'Belum ada approval',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        approvalName,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      formatDisplayDateTime(latest.createdAt),
                      style: TextStyle(
                        fontSize: 10,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _buildMetaPill(
                  label: 'APPROVED',
                  backgroundColor: const Color(0xFFE6F9F2),
                  textColor: const Color(0xFF0F9D58),
                ),
              ],
            ),
    );
  }

  double _calculateProgressValue() {
    final status = (controller.workOrder.value?.status ?? '').toUpperCase();
    if (controller.isPreventiveWo && controller.partExecutionRows.isNotEmpty) {
      final total = controller.partExecutionRows.length;
      final done = controller.partExecutionRows
          .where((item) => item.maintenanceStatus == 'DONE')
          .length;
      return total == 0 ? 0 : (done / total) * 100;
    }
    if (status == 'CLOSED' || status == 'COMPLETE') return 100;
    if (status == 'NEED_CLOSED' || status == 'COMPLETE_EXECUTOR') return 90;
    if (status == 'IN_PROGRESS_EXECUTOR' || status == 'PARTS_RECEIVED') {
      return 60;
    }
    if (status == 'WAIT_EXECUTOR_ADMIN' || status == 'WAITING_PARTS') {
      return 30;
    }
    if (status.contains('WAIT_KA')) return 15;
    return 0;
  }

  String _buildLatestUpdateText() {
    final latestApproval = controller.approvals.isNotEmpty
        ? controller.approvals.last.createdAt
        : null;
    if ((latestApproval ?? '').trim().isNotEmpty) {
      return formatDisplayDateTime(latestApproval);
    }
    final updatedAt = controller.workOrder.value?.updatedAt ?? '';
    if (updatedAt.trim().isNotEmpty) {
      return formatDisplayDateTime(updatedAt);
    }
    return 'Belum ada update';
  }

  String _getApprovalDisplayName(wo_model.Approval approval) {
    final alias = approval.alias.trim();
    if (alias.isNotEmpty) {
      return alias;
    }
    final fullname = approval.fullname.trim();
    return fullname.isNotEmpty ? fullname : '-';
  }

  List<String> _getExecutorDisplayNames() {
    final names = <String>[];

    for (final item in controller.labor) {
      final name = item.trade.trim();
      if (name.isNotEmpty && !names.contains(name)) {
        names.add(name);
      }
    }

    final pic = (controller.workOrder.value?.pic ?? '').trim();
    final upperPic = pic.toUpperCase();
    final looksLikeDivisionCode = const {
      'MTC',
      'MESO',
      'ITS',
      'IT',
      'HRGA',
      'GA',
      'SPL',
      'OTO',
      'ELC',
      'MKL',
      'IS',
    }.contains(upperPic);
    if (pic.isNotEmpty && !looksLikeDivisionCode && !names.contains(pic)) {
      names.add(pic);
    }

    if (names.isNotEmpty) {
      return names;
    }

    for (final item in controller.executors) {
      final name = item.jobExecutor.trim();
      if (name.isNotEmpty && !names.contains(name)) {
        names.add(name);
      }
    }

    return names;
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
            ),
          ),
          const Text(': ', style: TextStyle(fontSize: 13)),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildServicePhotosCard() {
    return Obx(() {
      final previewImages = controller.servicePhotos
          .where((item) => item.url.isNotEmpty)
          .toList(growable: false);

      if (previewImages.isEmpty) return const SizedBox();

      return Column(
        children: [
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Bukti Foto/Video Service',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF2d3436),
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.greyLight,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${previewImages.length}',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 110,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: previewImages.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 12),
                    itemBuilder: (context, index) {
                      final img = previewImages[index];
                      final isVideo = MediaPickerHelper.isVideo(img.url);
                      return InkWell(
                        onTap: () => isVideo
                            ? Get.to(() => VideoPlayerPage(
                                  title: img.name.isEmpty ? 'Video' : img.name,
                                  networkUrl: img.url,
                                ))
                            : _showImagePreview(img),
                        borderRadius: BorderRadius.circular(12),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: AspectRatio(
                            aspectRatio: 1.3,
                            child: isVideo
                                ? Container(
                                    color: Colors.black87,
                                    child: const Center(
                                      child: Icon(
                                        Icons.play_circle_fill,
                                        color: Colors.white,
                                        size: 36,
                                      ),
                                    ),
                                  )
                                : Image.network(
                              img.url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(
                                color: AppColors.greyLight,
                                child: const Center(
                                  child: Icon(Icons.broken_image),
                                ),
                              ),
                              loadingBuilder: (context, child, progress) {
                                if (progress == null) return child;
                                return Container(
                                  color: AppColors.greyLight,
                                  child: const Center(
                                    child: CircularProgressIndicator(),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    });
  }

  List<_PartExecutionSection> _buildPartExecutionSections(
    List<wo_model.PreventivePartExecution> rows,
  ) {
    final grouped = <String, List<_PartExecutionEntry>>{};

    for (var i = 0; i < rows.length; i++) {
      final row = rows[i];
      final label = _normalizeScheduleLabel(row.tipeJadwal);
      grouped.putIfAbsent(label, () => <_PartExecutionEntry>[]);
      grouped[label]!.add(_PartExecutionEntry(index: i, row: row));
    }

    final sections = grouped.entries
        .map(
          (entry) => _PartExecutionSection(
            label: entry.key,
            entries: (() {
              final items = List<_PartExecutionEntry>.from(entry.value);
              items.sort((left, right) {
                final leftDone = left.row.maintenanceStatus == 'DONE';
                final rightDone = right.row.maintenanceStatus == 'DONE';
                if (leftDone != rightDone) {
                  return leftDone ? 1 : -1;
                }

                final leftName = left.row.partMesin.trim().toLowerCase();
                final rightName = right.row.partMesin.trim().toLowerCase();
                return leftName.compareTo(rightName);
              });
              return items;
            })(),
          ),
        )
        .toList();

    sections.sort(
      (a, b) =>
          _scheduleSortOrder(a.label).compareTo(_scheduleSortOrder(b.label)),
    );

    return sections;
  }

  String _normalizeScheduleLabel(String raw) {
    final value = raw.trim().toLowerCase();
    if (value.contains('harian') || value.contains('daily')) {
      return 'Harian';
    }
    if (value.contains('mingguan') || value.contains('weekly')) {
      return 'Mingguan';
    }
    if (value.contains('bulanan') || value.contains('monthly')) {
      return 'Bulanan';
    }
    return 'Lainnya';
  }

  int _scheduleSortOrder(String label) {
    switch (label) {
      case 'Harian':
        return 0;
      case 'Mingguan':
        return 1;
      case 'Bulanan':
        return 2;
      default:
        return 3;
    }
  }

  Color _scheduleBadgeBackground(String label) {
    switch (label) {
      case 'Harian':
        return const Color(0xFFE8F7EE);
      case 'Mingguan':
        return const Color(0xFFEAF2FF);
      case 'Bulanan':
        return const Color(0xFFFFF4E8);
      default:
        return const Color(0xFFF1F5F9);
    }
  }

  Color _scheduleBadgeTextColor(String label) {
    switch (label) {
      case 'Harian':
        return const Color(0xFF0F9D58);
      case 'Mingguan':
        return const Color(0xFF2D5BBA);
      case 'Bulanan':
        return const Color(0xFFE17055);
      default:
        return const Color(0xFF5F6B7A);
    }
  }

  Widget _buildPartExecutionCard(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Obx(() {
            final rows = controller.partExecutionRows.toList();
            final totalRows = rows.length;
            final totalDone =
                rows.where((row) => row.maintenanceStatus == 'DONE').length;
            final sections = _buildPartExecutionSections(rows);

            if (controller.partExecutionRows.isEmpty) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        const Text(
                          'Part MTC',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF2d3436),
                          ),
                        ),
                        if (controller.isPartExecutionDirty.value) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFfeca57).withOpacity(0.2),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text(
                              'Belum disimpan',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFFe17055),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Part preventive belum tersedia',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              );
            }

            final estimateHeight = totalRows * 168.0;
            final listHeight = estimateHeight.clamp(220.0, screenHeight * 0.54);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      const Text(
                        'Part MTC',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF2d3436),
                        ),
                      ),
                      const SizedBox(width: 10),
                      _buildPartStatPill(
                        label: 'Total Part',
                        value: '$totalRows',
                        bgColor: const Color(0xFFEAF2FF),
                        textColor: const Color(0xFF2d5bba),
                      ),
                      const SizedBox(width: 8),
                      _buildPartStatPill(
                        label: 'Selesai',
                        value: '$totalDone',
                        bgColor: const Color(0xFFE6F9F2),
                        textColor: const Color(0xFF00a884),
                      ),
                      const SizedBox(width: 8),
                      _buildPartStatPill(
                        label: 'Belum',
                        value: '${totalRows - totalDone}',
                        bgColor: const Color(0xFFFFF2E6),
                        textColor: const Color(0xFFe17055),
                      ),
                      if (controller.isPartExecutionDirty.value) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFfeca57).withOpacity(0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'Belum disimpan',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFFe17055),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Ceklis jika part sudah selesai dikerjakan.',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF636e72),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: listHeight.toDouble(),
                  child: ListView.separated(
                    physics: const ClampingScrollPhysics(),
                    itemCount: sections.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final section = sections[index];
                      final sectionDone = section.entries
                          .where(
                              (entry) => entry.row.maintenanceStatus == 'DONE')
                          .length;

                      return Container(
                        padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFDFEFF),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFFE6ECF3)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color:
                                        _scheduleBadgeBackground(section.label),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    section.label,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: _scheduleBadgeTextColor(
                                          section.label),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  '${sectionDone}/${section.entries.length} selesai',
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF5F6B7A),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Column(
                              children: [
                                for (var entryIndex = 0;
                                    entryIndex < section.entries.length;
                                    entryIndex++) ...[
                                  _buildPartExecutionRow(
                                    context,
                                    section.entries[entryIndex].index,
                                    section.entries[entryIndex].row,
                                  ),
                                  if (entryIndex < section.entries.length - 1)
                                    const SizedBox(height: 8),
                                ],
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          }),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: controller.canUpdatePreventivePart &&
                      controller.partExecutionRows.isNotEmpty
                  ? controller.savePartExecution
                  : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00b894),
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.save, size: 18),
              label: const Text('Simpan Sementara Part'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPartExecutionRow(
    BuildContext context,
    int index,
    wo_model.PreventivePartExecution row,
  ) {
    final preview = _getPreviewImage(row);
    final allImages = _collectAllImages(row);
    final previewImages = allImages.take(4).toList();
    final hiddenImages = allImages.length - previewImages.length;
    final videoCount =
        row.executionMedia.where((item) => item.mediaType == 'video').length;
    final isDone = row.maintenanceStatus == 'DONE';
    final requestPartLabel =
        row.requestPart.isEmpty ? row.partMesin : row.requestPart;
    final hasRequestInfo = requestPartLabel.trim().isNotEmpty ||
        row.requestQty > 0 ||
        row.keterangan.trim().isNotEmpty;

    return RepaintBoundary(
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 7),
        decoration: BoxDecoration(
          color: isDone ? const Color(0xFFF2FBF7) : const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDone ? const Color(0xFFBEEAD9) : const Color(0xFFE6ECF3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              row.partMesin.isEmpty ? '-' : row.partMesin,
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w600,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (row.tipeJadwal.trim().isNotEmpty) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: _scheduleBadgeBackground(
                                  _normalizeScheduleLabel(row.tipeJadwal),
                                ),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                _normalizeScheduleLabel(row.tipeJadwal),
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w700,
                                  color: _scheduleBadgeTextColor(
                                    _normalizeScheduleLabel(row.tipeJadwal),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      if (row.bagianMesin.trim().isNotEmpty &&
                          row.bagianMesin.trim() != '-')
                        Text(
                          row.bagianMesin,
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: Color(0xFF636e72),
                          ),
                        ),
                      if (row.kondisi.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          row.kondisi,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: Color(0xFF636e72),
                            height: 1.3,
                          ),
                        ),
                      ],
                      if (hasRequestInfo) ...[
                        const SizedBox(height: 3),
                        Text(
                          'Req: $requestPartLabel | Qty: ${_formatRequestQty(row.requestQty)} ${row.requestUom}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: Color(0xFF5f6b7a),
                          ),
                        ),
                      ],
                      if (previewImages.isNotEmpty || videoCount > 0) ...[
                        const SizedBox(height: 6),
                        SizedBox(
                          height: 34,
                          child: Row(
                            children: [
                              Expanded(
                                child: ListView.separated(
                                  scrollDirection: Axis.horizontal,
                                  itemCount: previewImages.length,
                                  separatorBuilder: (_, __) =>
                                      const SizedBox(width: 6),
                                  itemBuilder: (context, imageIndex) {
                                    final img = previewImages[imageIndex];
                                    final isVideo =
                                        MediaPickerHelper.isVideo(img.url);
                                    return GestureDetector(
                                      onTap: () => isVideo
                                          ? Get.to(() => VideoPlayerPage(
                                                title: img.name.isEmpty
                                                    ? 'Video'
                                                    : img.name,
                                                networkUrl: img.url,
                                              ))
                                          : _showImagePreview(img),
                                      child: ClipRRect(
                                        borderRadius: BorderRadius.circular(6),
                                        child: isVideo
                                            ? Container(
                                                width: 34,
                                                height: 34,
                                                color: Colors.black87,
                                                child: const Icon(
                                                  Icons.play_circle_fill,
                                                  color: Colors.white,
                                                  size: 16,
                                                ),
                                              )
                                            : Image.network(
                                          img.url,
                                          width: 34,
                                          height: 34,
                                          cacheWidth: 96,
                                          fit: BoxFit.cover,
                                          filterQuality: FilterQuality.low,
                                          errorBuilder: (_, __, ___) =>
                                              Container(
                                            width: 34,
                                            height: 34,
                                            color: const Color(0xFFE0E6ED),
                                            child: const Icon(
                                              Icons.broken_image,
                                              size: 14,
                                            ),
                                          ),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ),
                              if (previewImages.isEmpty && preview != null)
                                GestureDetector(
                                  onTap: () =>
                                      MediaPickerHelper.isVideo(preview.url)
                                          ? Get.to(() => VideoPlayerPage(
                                                title: preview.name.isEmpty
                                                    ? 'Video'
                                                    : preview.name,
                                                networkUrl: preview.url,
                                              ))
                                          : _showImagePreview(preview),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(6),
                                    child: MediaPickerHelper.isVideo(
                                            preview.url)
                                        ? Container(
                                            width: 34,
                                            height: 34,
                                            color: Colors.black87,
                                            child: const Icon(
                                              Icons.play_circle_fill,
                                              color: Colors.white,
                                              size: 16,
                                            ),
                                          )
                                        : Image.network(
                                      preview.url,
                                      width: 34,
                                      height: 34,
                                      cacheWidth: 96,
                                      fit: BoxFit.cover,
                                      filterQuality: FilterQuality.low,
                                      errorBuilder: (_, __, ___) => Container(
                                        width: 34,
                                        height: 34,
                                        color: const Color(0xFFE0E6ED),
                                        child: const Icon(
                                          Icons.broken_image,
                                          size: 14,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              if (hiddenImages > 0) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFEAF2FF),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    '+$hiddenImages',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF2d5bba),
                                    ),
                                  ),
                                ),
                              ],
                              if (videoCount > 0) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFEAF2FF),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    '$videoCount video',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF2d5bba),
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: isDone
                            ? const Color(0xFF00b894).withOpacity(0.15)
                            : const Color(0xFFfeca57).withOpacity(0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        isDone ? 'SELESAI' : 'BELUM',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: isDone
                              ? const Color(0xFF00a884)
                              : const Color(0xFFe17055),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Transform.scale(
                      scale: 1.15,
                      child: Checkbox(
                        value: isDone,
                        onChanged: controller.canUpdatePreventivePart
                            ? (value) {
                                controller.togglePartExecutionDone(
                                  index,
                                  value ?? false,
                                );
                              }
                            : null,
                        activeColor: const Color(0xFF00b894),
                        materialTapTargetSize: MaterialTapTargetSize.padded,
                        visualDensity: const VisualDensity(
                          horizontal: -2,
                          vertical: -2,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _buildPartActionIcon(
                          icon: Icons.edit,
                          color: const Color(0xFF00b894),
                          tooltip: 'Detail',
                          enabled: controller.canUpdatePreventivePart,
                          onTap: () {
                            _showEditPartExecutionDialog(index, row);
                          },
                        ),
                        const SizedBox(width: 4),
                        _buildPartActionIcon(
                          icon: Icons.camera_alt,
                          color: const Color(0xFF4C84FF),
                          tooltip: 'Foto/Video',
                          enabled: controller.canUpdatePreventivePart,
                          onTap: () {
                            _showMediaUploadOptions(index, row);
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
            if (videoCount > 0) ...[
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 7,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFF4C84FF).withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$videoCount video eviden',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF4C84FF),
                  ),
                ),
              ),
            ],
            if (row.keterangan.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                'Ket: ${row.keterangan}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  color: Color(0xFF636e72),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPartActionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 16, color: color),
      label: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        side: BorderSide(color: color.withOpacity(0.22)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        visualDensity: VisualDensity.compact,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        minimumSize: Size.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
      ),
    );
  }

  Widget _buildPartActionIcon({
    required IconData icon,
    required Color color,
    required String tooltip,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            color: enabled ? color.withOpacity(0.12) : const Color(0xFFE9EEF5),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            icon,
            size: 16,
            color: enabled ? color : const Color(0xFF98A2B3),
          ),
        ),
      ),
    );
  }

  Widget _buildPartStatPill({
    required String label,
    required String value,
    required Color bgColor,
    required Color textColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: RichText(
        text: TextSpan(
          style: TextStyle(
            fontSize: 11,
            color: textColor,
          ),
          children: [
            TextSpan(text: '$label: '),
            TextSpan(
              text: value,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExecutorsCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Labor/PIC',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Color(0xFF2d3436)),
          ),
          const SizedBox(height: 16),
          Obx(() {
            final executorNames = _getExecutorDisplayNames();
            if (executorNames.isEmpty) {
              return const Text('Tidak ada executor',
                  style: TextStyle(color: Colors.grey));
            }
            return Column(
              children: executorNames.map<Widget>((executorName) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5F7FA),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              executorName,
                              style: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Labor / PIC',
                              style: TextStyle(
                                  fontSize: 12, color: Colors.grey[600]),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildLaborCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Labor',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF2d3436)),
              ),
              IconButton(
                icon: const Icon(Icons.add_circle, color: Color(0xFF00b894)),
                onPressed: controller.canExecute
                    ? () => _showAddLaborDialog(Get.context!)
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Obx(() {
            if (controller.labor.isEmpty) {
              return const Text('Tidak ada labor',
                  style: TextStyle(color: Colors.grey));
            }
            return Column(
              children: controller.labor.map<Widget>((labor) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5F7FA),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              labor.trade,
                              style: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Men: ${labor.men} | Hours: ${labor.hours}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: !controller.canExecute || labor.id.isEmpty
                            ? null
                            : () => controller.removeLabor(labor.id),
                        icon:
                            const Icon(Icons.delete_outline, color: Colors.red),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildMaterialCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Material',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF2d3436)),
              ),
              IconButton(
                icon: const Icon(Icons.add_circle, color: Color(0xFF00b894)),
                tooltip: 'Request Part',
                onPressed: controller.canExecute
                    ? () => _showAddMaterialDialog(Get.context!)
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Obx(() {
            if (controller.materials.isEmpty) {
              return const Text('Tidak ada material',
                  style: TextStyle(color: Colors.grey));
            }
            return Column(
              children: controller.materials.map<Widget>((material) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5F7FA),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              material.material,
                              style: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Qty: ${material.qty} ${material.unit}',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: !controller.canExecute || material.id.isEmpty
                            ? null
                            : () => controller.removeMaterial(material.id),
                        icon:
                            const Icon(Icons.delete_outline, color: Colors.red),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildApprovalsCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Approval History',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Color(0xFF2d3436)),
          ),
          const SizedBox(height: 16),
          Obx(() {
            if (controller.approvals.isEmpty) {
              return const Text('Tidak ada approval history',
                  style: TextStyle(color: Colors.grey));
            }
            return Column(
              children: controller.approvals.map<Widget>((approval) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5F7FA),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 16,
                            backgroundColor: const Color(0xFF00b894),
                            child: Text(
                              _getApprovalDisplayName(approval).isNotEmpty
                                  ? _getApprovalDisplayName(approval)[0]
                                      .toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                  color: Colors.white, fontSize: 14),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _getApprovalDisplayName(approval),
                                  style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600),
                                ),
                                Text(
                                  formatDisplayDateTime(approval.createdAt),
                                  style: TextStyle(
                                      fontSize: 11, color: Colors.grey[600]),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        approval.comment,
                        style: const TextStyle(
                            fontSize: 13, color: Color(0xFF636e72)),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          }),
        ],
      ),
    );
  }

  wo_model.PartImage? _getPreviewImage(wo_model.PreventivePartExecution row) {
    final executionImages = row.executionMedia
        .where((item) => item.mediaType == 'image' && item.url.isNotEmpty)
        .toList();
    if (executionImages.isNotEmpty) return executionImages.first.asPartImage();
    if (row.detailPart.isNotEmpty) return row.detailPart.first;
    if (row.tampakDekat.isNotEmpty) return row.tampakDekat.first;
    if (row.tampakJauh.isNotEmpty) return row.tampakJauh.first;
    return null;
  }

  List<wo_model.PartImage> _collectAllImages(
    wo_model.PreventivePartExecution row,
  ) {
    final executionImages = row.executionMedia
        .where((item) => item.mediaType == 'image' && item.url.isNotEmpty)
        .map((item) => item.asPartImage());

    return <wo_model.PartImage>[
      ...executionImages,
      ...row.detailPart,
      ...row.tampakDekat,
      ...row.tampakJauh,
    ].where((item) => item.url.isNotEmpty).toList();
  }

  String _formatRequestQty(double qty) {
    if (qty == qty.roundToDouble()) {
      return qty.toStringAsFixed(0);
    }
    return qty.toStringAsFixed(2);
  }

  void _showImagePreview(wo_model.PartImage image) {
    if (image.url.isEmpty) return;

    Get.dialog(
      Dialog(
        backgroundColor: Colors.transparent,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            color: Colors.black,
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4,
              child: Image.network(
                image.url,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox(
                  height: 220,
                  child: Center(
                    child: Text(
                      'Gagal memuat gambar',
                      style: TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showEditPartExecutionDialog(
    int index,
    wo_model.PreventivePartExecution row,
  ) {
    final requestPartController = TextEditingController(
      text: row.requestPart.isEmpty ? row.partMesin : row.requestPart,
    );
    final qtyController = TextEditingController(
      text: row.requestQty > 0 ? _formatRequestQty(row.requestQty) : '',
    );
    final uomController = TextEditingController(
      text: row.requestUom.isEmpty ? 'PCS' : row.requestUom,
    );
    final ketController = TextEditingController(text: row.keterangan);
    String maintenanceStatus =
        row.maintenanceStatus == 'DONE' ? 'DONE' : 'PENDING';
    bool isSearchingMaterial = false;
    List<String> materialSuggestions = [];
    bool dialogActive = true;
    bool suppressMaterialChange = false;
    bool requestPartSelectedFromSuggestion =
        requestPartController.text.trim().isNotEmpty;
    int materialSearchToken = 0;

    Get.dialog(
      StatefulBuilder(
        builder: (dialogContext, setState) {
          Future<void> searchMaterialSuggestion(String keyword) async {
            if (!dialogActive || suppressMaterialChange) {
              return;
            }

            final query = keyword.trim();
            if (query.isEmpty) {
              setState(() {
                materialSuggestions = [];
                isSearchingMaterial = false;
              });
              return;
            }

            final currentToken = ++materialSearchToken;
            setState(() {
              isSearchingMaterial = true;
            });

            final suggestions =
                await controller.searchRequestPartSuggestions(query);

            if (!dialogActive || currentToken != materialSearchToken) {
              return;
            }

            setState(() {
              materialSuggestions = suggestions;
              isSearchingMaterial = false;
            });
          }

          Future<void> fillUomFromMaterial(String partName) async {
            final uom = await controller.getRequestPartUom(partName);
            if (!dialogActive) {
              return;
            }
            if (uom != null && uom.isNotEmpty) {
              uomController.text = uom;
            }
          }

          return AlertDialog(
            title: Text(
              row.partMesin.isEmpty ? 'Update Part' : row.partMesin,
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    value: maintenanceStatus,
                    decoration: const InputDecoration(
                      labelText: 'Status Maintenance',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'PENDING',
                        child: Text('BELUM'),
                      ),
                      DropdownMenuItem(
                        value: 'DONE',
                        child: Text('SELESAI'),
                      ),
                    ],
                    onChanged: (value) {
                      setState(() {
                        maintenanceStatus = value ?? 'PENDING';
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: requestPartController,
                    decoration: const InputDecoration(
                      labelText: 'REQUEST PART',
                      border: OutlineInputBorder(),
                      hintText: 'Cari lalu pilih part dari database',
                    ),
                    onChanged: (value) {
                      setState(() {
                        final normalizedValue = value.trim().toLowerCase();
                        final normalizedInitial = row.requestPart.isEmpty
                            ? row.partMesin.trim().toLowerCase()
                            : row.requestPart.trim().toLowerCase();
                        requestPartSelectedFromSuggestion =
                            normalizedValue.isNotEmpty &&
                                normalizedValue == normalizedInitial;
                      });
                      searchMaterialSuggestion(value);
                    },
                  ),
                  if (!requestPartSelectedFromSuggestion &&
                      requestPartController.text.trim().isNotEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Request part harus dipilih dari hasil pencarian.',
                          style: TextStyle(
                            color: Colors.red,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                  if (isSearchingMaterial)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: LinearProgressIndicator(minHeight: 2),
                    ),
                  if (materialSuggestions.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(top: 6),
                      constraints: const BoxConstraints(maxHeight: 140),
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFFDDE3EA)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: materialSuggestions.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, suggestionIndex) {
                          final suggestion =
                              materialSuggestions[suggestionIndex];
                          return ListTile(
                            dense: true,
                            title: Text(
                              suggestion,
                              style: const TextStyle(fontSize: 13),
                            ),
                            onTap: () async {
                              suppressMaterialChange = true;
                              requestPartController.value = TextEditingValue(
                                text: suggestion,
                                selection: TextSelection.collapsed(
                                  offset: suggestion.length,
                                ),
                              );
                              setState(() {
                                materialSuggestions = [];
                                isSearchingMaterial = false;
                                requestPartSelectedFromSuggestion = true;
                              });
                              await fillUomFromMaterial(suggestion);
                              Future.delayed(
                                const Duration(milliseconds: 150),
                                () {
                                  suppressMaterialChange = false;
                                },
                              );
                            },
                          );
                        },
                      ),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: qtyController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: 'Request Qty',
                      border: OutlineInputBorder(),
                      hintText: '0',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: uomController,
                    decoration: const InputDecoration(
                      labelText: 'Request UOM',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Get.back();
                        _showMediaUploadOptions(index, row);
                      },
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Upload Foto/Video Part'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: ketController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Keterangan',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Get.back(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  final selectedPart = requestPartController.text.trim();
                  if (selectedPart.isNotEmpty &&
                      !requestPartSelectedFromSuggestion) {
                    Get.snackbar(
                      'Error',
                      'Pilih request part dari hasil pencarian database',
                    );
                    return;
                  }
                  final qty = double.tryParse(qtyController.text.trim()) ?? 0;
                  final uom = uomController.text.trim().isEmpty
                      ? 'PCS'
                      : uomController.text.trim();

                  controller.updatePartExecutionRow(
                    index,
                    row.copyWith(
                      maintenanceStatus: maintenanceStatus,
                      requestQty: qty < 0 ? 0 : qty,
                      requestPart: selectedPart,
                      requestUom: uom,
                      keterangan: ketController.text.trim(),
                    ),
                  );
                  Get.back();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00b894),
                ),
                child: const Text('Apply'),
              ),
            ],
          );
        },
      ),
    ).whenComplete(() {
      dialogActive = false;
    });
  }

  void _showMediaUploadOptions(
    int index,
    wo_model.PreventivePartExecution row,
  ) {
    final context = Get.context;
    if (context == null) {
      return;
    }

    Future<void> uploadPickedMedia(
      Future<File?> Function() picker,
    ) async {
      final picked = await picker();
      if (picked == null) {
        Get.snackbar(
          'Info',
          'Media tidak dipilih',
          snackPosition: SnackPosition.BOTTOM,
        );
        return;
      }

      final pickedPath = picked.path.toString();
      File finalFile = picked;
      if (MediaPickerHelper.isImage(pickedPath)) {
        final compressed = await MediaPickerHelper.compressImage(picked);
        if (compressed != null) {
          finalFile = compressed;
        }
      }

      await controller.uploadPartExecutionMedia(
          index, finalFile.path.toString());
    }

    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: Text('Ambil Foto - ${row.partMesin}'),
              onTap: () async {
                Get.back();
                await uploadPickedMedia(
                  () => MediaPickerHelper.pickImageFromCamera(),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Pilih Foto Galeri'),
              onTap: () async {
                Get.back();
                await uploadPickedMedia(
                  () => MediaPickerHelper.pickImageFromGallery(),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.videocam),
              title: const Text('Rekam Video'),
              onTap: () async {
                Get.back();
                await uploadPickedMedia(
                  () => MediaPickerHelper.pickVideoFromCamera(),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.video_library),
              title: const Text('Pilih Video Galeri'),
              onTap: () async {
                Get.back();
                await uploadPickedMedia(
                  () => MediaPickerHelper.pickVideoFromGallery(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  void _handleAction(BuildContext context, String action) {
    switch (action) {
      case 'update':
        controller.openUpdatePage();
        break;
      case 'job_explanation':
        _showJobExplanationDialog(context);
        break;
      case 'sub_wo':
        _showSubWoDialog(context);
        break;
      case 'approve':
        _showApproveDialog(context);
        break;
      case 'decline':
        _showDeclineDialog(context);
        break;
      case 'forward':
        _showForwardDialog(context);
        break;
      case 'void':
        _showVoidDialog(context);
        break;
      case 'delete':
        _showDeleteDialog(context);
        break;
    }
  }

  Future<void> _showAddLaborDialog(BuildContext context) async {
    List<String> picOptions = [];
    try {
      picOptions = await controller.getLaborPicOptions();
    } catch (e) {
      Get.snackbar(
        'Warning',
        'Daftar PIC belum bisa dimuat, gunakan input manual',
        snackPosition: SnackPosition.BOTTOM,
      );
    }

    String? selectedPic = picOptions.isNotEmpty ? picOptions.first : null;
    final tradeController = TextEditingController(text: selectedPic ?? '');
    final menController = TextEditingController(text: '1');
    final hoursController = TextEditingController(text: '1');

    List<String> selectedPics = [];

    Get.dialog(
      StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Add Labor'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                /// MULTI SELECT PIC
                if (picOptions.isNotEmpty)
                  MultiSelectDialogField<String>(
                    title: const Text("Pilih PIC"),
                    searchable: true,
                    items: picOptions
                        .map((e) => MultiSelectItem<String>(e, e))
                        .toList(),
                    initialValue: selectedPics,
                    buttonText: const Text("Pilih PIC"),
                    onConfirm: (values) {
                      if (values.length > 10) {
                        Get.snackbar("Warning", "Maksimal 10 user");
                        return;
                      }

                      setState(() {
                        selectedPics = values;
                        tradeController.text = values.join(",");
                      });
                    },
                    chipDisplay: MultiSelectChipDisplay(
                      onTap: (value) {
                        setState(() {
                          selectedPics.remove(value);
                          tradeController.text = selectedPics.join(",");
                        });
                      },
                    ),
                  )
                else
                  TextField(
                    controller: tradeController,
                    decoration: const InputDecoration(
                      labelText: 'PIC',
                      border: OutlineInputBorder(),
                    ),
                  ),

                const SizedBox(height: 12),

                /// MEN & HOURS
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: menController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Men',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: hoursController,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Hours',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),

            /// ACTIONS
            actions: [
              TextButton(
                onPressed: () => Get.back(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  final picRaw = picOptions.isNotEmpty
                      ? selectedPics.join(',')
                      : tradeController.text.trim();

                  final pics = picRaw
                      .split(',')
                      .map((value) => value.trim())
                      .where((value) => value.isNotEmpty)
                      .toSet()
                      .toList();

                  if (pics.isEmpty) {
                    Get.snackbar('Error', 'PIC harus dipilih');
                    return;
                  }
                  if (pics.length > 10) {
                    Get.snackbar('Error', 'Maksimal 10 PIC');
                    return;
                  }

                  final men = int.tryParse(menController.text.trim()) ?? 1;
                  final hours = double.tryParse(
                        hoursController.text.trim().replaceAll(',', '.'),
                      ) ??
                      1;

                  Get.back();

                  controller.addLabor(
                    trade: pics.join(','),
                    men: men,
                    hours: hours,
                  );
                },
                child: const Text('Add'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showAddMaterialDialog(BuildContext context) {
    RequestPartDialog.show(onRequest: controller.requestPart);
  }

  void _showJobExplanationDialog(
    BuildContext context, {
    bool forceComplete = false,
  }) {
    final wo = controller.workOrder.value;
    final now = DateTime.now();
    final defaultDate =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final defaultTime =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    String extractTime(String raw) {
      final value = raw.trim();
      if (value.isEmpty) return defaultTime;
      final source = value.contains(' ') ? value.split(' ').last : value;
      if (source.length >= 5 && source.contains(':')) {
        return source.substring(0, 5);
      }
      return defaultTime;
    }

    final explanationController = TextEditingController(
      text: (wo?.jobExplanation ?? '').trim(),
    );
    final startedPlannerController = TextEditingController(
      text: (wo?.startedPlanner ?? '').split(' ').first.isEmpty
          ? defaultDate
          : (wo?.startedPlanner ?? '').split(' ').first,
    );
    final finishedPlannerController = TextEditingController(
      text: (wo?.finishedPlanner ?? '').split(' ').first.isEmpty
          ? defaultDate
          : (wo?.finishedPlanner ?? '').split(' ').first,
    );
    final startedActualController = TextEditingController(
      text: extractTime(wo?.startedActual ?? ''),
    );
    final finishedActualController = TextEditingController(
      text: extractTime(wo?.finishedActual ?? ''),
    );
    final estimatePlannerController = TextEditingController(
      text: (wo?.estimatePlanner ?? '').trim().isEmpty
          ? '1'
          : (wo?.estimatePlanner ?? '').trim(),
    );
    final List<File> selectedServicePhotos = [];
    const maxServicePhotos = 5;

    String selectedStatus = 'IN_PROGRESS';
    final currentStatus = (wo?.status ?? '').toUpperCase();
    if (currentStatus == 'FORWARD_TO_MESO' ||
        currentStatus == 'FOWARD_TO_MESO') {
      selectedStatus = 'FORWARD_TO_MESO';
    } else if (currentStatus == 'COMPLETE' ||
        currentStatus == 'COMPLETE_EXECUTOR') {
      selectedStatus = 'COMPLETE';
    }

    Get.dialog(
      StatefulBuilder(
        builder: (context, setState) {
          Future<void> pickServicePhotoFromCamera() async {
            final file = await MediaPickerHelper.pickImageFromCamera();
            if (file != null) {
              setState(() {
                if (selectedServicePhotos.length >= maxServicePhotos) {
                  Get.snackbar('Limit', 'Maksimal $maxServicePhotos foto');
                  return;
                }
                selectedServicePhotos.add(file);
              });
            }
          }

          Future<void> pickServicePhotoFromGallery() async {
            final files = await MediaPickerHelper.pickMultiImageFromGallery();
            if (files.isNotEmpty) {
              setState(() {
                final available =
                    maxServicePhotos - selectedServicePhotos.length;
                if (available <= 0) {
                  Get.snackbar('Limit', 'Maksimal $maxServicePhotos foto');
                  return;
                }
                if (files.length > available) {
                  Get.snackbar('Limit',
                      'Maksimal $maxServicePhotos foto (sisanya diabaikan)');
                }
                selectedServicePhotos.addAll(files.take(available));
              });
            }
          }

          void addServiceVideo(File video) {
            if (selectedServicePhotos.length >= maxServicePhotos) {
              Get.snackbar('Limit', 'Maksimal $maxServicePhotos file');
              return;
            }
            setState(() => selectedServicePhotos.add(video));
          }

          Future<void> pickServiceVideoFromCamera() async {
            final video = await MediaPickerHelper.pickVideoFromCamera();
            if (video != null) addServiceVideo(video);
          }

          Future<void> pickServiceVideoFromGallery() async {
            final video = await MediaPickerHelper.pickVideoFromGallery();
            if (video != null) addServiceVideo(video);
          }

          void showServiceVideoOptions() {
            Get.bottomSheet(
              backgroundColor: Colors.white,
              SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ListTile(
                      leading: const Icon(Icons.videocam),
                      title: const Text('Rekam Video'),
                      onTap: () {
                        Get.back();
                        pickServiceVideoFromCamera();
                      },
                    ),
                    ListTile(
                      leading: const Icon(Icons.video_library),
                      title: const Text('Pilih Video Galeri'),
                      onTap: () {
                        Get.back();
                        pickServiceVideoFromGallery();
                      },
                    ),
                  ],
                ),
              ),
            );
          }

          Future<void> pickDate(TextEditingController target) async {
            final picked = await showDatePicker(
              context: context,
              initialDate: DateTime.now(),
              firstDate: DateTime(2020),
              lastDate: DateTime(2035),
            );
            if (picked != null) {
              target.text =
                  '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
            }
          }

          Future<void> pickTime(TextEditingController target) async {
            final picked = await showTimePicker(
              context: context,
              initialTime: TimeOfDay.now(),
            );
            if (picked != null) {
              target.text =
                  '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
            }
          }

          return AlertDialog(
            title: const Text('Job Explanation'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: explanationController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Job Explanation',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: selectedStatus,
                    decoration: const InputDecoration(
                      labelText: 'Status',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'IN_PROGRESS',
                        child: Text('IN PROGRESS'),
                      ),
                      DropdownMenuItem(
                        value: 'COMPLETE',
                        child: Text('COMPLETE'),
                      ),
                      DropdownMenuItem(
                        value: 'FORWARD_TO_MESO',
                        child: Text('Forward to MESO'),
                      ),
                    ],
                    onChanged: (value) {
                      setState(() {
                        selectedStatus = value ?? 'IN_PROGRESS';
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: startedPlannerController,
                    readOnly: true,
                    onTap: () => pickDate(startedPlannerController),
                    decoration: const InputDecoration(
                      labelText: 'Started Planner',
                      border: OutlineInputBorder(),
                      suffixIcon: Icon(Icons.calendar_today),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: startedActualController,
                    readOnly: true,
                    onTap: () => pickTime(startedActualController),
                    decoration: const InputDecoration(
                      labelText: 'Started Actual Time',
                      border: OutlineInputBorder(),
                      suffixIcon: Icon(Icons.access_time),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: finishedPlannerController,
                    readOnly: true,
                    onTap: () => pickDate(finishedPlannerController),
                    decoration: const InputDecoration(
                      labelText: 'Finished Planner',
                      border: OutlineInputBorder(),
                      suffixIcon: Icon(Icons.calendar_today),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: finishedActualController,
                    readOnly: true,
                    onTap: () => pickTime(finishedActualController),
                    decoration: const InputDecoration(
                      labelText: 'Finished Actual Time',
                      border: OutlineInputBorder(),
                      suffixIcon: Icon(Icons.access_time),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: estimatePlannerController,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Estimate Planner (hours)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Bukti Foto/Video Service (Wajib)',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: pickServicePhotoFromCamera,
                          icon: const Icon(Icons.photo_camera),
                          label: const Text('Camera'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: pickServicePhotoFromGallery,
                          icon: const Icon(Icons.photo_library),
                          label: const Text('Gallery'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: showServiceVideoOptions,
                      icon: const Icon(Icons.videocam),
                      label: const Text('Video'),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      '${selectedServicePhotos.length} file dipilih',
                      style: TextStyle(
                        color: selectedServicePhotos.isEmpty
                            ? Colors.red
                            : Colors.green,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  if (selectedServicePhotos.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children:
                          List.generate(selectedServicePhotos.length, (index) {
                        final fileName = selectedServicePhotos[index]
                            .path
                            .split(RegExp(r'[\\/]'))
                            .last;
                        return InputChip(
                          label:
                              Text(fileName, overflow: TextOverflow.ellipsis),
                          onDeleted: () {
                            setState(() {
                              selectedServicePhotos.removeAt(index);
                            });
                          },
                        );
                      }),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Get.back(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  if (selectedServicePhotos.isEmpty) {
                    Get.snackbar(
                      'Error',
                      'Bukti foto/video service wajib diupload',
                      snackPosition: SnackPosition.BOTTOM,
                      backgroundColor: Colors.red,
                      colorText: Colors.white,
                    );
                    return;
                  }
                  Get.back();
                  controller.submitJobExplanation(
                    jobExplanation: explanationController.text,
                    status: selectedStatus,
                    startedPlanner: startedPlannerController.text,
                    startedActualTime: startedActualController.text,
                    finishedPlanner: finishedPlannerController.text,
                    finishedActualTime: finishedActualController.text,
                    estimatePlanner: estimatePlannerController.text,
                    servicePhotoPaths:
                        selectedServicePhotos.map((file) => file.path).toList(),
                  );
                },
                child: const Text('Submit'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showSubWoDialog(BuildContext context) {
    String selectedSubto = 'GA';
    Get.dialog(
      StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Create Sub Work Order'),
            content: DropdownButtonFormField<String>(
              value: selectedSubto,
              decoration: const InputDecoration(
                labelText: 'To Department',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: 'GA',
                  child: Text('General Affairs (GA)'),
                ),
                DropdownMenuItem(
                  value: 'IT',
                  child: Text('Information Technology (IT)'),
                ),
                DropdownMenuItem(
                  value: 'MES',
                  child: Text('MESO (MES)'),
                ),
              ],
              onChanged: (value) {
                setState(() {
                  selectedSubto = value ?? 'GA';
                });
              },
            ),
            actions: [
              TextButton(
                onPressed: () => Get.back(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  Get.back();
                  controller.createSubWo(selectedSubto);
                },
                child: const Text('Create'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showApproveDialog(BuildContext context) {
    final commentController = TextEditingController();
    Get.dialog(
      AlertDialog(
        title: const Text('Approve Work Order'),
        content: TextField(
          controller: commentController,
          decoration: const InputDecoration(
            labelText: 'Comment (Optional)',
            border: OutlineInputBorder(),
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.approveWo(commentController.text);
            },
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00b894)),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
  }

  void _showDeclineDialog(BuildContext context) {
    final commentController = TextEditingController();
    Get.dialog(
      AlertDialog(
        title: const Text('Decline Work Order'),
        content: TextField(
          controller: commentController,
          decoration: const InputDecoration(
            labelText: 'Comment (Required)',
            border: OutlineInputBorder(),
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (commentController.text.isEmpty) {
                Get.snackbar('Error', 'Comment is required');
                return;
              }
              Get.back();
              controller.declineWo(commentController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Decline'),
          ),
        ],
      ),
    );
  }

  void _showForwardDialog(BuildContext context) {
    final commentController = TextEditingController();
    String selectedDivision = '';
    Get.dialog(
      AlertDialog(
        title: const Text('Forward Work Order'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(
                labelText: 'To Division',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'MES', child: Text('MESO')),
              ],
              onChanged: (value) => selectedDivision = value ?? '',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: commentController,
              decoration: const InputDecoration(
                labelText: 'Comment (Optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (selectedDivision.isEmpty) {
                Get.snackbar('Error', 'Please select division');
                return;
              }
              Get.back();
              controller.forwardWo(selectedDivision, commentController.text);
            },
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00b894)),
            child: const Text('Forward'),
          ),
        ],
      ),
    );
  }

  void _showVoidDialog(BuildContext context) {
    final reasonController = TextEditingController();
    Get.dialog(
      AlertDialog(
        title: const Text('Void Document'),
        content: TextField(
          controller: reasonController,
          decoration: const InputDecoration(
            labelText: 'Reason (Required)',
            border: OutlineInputBorder(),
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (reasonController.text.isEmpty) {
                Get.snackbar('Error', 'Reason is required');
                return;
              }
              Get.back();
              controller.voidDocument(reasonController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            child: const Text('Void'),
          ),
        ],
      ),
    );
  }

  void _showVoidPreventiveDialog(BuildContext context) {
    final reasonController = TextEditingController();
    Get.dialog(
      AlertDialog(
        title: const Text('Void WO Preventive'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Hanya WO H-1/terlambat yang belum memiliki progress dapat di-void.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Alasan void (wajib)',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: Get.back,
            child: const Text('Batal'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            onPressed: () {
              final reason = reasonController.text.trim();
              if (reason.isEmpty) {
                Get.snackbar('Error', 'Alasan void wajib diisi');
                return;
              }
              Get.back();
              controller.voidPreventive(reason);
            },
            child: const Text('Void'),
          ),
        ],
      ),
    );
  }

  void _showDeleteDialog(BuildContext context) {
    Get.dialog(
      AlertDialog(
        title: const Text('Delete Work Order'),
        content: const Text('Are you sure you want to delete this work order?'),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.deleteWo();
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}
