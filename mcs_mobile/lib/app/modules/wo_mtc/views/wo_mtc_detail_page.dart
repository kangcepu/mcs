import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../controllers/wo_mtc_detail_controller.dart';
import '../../../data/models/material_request_payload.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/utils/company_label_helper.dart';
import '../../../core/utils/media_picker_helper.dart';
import '../../../core/widgets/video_player_page.dart';
import '../../../core/widgets/wo_material_dialog.dart';
import '../../../data/models/work_order_model.dart' as wo_model;

class WoMtcDetailPage extends StatelessWidget {
  const WoMtcDetailPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(WoMtcDetailController());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Work Order'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: controller.refresh,
          ),
          Obx(() {
            if (controller.canVoid) {
              return PopupMenuButton(
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'void',
                    child: Row(
                      children: [
                        Icon(Icons.cancel, color: Colors.red),
                        SizedBox(width: 8),
                        Text('Void WO'),
                      ],
                    ),
                  ),
                  if (controller.woHeader?.idEquipment != null)
                    const PopupMenuItem(
                      value: 'history',
                      child: Row(
                        children: [
                          Icon(Icons.history),
                          SizedBox(width: 8),
                          Text('Asset History'),
                        ],
                      ),
                    ),
                ],
                onSelected: (value) {
                  if (value == 'void') {
                    _showVoidDialog(context, controller);
                  } else if (value == 'history') {
                    controller.viewAssetHistory();
                  }
                },
              );
            }
            return const SizedBox();
          }),
        ],
      ),
      body: Obx(() {
        if (controller.isLoading.value && controller.woHeader == null) {
          return Center(
            child: SpinKitFadingCircle(
              color: AppColors.primary,
              size: 50,
            ),
          );
        }

        if (controller.woHeader == null) {
          return const Center(
            child: Text('Work Order not found'),
          );
        }

        return Stack(
          children: [
            RefreshIndicator(
              onRefresh: controller.refresh,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.only(bottom: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHeader(controller),
                    _buildTabNavigation(controller),
                    _buildSelectedTabContent(controller),
                    SizedBox(height: controller.hasAnyPermission ? 220 : 80),
                  ],
                ),
              ),
            ),
            if (controller.hasAnyPermission)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: _buildBottomActionPanel(context, controller),
              ),
          ],
        );
      }),
    );
  }

  Widget _buildTabNavigation(WoMtcDetailController controller) {
    final items = const [
      (icon: Icons.description_outlined, label: 'Ringkasan'),
      (icon: Icons.verified_user_outlined, label: 'Preventive'),
      (icon: Icons.inventory_2_outlined, label: 'Resource'),
      (icon: Icons.history, label: 'Riwayat'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Obx(() {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.04),
                blurRadius: 12,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            children: List.generate(items.length, (index) {
              final item = items[index];
              final isActive = controller.selectedDetailTab.value == index;

              return Expanded(
                child: InkWell(
                  onTap: () => controller.setSelectedDetailTab(index),
                  borderRadius: BorderRadius.circular(12),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.fromLTRB(8, 10, 8, 8),
                    decoration: BoxDecoration(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                      border: Border(
                        bottom: BorderSide(
                          color:
                              isActive ? AppColors.primary : Colors.transparent,
                          width: 2.4,
                        ),
                      ),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          item.icon,
                          size: 18,
                          color: isActive
                              ? AppColors.primary
                              : AppColors.textSecondary,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          item.label,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight:
                                isActive ? FontWeight.w700 : FontWeight.w500,
                            color: isActive
                                ? AppColors.primary
                                : AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        );
      }),
    );
  }

  Widget _buildSelectedTabContent(WoMtcDetailController controller) {
    return Obx(() {
      switch (controller.selectedDetailTab.value) {
        case 1:
          return Column(
            children: [
              _buildPreventiveSection(controller),
            ],
          );
        case 2:
          return Column(
            children: [
              _buildResourceActionPanel(controller),
              _buildExecutorsSectionSlim(controller),
              _buildLaborSectionSlim(controller),
              _buildMaterialSectionSlim(controller),
            ],
          );
        case 3:
          return Column(
            children: [
              _buildApprovalSectionSlim(controller),
            ],
          );
        case 0:
        default:
          return Column(
            children: [
              _buildSummaryTab(controller),
            ],
          );
      }
    });
  }

  Widget _buildBottomActionPanel(
    BuildContext context,
    WoMtcDetailController controller,
  ) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildStatusMessage(controller),
            _buildActionButtons(context, controller),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusMessage(WoMtcDetailController controller) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.greyLight,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        'Status: ${controller.getStatusLabel()}',
        style: TextStyle(
          fontSize: 12,
          color: AppColors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildActionButtons(
    BuildContext context,
    WoMtcDetailController controller,
  ) {
    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (controller.canApprove) ...[
              ElevatedButton.icon(
                onPressed: () => _showApproveDialog(context, controller),
                icon: const Icon(Icons.check_circle),
                label: const Text('Approve'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (controller.canExecute) ...[
              ElevatedButton.icon(
                onPressed: () => _showJobExplanationDialog(context, controller),
                icon: const Icon(Icons.description),
                label: const Text('Update Pekerjaan'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _showAddLaborDialog(context, controller),
                      icon: const Icon(Icons.person_add),
                      label: const Text('Labor'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () =>
                          _showAddMaterialDialog(context, controller),
                      icon: const Icon(Icons.inventory),
                      label: const Text('Material'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.purple,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              if (controller.canRequestMaterial) ...[
                const SizedBox(height: 8),
                ElevatedButton.icon(
                  onPressed: () =>
                      _showRequestMaterialDialog(context, controller),
                  icon: const Icon(Icons.shopping_cart),
                  label: const Text('Request Material'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF8C5A00),
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 44),
                  ),
                ),
              ],
            ],
            if (controller.canComplete) ...[
              const SizedBox(height: 8),
              ElevatedButton.icon(
                onPressed: () => _showCompleteDialog(context, controller),
                icon: const Icon(Icons.done_all),
                label: const Text('Selesaikan Pekerjaan'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
            ],
            if (controller.canClose) ...[
              const SizedBox(height: 8),
              ElevatedButton.icon(
                onPressed: () => _showCloseDialog(context, controller),
                icon: const Icon(Icons.close_fullscreen),
                label: const Text('Close WO'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(WoMtcDetailController controller) {
    final wo = controller.woHeader!;
    final rawAssetName = (wo.assetName ?? '').trim();
    final assetName = rawAssetName.isNotEmpty ? rawAssetName : '-';
    final typeLabel = _formatTypeWoLabel(wo.typeWo);
    final priorityLabel =
        (wo.priority ?? '-').trim().isEmpty ? '-' : (wo.priority ?? '-').trim();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
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
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              assetName,
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          if (typeLabel.isNotEmpty) ...[
                            const SizedBox(width: 8),
                            _buildMiniMetaPill(
                              label: typeLabel,
                              backgroundColor: const Color(0xFFEAF2FF),
                              textColor: const Color(0xFF2D5BBA),
                            ),
                          ],
                        ],
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
                        color: controller.getStatusColor().withOpacity(0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        controller.getStatusLabel(),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: controller.getStatusColor(),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.priority_high_rounded,
                          size: 16,
                          color: const Color(0xFFF59E0B),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          priorityLabel,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFFF59E0B),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(
                  Icons.calendar_today_outlined,
                  size: 14,
                  color: AppColors.textSecondary,
                ),
                const SizedBox(width: 6),
                Text(
                  formatDisplayDate(wo.date),
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(width: 12),
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
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildTopMetricTile(
                    icon: Icons.precision_manufacturing_outlined,
                    iconColor: const Color(0xFF22C55E),
                    iconBg: const Color(0xFFE9F9EF),
                    title: 'Asset Name',
                    value: assetName,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _buildTopMetricTile(
                    icon: Icons.timelapse_outlined,
                    iconColor: const Color(0xFF8B5CF6),
                    iconBg: const Color(0xFFF2EAFF),
                    title: 'Running Hours',
                    value: (wo.runningHours ?? '-').trim().isEmpty
                        ? '-'
                        : '${wo.runningHours} Jam',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _buildTopMetricTile(
                    icon: Icons.event_note_outlined,
                    iconColor: const Color(0xFF3B82F6),
                    iconBg: const Color(0xFFEAF2FF),
                    title: 'Schedule',
                    value: typeLabel,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _buildTopMetricTile(
                    icon: Icons.flag_outlined,
                    iconColor: const Color(0xFFF97316),
                    iconBg: const Color(0xFFFFF1E8),
                    title: 'Priority',
                    value: priorityLabel,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryTab(WoMtcDetailController controller) {
    return Column(
      children: [
        _buildJobDetailsOverviewCard(controller),
        _buildSummaryPairRow(
          _buildAttachmentSummaryCard(controller),
          _buildExecutorSummaryCard(controller),
        ),
        _buildSummaryPairRow(
          _buildProgressSummaryCard(controller),
          _buildApprovalSummaryCard(controller),
        ),
        if (controller.isPreventiveWo || controller.preventiveParts.isNotEmpty)
          _buildPreventiveSummaryOverviewCard(controller),
        _buildQuickInfoCard(controller),
      ],
    );
  }

  Widget _buildInfoSection(WoMtcDetailController controller) {
    final wo = controller.woHeader!;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          _buildInfoCard(
            'Asset Information',
            children: [
              _buildInfoRow('Asset Name', wo.assetName ?? '-'),
              _buildInfoRow('Running Hours', wo.runningHours ?? '-'),
            ],
          ),
          const SizedBox(height: 12),
          _buildInfoCard(
            'Job Details',
            children: [
              _buildInfoRow('Job Title', wo.jobTitle, isMultiline: true),
              _buildInfoRow(
                'Job Requirement',
                wo.jobRequirement ?? '-',
                isMultiline: true,
              ),
              if (wo.jobExplanation != null)
                _buildInfoRow(
                  'Job Explanation',
                  wo.jobExplanation!,
                  isMultiline: true,
                ),
            ],
          ),
          if (wo.attachment != null && wo.attachment!.isNotEmpty) ...[
            const SizedBox(height: 12),
            _buildInfoCard(
              'Attachments',
              children: [
                _buildAttachmentList(controller, wo.getAttachments()),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTopMetricTile({
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String value,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE7EDF5)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: iconBg,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: iconColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value.trim().isEmpty ? '-' : value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildJobDetailsOverviewCard(WoMtcDetailController controller) {
    final wo = controller.woHeader!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: _buildDashboardCard(
        title: 'Job Details',
        icon: Icons.description_outlined,
        actionLabel: controller.canExecute ? 'Edit' : null,
        onActionTap: controller.canExecute
            ? () => _showJobExplanationDialog(Get.context!, controller)
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildLabelValue('Job Title', wo.jobTitle),
            const SizedBox(height: 10),
            _buildLabelValue('Job Requirement', wo.jobRequirement ?? '-'),
            if ((wo.jobExplanation ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              _buildLabelValue('Job Explanation', wo.jobExplanation ?? '-'),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryPairRow(Widget left, Widget right) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: left),
          const SizedBox(width: 12),
          Expanded(child: right),
        ],
      ),
    );
  }

  Widget _buildAttachmentSummaryCard(WoMtcDetailController controller) {
    final attachments = controller.woHeader?.getAttachments() ?? [];
    final servicePhotosRaw = controller.detailExtras['service_photos'];
    final servicePhotos =
        servicePhotosRaw is List ? servicePhotosRaw : const [];
    final totalPhotos = servicePhotos.length;

    return _buildDashboardCard(
      title: 'Attachments',
      icon: Icons.attach_file,
      actionLabel: totalPhotos > 0 ? '$totalPhotos Foto' : null,
      child: attachments.isEmpty && totalPhotos == 0
          ? _buildEmptyMiniState('Belum ada lampiran')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (totalPhotos > 0) ...[
                  _buildServicePhotoPreview(controller),
                  const SizedBox(height: 8),
                ],
                if (attachments.isNotEmpty)
                  Text(
                    attachments.first,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _buildExecutorSummaryCard(WoMtcDetailController controller) {
    final executor =
        controller.executors.isNotEmpty ? controller.executors.first : null;
    return _buildDashboardCard(
      title: 'Executors',
      icon: Icons.groups_outlined,
      actionLabel: controller.canExecute ? 'Edit' : null,
      onActionTap: controller.canExecute
          ? () => _showJobExplanationDialog(Get.context!, controller)
          : null,
      child: executor == null
          ? _buildEmptyMiniState('Belum ada executor')
          : Container(
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
                      executor.jobExecutor,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildProgressSummaryCard(WoMtcDetailController controller) {
    final progress = _calculateProgressValue(controller);
    return _buildDashboardCard(
      title: 'Progress',
      icon: Icons.pie_chart_outline,
      child: Row(
        children: [
          SizedBox(
            width: 64,
            height: 64,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: progress / 100,
                  strokeWidth: 6,
                  backgroundColor: const Color(0xFFE5EAF1),
                  valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
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
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Progress Pekerjaan',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${progress.round()}%',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _buildLatestUpdateText(controller),
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildApprovalSummaryCard(WoMtcDetailController controller) {
    final latest = controller.approvalHistory.isNotEmpty
        ? controller.approvalHistory.last
        : null;
    return _buildDashboardCard(
      title: 'Approval History',
      icon: Icons.history_toggle_off,
      actionLabel: controller.approvalHistory.length > 1 ? 'Lihat semua' : null,
      onActionTap: controller.approvalHistory.length > 1
          ? () => controller.setSelectedDetailTab(3)
          : null,
      child: latest == null
          ? _buildEmptyMiniState('Belum ada approval')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        latest.fullname,
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
                _buildMiniMetaPill(
                  label: 'APPROVED',
                  backgroundColor: const Color(0xFFE6F9F2),
                  textColor: const Color(0xFF0F9D58),
                ),
              ],
            ),
    );
  }

  Widget _buildPreventiveSummaryOverviewCard(WoMtcDetailController controller) {
    final parts = controller.preventiveParts;
    final total = parts.length;
    final done = parts.where((item) => item.maintenanceStatus == 'DONE').length;
    final progress = total == 0 ? 0.0 : (done / total) * 100;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: _buildDashboardCard(
        title: 'Preventive Summary',
        icon: Icons.verified_user_outlined,
        actionLabel: 'Lihat semua',
        onActionTap: () => controller.setSelectedDetailTab(1),
        child: total == 0
            ? _buildEmptyMiniState('Part preventive belum tersedia')
            : Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFF4FFFB), Color(0xFFF8FAFC)],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE0F2EA)),
                ),
                child: Row(
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
                              _buildMiniMetaPill(
                                label: 'Selesai $done',
                                backgroundColor: const Color(0xFFE6F9F2),
                                textColor: const Color(0xFF0F9D58),
                              ),
                              _buildMiniMetaPill(
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
              ),
      ),
    );
  }

  Widget _buildQuickInfoCard(WoMtcDetailController controller) {
    final photoCountRaw = controller.detailExtras['service_photos'];
    final photoCount = photoCountRaw is List ? photoCountRaw.length : 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: _buildDashboardCard(
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
                value: '${controller.material.length} item',
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
      ),
    );
  }

  Widget _buildQuickInfoItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
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

  Widget _buildDashboardCard({
    required String title,
    IconData? icon,
    String? actionLabel,
    VoidCallback? onActionTap,
    required Widget child,
  }) {
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
          Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
              ],
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
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _buildResourceActionPanel(WoMtcDetailController controller) {
    if (!controller.canExecute &&
        !controller.canRequestMaterial &&
        !controller.canComplete &&
        !controller.canClose) {
      return const SizedBox();
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: _buildDashboardCard(
        title: 'Aksi Cepat',
        icon: Icons.tune,
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
                      onTap: () =>
                          _showJobExplanationDialog(Get.context!, controller),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Labor / PIC',
                      icon: Icons.groups_2_outlined,
                      backgroundColor: const Color(0xFFF59E0B),
                      onTap: () =>
                          _showAddLaborDialog(Get.context!, controller),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Material',
                      icon: Icons.inventory_2_outlined,
                      backgroundColor: const Color(0xFF9333EA),
                      onTap: () =>
                          _showAddMaterialDialog(Get.context!, controller),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildQuickActionButton(
                      label: controller.canRequestMaterial
                          ? 'Request Material'
                          : 'Selesaikan WO',
                      icon: controller.canRequestMaterial
                          ? Icons.shopping_cart_outlined
                          : Icons.done_all,
                      backgroundColor: controller.canRequestMaterial
                          ? const Color(0xFF8C5A00)
                          : const Color(0xFF2563EB),
                      onTap: () {
                        if (controller.canRequestMaterial) {
                          _showRequestMaterialDialog(Get.context!, controller);
                        } else if (controller.canComplete) {
                          _showCompleteDialog(Get.context!, controller);
                        }
                      },
                    ),
                  ),
                ],
              ),
            ] else if (controller.canComplete || controller.canClose) ...[
              Row(
                children: [
                  if (controller.canComplete)
                    Expanded(
                      child: _buildQuickActionButton(
                        label: 'Selesaikan WO',
                        icon: Icons.done_all,
                        backgroundColor: const Color(0xFF2563EB),
                        onTap: () =>
                            _showCompleteDialog(Get.context!, controller),
                      ),
                    ),
                  if (controller.canComplete && controller.canClose)
                    const SizedBox(width: 10),
                  if (controller.canClose)
                    Expanded(
                      child: _buildQuickActionButton(
                        label: 'Close WO',
                        icon: Icons.close_fullscreen,
                        backgroundColor: const Color(0xFFDC2626),
                        onTap: () => _showCloseDialog(Get.context!, controller),
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

  Widget _buildLabelValue(String label, String value) {
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
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildServicePhotoPreview(WoMtcDetailController controller) {
    final raw = controller.detailExtras['service_photos'];
    if (raw is! List || raw.isEmpty) {
      return _buildEmptyMiniState('Belum ada foto');
    }
    final items = raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((e) => (e['url'] ?? '').toString().trim().isNotEmpty)
        .toList(growable: false);
    if (items.isEmpty) {
      return _buildEmptyMiniState('Belum ada foto');
    }

    final previewUrl = ApiConstants.mediaUrl(items.first['url']?.toString());
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: AspectRatio(
        aspectRatio: 1.25,
        child: MediaPickerHelper.isVideo(previewUrl)
            ? Container(
                color: Colors.black87,
                child: const Center(
                  child: Icon(Icons.play_circle_fill,
                      color: Colors.white, size: 32),
                ),
              )
            : Image.network(
                previewUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: const Color(0xFFF3F6FA),
                  child: const Center(child: Icon(Icons.broken_image)),
                ),
              ),
      ),
    );
  }

  Widget _buildEmptyMiniState(String label) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }

  double _calculateProgressValue(WoMtcDetailController controller) {
    final status = (controller.woHeader?.status ?? '').toUpperCase();
    if (controller.isPreventiveWo && controller.preventiveParts.isNotEmpty) {
      final total = controller.preventiveParts.length;
      if (total == 0) return 0;
      final done = controller.preventiveParts
          .where((item) => item.maintenanceStatus.toUpperCase() == 'DONE')
          .length;
      return (done / total) * 100;
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

  String _buildLatestUpdateText(WoMtcDetailController controller) {
    if (controller.approvalHistory.isNotEmpty) {
      return 'Terakhir update ${formatDisplayDateTime(controller.approvalHistory.last.createdAt)}';
    }
    if ((controller.woHeader?.updatedAt ?? '').trim().isNotEmpty) {
      return 'Terakhir update ${formatDisplayDateTime(controller.woHeader?.updatedAt)}';
    }
    return 'Belum ada update';
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
        if (raw.trim().isEmpty) return '-';
        return raw;
    }
  }

  Widget _buildServicePhotosSection(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Obx(() {
        final raw = controller.detailExtras['service_photos'];
        if (raw is! List || raw.isEmpty) return const SizedBox();

        final items = raw
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .where((e) => (e['url'] ?? '').toString().trim().isNotEmpty)
            .toList(growable: false);

        if (items.isEmpty) return const SizedBox();

        return _buildInfoCard(
          'Bukti Foto/Video Service (${items.length})',
          children: [
            SizedBox(
              height: 110,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final url =
                      ApiConstants.mediaUrl(items[index]['url']?.toString());
                  final isVideo = MediaPickerHelper.isVideo(url);
                  return InkWell(
                    onTap: () => isVideo
                        ? Get.to(() => VideoPlayerPage(
                              title: items[index]['name']?.toString() ??
                                  'Video',
                              networkUrl: url,
                            ))
                        : _showImagePreview(url),
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
                                url,
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
        );
      }),
    );
  }

  Widget _buildPreventiveSection(WoMtcDetailController controller) {
    return Obx(() {
      if (!controller.isPreventiveWo && controller.preventiveParts.isEmpty) {
        return const SizedBox();
      }

      final parts = controller.preventiveParts.toList(growable: false);
      final totalParts = parts.length;
      final doneParts = parts
          .where((item) => item.maintenanceStatus.toUpperCase() == 'DONE')
          .length;
      final scheduleGroups =
          <String, List<MapEntry<int, wo_model.PreventivePartExecution>>>{};
      for (final entry in parts.asMap().entries) {
        final label = entry.value.tipeJadwal.trim().isEmpty
            ? 'Part MTC'
            : entry.value.tipeJadwal.trim();
        scheduleGroups.putIfAbsent(label, () => []).add(entry);
      }

      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Container(
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
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  const Text('Part MTC',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF2D3436))),
                  const SizedBox(width: 10),
                  _buildPreventiveStatChip(
                      label: 'Total Part',
                      value: '$totalParts',
                      backgroundColor: const Color(0xFFEAF2FF),
                      textColor: const Color(0xFF2D5BBA)),
                  const SizedBox(width: 8),
                  _buildPreventiveStatChip(
                      label: 'Selesai',
                      value: '$doneParts',
                      backgroundColor: const Color(0xFFE6F9F2),
                      textColor: const Color(0xFF0F9D58)),
                  const SizedBox(width: 8),
                  _buildPreventiveStatChip(
                      label: 'Belum',
                      value: '${totalParts - doneParts}',
                      backgroundColor: const Color(0xFFFFF2E6),
                      textColor: const Color(0xFFE17055)),
                  if (controller.isPartExecutionDirty.value) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                          color: const Color(0xFFFECA57).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12)),
                      child: const Text('Belum disimpan',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFFE17055))),
                    ),
                  ],
                ])),
            const SizedBox(height: 10),
            const Text('Ceklis jika part sudah selesai dikerjakan.',
                style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF636E72))),
            const SizedBox(height: 10),
            if (totalParts == 0)
              _buildCompactEmptyState('Part preventive belum tersedia')
            else ...[
              ...scheduleGroups.entries.map((group) =>
                  _buildPreventiveScheduleGroup(
                      controller, group.key, group.value)),
              if (controller.canUpdatePreventivePart) ...[
                const SizedBox(height: 4),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: controller.isProcessing.value
                        ? null
                        : controller.savePartExecution,
                    icon: const Icon(Icons.save_outlined, size: 18),
                    label: Text(controller.isProcessing.value
                        ? 'Menyimpan...'
                        : 'Simpan Sementara Part'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00B894),
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ],
          ]),
        ),
      );
    });
  }

  Widget _buildPreventiveScheduleGroup(
    WoMtcDetailController controller,
    String label,
    List<MapEntry<int, wo_model.PreventivePartExecution>> entries,
  ) {
    final done = entries
        .where((entry) => entry.value.maintenanceStatus == 'DONE')
        .length;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFFDFEFF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE1E9F1)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          _buildMiniMetaPill(
              label: label,
              backgroundColor: const Color(0xFFE6F9F2),
              textColor: const Color(0xFF00A884)),
          const SizedBox(width: 8),
          Text('$done/${entries.length} selesai',
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF5F6B7A))),
        ]),
        const SizedBox(height: 10),
        ...entries.map((entry) =>
            _buildPreventivePartTile(controller, entry.key, entry.value)),
      ]),
    );
  }

  Widget _buildPreventiveStatChip({
    required String label,
    required String value,
    required Color backgroundColor,
    required Color textColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: textColor,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPreventivePartTile(
    WoMtcDetailController controller,
    int index,
    wo_model.PreventivePartExecution part,
  ) {
    final title =
        part.partMesin.trim().isNotEmpty ? part.partMesin.trim() : '-';
    final section = part.bagianMesin.trim();
    final condition = part.kondisi.trim();
    final schedule = part.tipeJadwal.trim();
    final pic = part.pic.trim();
    final isDone = part.maintenanceStatus.toUpperCase() == 'DONE';
    final thumbnails = <wo_model.PartImage>[
      ...part.executionMedia
          .where((media) => media.mediaType == 'image')
          .map((media) => media.asPartImage()),
      ...part.detailPart,
      ...part.tampakDekat,
      ...part.tampakJauh,
    ].where((image) => image.url.trim().isNotEmpty).take(3).toList();

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(10, 9, 10, 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFDDE6F0)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (schedule.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  _buildMiniMetaPill(
                    label: schedule,
                    backgroundColor: const Color(0xFFE6F9F2),
                    textColor: const Color(0xFF00A884),
                  ),
                ],
              ],
            ),
            if (condition.isNotEmpty && condition != title) ...[
              const SizedBox(height: 5),
              Text(condition,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 12,
                      height: 1.35,
                      color: AppColors.textSecondary)),
            ],
            if (section.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(
                section,
                style: TextStyle(
                  fontSize: 11,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
            if (pic.isNotEmpty) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (pic.isNotEmpty)
                    _buildMiniMetaPill(
                      label: 'PIC $pic',
                      backgroundColor: const Color(0xFFEFF6FF),
                      textColor: const Color(0xFF2563EB),
                    ),
                ],
              ),
            ],
            if (part.requestPart.trim().isNotEmpty ||
                part.requestQty > 0 ||
                part.keterangan.trim().isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(
                'Req: ${part.requestPart.isEmpty ? title : part.requestPart} | ${part.requestQty} ${part.requestUom}',
                style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
            ],
            if (thumbnails.isNotEmpty ||
                controller.canUpdatePreventivePart) ...[
              const SizedBox(height: 6),
              Row(children: [
                Expanded(
                    child: SizedBox(
                        height: 42,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: thumbnails.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 6),
                          itemBuilder: (_, imageIndex) => GestureDetector(
                            onTap: () =>
                                _showImagePreview(thumbnails[imageIndex].url),
                            child: ClipRRect(
                                borderRadius: BorderRadius.circular(7),
                                child: Image.network(
                                  thumbnails[imageIndex].url,
                                  width: 42,
                                  height: 42,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) =>
                                      const SizedBox(width: 42, height: 42),
                                )),
                          ),
                        ))),
              ]),
            ],
          ]),
        ),
        const SizedBox(width: 4),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: isDone
                  ? const Color(0xFF00B894).withOpacity(0.15)
                  : const Color(0xFFFECA57).withOpacity(0.2),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(isDone ? 'SELESAI' : 'BELUM',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: isDone
                      ? const Color(0xFF00A884)
                      : const Color(0xFFE17055),
                )),
          ),
          const SizedBox(height: 6),
          Transform.scale(
            scale: 1.15,
            child: Checkbox(
              value: isDone,
              activeColor: const Color(0xFF00B894),
              materialTapTargetSize: MaterialTapTargetSize.padded,
              visualDensity: const VisualDensity(horizontal: -2, vertical: -2),
              onChanged: controller.canUpdatePreventivePart
                  ? (value) =>
                      controller.togglePartExecutionDone(index, value ?? false)
                  : null,
            ),
          ),
          const SizedBox(height: 6),
          if (controller.canUpdatePreventivePart)
            Row(children: [
              _buildPreventiveIconButton(Icons.edit, const Color(0xFF00B894),
                  () => _showEditPreventivePartDialog(controller, index, part)),
              const SizedBox(width: 4),
              _buildPreventiveIconButton(
                  Icons.camera_alt,
                  const Color(0xFF4C84FF),
                  () => _showPartMediaUploadOptions(controller, index)),
            ]),
        ]),
      ]),
    );
  }

  Widget _buildPreventiveIconButton(
      IconData icon, Color color, VoidCallback onTap) {
    return Material(
      color: color.withOpacity(0.12),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
            width: 36, height: 36, child: Icon(icon, size: 18, color: color)),
      ),
    );
  }

  void _showEditPreventivePartDialog(
    WoMtcDetailController controller,
    int index,
    wo_model.PreventivePartExecution row,
  ) {
    final note = TextEditingController(text: row.keterangan);
    final requestPart = TextEditingController(text: row.requestPart);
    final qty = TextEditingController(
        text: row.requestQty > 0 ? '${row.requestQty}' : '');
    final uom = TextEditingController(text: row.requestUom);
    Get.dialog(AlertDialog(
      title: Text(row.partMesin.isEmpty ? 'Detail Part' : row.partMesin),
      content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(
            controller: requestPart,
            decoration: const InputDecoration(labelText: 'Request part')),
        TextField(
            controller: qty,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Qty request')),
        TextField(
            controller: uom,
            decoration: const InputDecoration(labelText: 'UOM')),
        TextField(
            controller: note,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Keterangan')),
      ])),
      actions: [
        TextButton(onPressed: Get.back, child: const Text('Batal')),
        ElevatedButton(
            onPressed: () {
              controller.updatePartExecutionRow(
                  index,
                  row.copyWith(
                    requestPart: requestPart.text.trim(),
                    requestQty: double.tryParse(qty.text.trim()) ?? 0,
                    requestUom:
                        uom.text.trim().isEmpty ? 'PCS' : uom.text.trim(),
                    keterangan: note.text.trim(),
                  ));
              Get.back();
            },
            child: const Text('Simpan')),
      ],
    ));
  }

  void _showPartMediaUploadOptions(
      WoMtcDetailController controller, int index) {
    Get.bottomSheet(SafeArea(
        child: Wrap(children: [
      ListTile(
          leading: const Icon(Icons.camera_alt),
          title: const Text('Ambil foto'),
          onTap: () async {
            Get.back();
            final file = await MediaPickerHelper.pickImageFromCamera();
            if (file != null)
              controller.uploadPartExecutionMedia(index, file.path);
          }),
      ListTile(
          leading: const Icon(Icons.photo_library),
          title: const Text('Pilih foto'),
          onTap: () async {
            Get.back();
            final file = await MediaPickerHelper.pickImageFromGallery();
            if (file != null)
              controller.uploadPartExecutionMedia(index, file.path);
          }),
      ListTile(
          leading: const Icon(Icons.videocam),
          title: const Text('Pilih/rekam video'),
          onTap: () async {
            Get.back();
            final file = await MediaPickerHelper.pickVideoFromGallery();
            if (file != null)
              controller.uploadPartExecutionMedia(index, file.path);
          }),
    ])));
  }

  Widget _buildMiniMetaPill({
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

  void _showImagePreview(String url) {
    final safeUrl = url.trim();
    if (safeUrl.isEmpty) return;

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
                safeUrl,
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

  Widget _buildExecutorsSection(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Obx(() {
        if (controller.executors.isEmpty) {
          return _buildSlimSection(
            title: 'Executors',
            child: _buildCompactMeta('Tidak ada executor'),
          );
        }

        final executor = controller.executors.first;
        final isMyExecutor =
            executor.jobExecutor == controller.userDivisionCode.value;

        return _buildSlimSection(
          title: 'Executors',
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: isMyExecutor ? AppColors.primary : AppColors.grey,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      executor.jobExecutor,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      executor.status,
                      style: TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      }),
    );
  }

  Widget _buildLaborSection(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: _buildInfoCard(
        'Labor',
        dense: true,
        trailing: controller.canAddLabor
            ? _buildSectionAction(
                icon: Icons.add,
                onTap: () => _showAddLaborDialog(Get.context!, controller),
              )
            : null,
        children: [
          Obx(() {
            if (controller.labor.isEmpty) {
              return _buildCompactEmptyState('Tidak ada labor');
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 8),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Total Man-Hours',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '${controller.getTotalManHours().toStringAsFixed(1)} hrs',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                ),
                ...controller.labor.map((labor) => Card(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: ListTile(
                        dense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 0,
                        ),
                        title: Text(labor.trade),
                        subtitle:
                            Text('${labor.men} men Ã— ${labor.hours} hrs'),
                        trailing: controller.canAddLabor
                            ? IconButton(
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(),
                                icon: const Icon(
                                  Icons.delete,
                                  color: Colors.red,
                                  size: 18,
                                ),
                                onPressed: () =>
                                    _confirmRemoveLabor(controller, labor),
                              )
                            : Text(
                                '${labor.getTotalManHours()} hrs',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                      ),
                    )),
              ],
            );
          }),
        ],
      ),
    );
  }

  Widget _buildMaterialSection(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: _buildInfoCard(
        'Material',
        dense: true,
        trailing: controller.canAddMaterial
            ? _buildSectionAction(
                icon: Icons.add,
                onTap: () => _showAddMaterialDialog(Get.context!, controller),
              )
            : null,
        children: [
          Obx(() {
            final hasManual = controller.material.isNotEmpty;
            final hasRequestReceive = controller.materialRequests.isNotEmpty;

            if (!hasManual && !hasRequestReceive) {
              return _buildCompactEmptyState('Tidak ada material');
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (hasManual) ...[
                  const Padding(
                    padding: EdgeInsets.only(bottom: 6),
                    child: Text(
                      'Material Usage',
                      style:
                          TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                    ),
                  ),
                  ...controller.material.map((material) {
                    return Card(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: ListTile(
                        dense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 0,
                        ),
                        title: Text(material.material),
                        subtitle: Text(
                          'PR: ${material.pr ?? '-'}',
                          style: const TextStyle(fontSize: 11),
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${material.qty} ${material.unit}',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (controller.canAddMaterial)
                              IconButton(
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(),
                                icon: const Icon(Icons.delete,
                                    color: Colors.red, size: 18),
                                onPressed: () => _confirmRemoveMaterial(
                                    controller, material),
                              ),
                          ],
                        ),
                      ),
                    );
                  }),
                ],
                if (hasRequestReceive) ...[
                  const SizedBox(height: 2),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 6),
                    child: Text(
                      'Material Request / Receive',
                      style:
                          TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                    ),
                  ),
                  ...controller.materialRequests.map((req) {
                    final receiveQty = req.materialReceive ?? 0;
                    final receiveUom =
                        (req.uomReceive ?? req.uomRequest).trim();
                    return Card(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: ListTile(
                        dense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 2,
                        ),
                        title: Text(req.part.isEmpty ? '-' : req.part),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 1),
                            Text(
                              'Request: ${req.materialRequest} ${req.uomRequest}',
                              style: const TextStyle(fontSize: 11),
                            ),
                            Text(
                              'Receive: $receiveQty ${receiveUom.isEmpty ? req.uomRequest : receiveUom}',
                              style: const TextStyle(fontSize: 11),
                            ),
                            if ((req.requestCode).trim().isNotEmpty)
                              Text(
                                'Code: ${req.requestCode}',
                                style: const TextStyle(fontSize: 11),
                              ),
                          ],
                        ),
                        isThreeLine: true,
                        trailing: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: req.isReceived
                                ? Colors.green.withOpacity(0.12)
                                : Colors.orange.withOpacity(0.16),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            req.isReceived ? 'RECEIVED' : 'PENDING',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color:
                                  req.isReceived ? Colors.green : Colors.orange,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ],
              ],
            );
          }),
        ],
      ),
    );
  }

  Widget _buildApprovalSection(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
      child: _buildInfoCard(
        'Approval History',
        dense: true,
        children: [
          Obx(() {
            if (controller.approvalHistory.isEmpty) {
              return _buildCompactEmptyState('Tidak ada approval history');
            }

            return Column(
              children: controller.approvalHistory.map((approval) {
                return Card(
                  margin: const EdgeInsets.only(bottom: 6),
                  child: ListTile(
                    dense: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 2,
                    ),
                    leading: CircleAvatar(
                      radius: 16,
                      backgroundImage:
                          approval.avatar != null && approval.avatar!.isNotEmpty
                              ? NetworkImage(
                                  ApiConstants.getAvatarUrl(approval.avatar))
                              : null,
                      child: approval.avatar == null || approval.avatar!.isEmpty
                          ? Text(approval.fullname[0])
                          : null,
                    ),
                    title: Text(approval.fullname),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          approval.comment,
                          style: const TextStyle(fontSize: 11),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          formatDisplayDateTime(approval.createdAt),
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    isThreeLine: true,
                  ),
                );
              }).toList(),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildExecutorsSectionSlim(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Obx(() {
        if (controller.executors.isEmpty) {
          return _buildSlimSection(
            title: 'Executors',
            child: _buildSlimBodyBox(
              child: _buildCompactMeta('Tidak ada executor'),
            ),
          );
        }

        final executor = controller.executors.first;
        final isMyExecutor =
            executor.jobExecutor == controller.userDivisionCode.value;

        return _buildSlimSection(
          title: 'Executors',
          child: _buildSlimBodyBox(
            child: Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: isMyExecutor ? AppColors.primary : AppColors.grey,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${executor.jobExecutor}  •  ${executor.status}',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }

  Widget _buildLaborSectionSlim(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Obx(() {
        if (controller.labor.isEmpty) {
          return _buildSlimSection(
            title: 'Labor',
            trailing: controller.canAddLabor
                ? _buildSectionAction(
                    icon: Icons.add,
                    onTap: () => _showAddLaborDialog(Get.context!, controller),
                  )
                : null,
            child: _buildSlimBodyBox(
              isCentered: true,
              child: _buildCompactMeta('Tidak ada labor'),
            ),
          );
        }

        final labor = controller.labor.first;
        return _buildSlimSection(
          title: 'Labor',
          trailing: controller.canAddLabor
              ? _buildSectionAction(
                  icon: Icons.add,
                  onTap: () => _showAddLaborDialog(Get.context!, controller),
                )
              : null,
          child: _buildSlimBodyBox(
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    labor.trade,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${labor.men} x ${labor.hours}h',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }

  Widget _buildMaterialSectionSlim(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Obx(() {
        final hasManual = controller.material.isNotEmpty;
        final hasRequestReceive = controller.materialRequests.isNotEmpty;

        if (!hasManual && !hasRequestReceive) {
          return _buildSlimSection(
            title: 'Material',
            trailing: controller.canAddMaterial
                ? _buildSectionAction(
                    icon: Icons.add,
                    onTap: () =>
                        _showAddMaterialDialog(Get.context!, controller),
                  )
                : null,
            child: _buildSlimBodyBox(
              isCentered: true,
              child: _buildCompactMeta('Tidak ada material'),
            ),
          );
        }

        final label = hasManual
            ? controller.material.first.material
            : controller.materialRequests.first.part;
        final qty = hasManual
            ? '${controller.material.first.qty} ${controller.material.first.unit}'
            : '${controller.materialRequests.first.materialRequest} ${controller.materialRequests.first.uomRequest}';

        return _buildSlimSection(
          title: 'Material',
          trailing: controller.canAddMaterial
              ? _buildSectionAction(
                  icon: Icons.add,
                  onTap: () => _showAddMaterialDialog(Get.context!, controller),
                )
              : null,
          child: _buildSlimBodyBox(
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label.isEmpty ? '-' : label,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  qty,
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }

  Widget _buildApprovalSectionSlim(WoMtcDetailController controller) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 84),
      child: Obx(() {
        if (controller.approvalHistory.isEmpty) {
          return _buildSlimSection(
            title: 'Approval History',
            child: _buildSlimBodyBox(
              isCentered: true,
              child: _buildCompactMeta('Tidak ada approval history'),
            ),
          );
        }

        final approval = controller.approvalHistory.last;
        return _buildSlimSection(
          title: 'Approval History',
          child: _buildSlimBodyBox(
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    approval.fullname,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  formatDisplayDateTime(approval.createdAt),
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }

  Widget _buildInfoTab(WoMtcDetailController controller) {
    final wo = controller.woHeader!;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _buildInfoCard(
          'Work Order Information',
          children: [
            _buildInfoRow('WO Number', wo.woNumber),
            _buildInfoRow('Date', formatDisplayDate(wo.date)),
            _buildInfoRow('Company', shortCompanyLabel(wo.company)),
            _buildInfoRow('Shift', wo.shift ?? '-'),
            _buildInfoRow('Type', wo.typeWo),
            _buildInfoRow('Priority', wo.priority ?? '-'),
            _buildInfoRow('Status', controller.getStatusLabel()),
            _buildInfoRow('Division', wo.divisionName ?? '-'),
            _buildInfoRow('Creator', wo.creator ?? '-'),
          ],
        ),
        const SizedBox(height: 16),
        _buildInfoCard(
          'Asset Information',
          children: [
            _buildInfoRow('Asset Name', wo.assetName ?? '-'),
            _buildInfoRow('Running Hours', wo.runningHours ?? '-'),
          ],
        ),
        const SizedBox(height: 16),
        _buildInfoCard(
          'Job Details',
          children: [
            _buildInfoRow('Job Title', wo.jobTitle, isMultiline: true),
            _buildInfoRow('Job Requirement', wo.jobRequirement ?? '-',
                isMultiline: true),
            if (wo.jobExplanation != null)
              _buildInfoRow('Job Explanation', wo.jobExplanation!,
                  isMultiline: true),
          ],
        ),
        if (wo.attachment != null && wo.attachment!.isNotEmpty) ...[
          const SizedBox(height: 16),
          _buildInfoCard(
            'Attachments',
            children: [
              _buildAttachmentList(controller, wo.getAttachments()),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildExecutorTab(WoMtcDetailController controller) {
    return Obx(() {
      if (controller.executors.isEmpty) {
        return const Center(
          child: Text('No executors assigned'),
        );
      }

      return ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: controller.executors.length,
        itemBuilder: (context, index) {
          final executor = controller.executors[index];
          final isMyExecutor =
              executor.jobExecutor == controller.userDivisionCode.value;

          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            color: isMyExecutor ? AppColors.primary.withOpacity(0.05) : null,
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor:
                    isMyExecutor ? AppColors.primary : AppColors.grey,
                child: Text(
                  executor.jobExecutor.substring(0, 2),
                  style: const TextStyle(color: Colors.white),
                ),
              ),
              title: Text(
                executor.jobExecutor,
                style: TextStyle(
                  fontWeight:
                      isMyExecutor ? FontWeight.bold : FontWeight.normal,
                ),
              ),
              subtitle: Text(executor.jobExplanation ?? 'No explanation yet'),
              trailing: Chip(
                label: Text(executor.status),
                backgroundColor: _getExecutorStatusColor(executor.status),
              ),
            ),
          );
        },
      );
    });
  }

  Widget _buildLaborTab(WoMtcDetailController controller) {
    return Obx(() {
      return Column(
        children: [
          if (controller.labor.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Card(
                color: AppColors.primary.withOpacity(0.1),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Total Man-Hours',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '${controller.getTotalManHours().toStringAsFixed(1)} hrs',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          Expanded(
            child: controller.labor.isEmpty
                ? const Center(child: Text('No labor records'))
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                    itemCount: controller.labor.length,
                    itemBuilder: (context, index) {
                      final labor = controller.labor[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: ListTile(
                          title: Text(labor.trade),
                          subtitle:
                              Text('${labor.men} men Ã— ${labor.hours} hrs'),
                          trailing: controller.canAddLabor
                              ? IconButton(
                                  icon: const Icon(Icons.delete,
                                      color: Colors.red),
                                  onPressed: () =>
                                      _confirmRemoveLabor(controller, labor),
                                )
                              : Text(
                                  '${labor.getTotalManHours()} hrs',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      );
    });
  }

  Widget _buildMaterialTab(WoMtcDetailController controller) {
    return Obx(() {
      if (controller.material.isEmpty) {
        return const Center(
          child: Text('No material records'),
        );
      }

      return ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
        itemCount: controller.material.length,
        itemBuilder: (context, index) {
          final material = controller.material[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              title: Text(material.material),
              subtitle: Text('PR: ${material.pr ?? '-'}'),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${material.qty} ${material.unit}',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  if (controller.canAddMaterial)
                    IconButton(
                      icon: const Icon(Icons.delete, color: Colors.red),
                      onPressed: () =>
                          _confirmRemoveMaterial(controller, material),
                    ),
                ],
              ),
            ),
          );
        },
      );
    });
  }

  Widget _buildApprovalTab(WoMtcDetailController controller) {
    return Obx(() {
      if (controller.approvalHistory.isEmpty) {
        return const Center(
          child: Text('No approval history'),
        );
      }

      return ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: controller.approvalHistory.length,
        itemBuilder: (context, index) {
          final approval = controller.approvalHistory[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              leading: CircleAvatar(
                backgroundImage: approval.avatar != null &&
                        approval.avatar!.isNotEmpty
                    ? NetworkImage(ApiConstants.getAvatarUrl(approval.avatar))
                    : null,
                child: approval.avatar == null || approval.avatar!.isEmpty
                    ? Text(approval.fullname.substring(0, 1))
                    : null,
              ),
              title: Text(approval.fullname),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(approval.comment),
                  const SizedBox(height: 4),
                  Text(
                    formatDisplayDateTime(approval.createdAt),
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
              isThreeLine: true,
            ),
          );
        },
      );
    });
  }

  Widget _buildFAB(WoMtcDetailController controller) {
    return Obx(() {
      if (controller.canAddJobExplanation) {
        return FloatingActionButton.extended(
          onPressed: () => _showJobExplanationDialog(Get.context!, controller),
          icon: const Icon(Icons.edit_note),
          label: const Text('Add Explanation'),
        );
      }

      if (controller.canAddLabor || controller.canAddMaterial) {
        return FloatingActionButton(
          onPressed: () => _showAddOptions(Get.context!, controller),
          child: const Icon(Icons.add),
        );
      }

      if (controller.canComplete) {
        return FloatingActionButton.extended(
          onPressed: () => _showCompleteDialog(Get.context!, controller),
          icon: const Icon(Icons.check_circle),
          label: const Text('Complete'),
          backgroundColor: Colors.green,
        );
      }

      if (controller.canClose) {
        return FloatingActionButton.extended(
          onPressed: () => _showCloseDialog(Get.context!, controller),
          icon: const Icon(Icons.done_all),
          label: const Text('Close WO'),
          backgroundColor: Colors.blue,
        );
      }

      if (controller.canApprove) {
        return FloatingActionButton.extended(
          onPressed: () => _showApproveDialog(Get.context!, controller),
          icon: const Icon(Icons.check),
          label: const Text('Approve'),
          backgroundColor: Colors.green,
        );
      }

      return const SizedBox();
    });
  }

  Widget _buildInfoCard(
    String title, {
    required List<Widget> children,
    bool dense = false,
    Widget? trailing,
  }) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(dense ? 12 : 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      fontSize: dense ? 14 : 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (trailing != null) trailing,
              ],
            ),
            SizedBox(height: dense ? 6 : 8),
            const Divider(height: 1),
            SizedBox(height: dense ? 8 : 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildCompactEmptyState(String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Text(
        label,
        style: TextStyle(
          color: AppColors.textSecondary,
          fontSize: 12,
        ),
      ),
    );
  }

  Widget _buildCompactMeta(String label) {
    return Text(
      label,
      style: TextStyle(
        color: AppColors.textSecondary,
        fontSize: 12,
      ),
      overflow: TextOverflow.ellipsis,
    );
  }

  Widget _buildSlimBodyBox({
    required Widget child,
    bool isCentered = false,
  }) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 46),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F6FA),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: const Color(0xFFD5DEE8),
          width: 1,
        ),
      ),
      child: isCentered ? Center(child: child) : child,
    );
  }

  Widget _buildSlimSection({
    required String title,
    required Widget child,
    Widget? trailing,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
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
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (trailing != null) trailing,
            ],
          ),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }

  Widget _buildSectionAction({
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: 28,
        height: 28,
        decoration: const BoxDecoration(
          color: Color(0xFF12B7A6),
          shape: BoxShape.circle,
        ),
        child: Icon(
          icon,
          size: 18,
          color: Colors.white,
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value, {bool isMultiline = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: isMultiline
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(fontSize: 14),
                ),
              ],
            )
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 120,
                  child: Text(
                    label,
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ),
                Expanded(
                  child: Text(
                    value,
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildAttachmentList(
    WoMtcDetailController controller,
    List<String> files,
  ) {
    final cleanFiles = files
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty && item != '#')
        .toList();
    if (cleanFiles.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 6),
        child: Text('No attachments'),
      );
    }

    return Column(
      children: cleanFiles.map((file) {
        return ListTile(
          leading: Icon(
            controller.isImageAttachment(file)
                ? Icons.image
                : Icons.attach_file,
          ),
          title: Text(file),
          onTap: () => controller.openAttachmentFile(file),
          trailing: const Icon(Icons.open_in_new, size: 18),
          dense: true,
        );
      }).toList(),
    );
  }

  Color _getExecutorStatusColor(String status) {
    switch (status) {
      case 'WAITING':
        return Colors.orange;
      case 'IN_PROGRESS':
        return Colors.blue;
      case 'COMPLETE':
        return Colors.green;
      case 'ADDITIONAL':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  void _showAddOptions(BuildContext context, WoMtcDetailController controller) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (controller.canAddJobExplanation)
            ListTile(
              leading: const Icon(Icons.edit_note),
              title: const Text('Add Job Explanation'),
              onTap: () {
                Get.back();
                _showJobExplanationDialog(context, controller);
              },
            ),
          if (controller.canAddLabor)
            ListTile(
              leading: const Icon(Icons.people),
              title: const Text('Add Labor'),
              onTap: () {
                Get.back();
                _showAddLaborDialog(context, controller);
              },
            ),
          if (controller.canAddMaterial)
            ListTile(
              leading: const Icon(Icons.inventory),
              title: const Text('Add Material'),
              onTap: () {
                Get.back();
                _showAddMaterialDialog(context, controller);
              },
            ),
          if (controller.canRequestMaterial)
            ListTile(
              leading: const Icon(Icons.shopping_cart),
              title: const Text('Request Material'),
              onTap: () {
                Get.back();
                _showRequestMaterialDialog(context, controller);
              },
            ),
          ListTile(
            leading: const Icon(Icons.camera_alt),
            title: const Text('Upload Photo/Video'),
            onTap: () {
              Get.back();
              _showMediaUploadOptions(context, controller);
            },
          ),
        ],
      ),
    );
  }

  void _showJobExplanationDialog(
      BuildContext context, WoMtcDetailController controller) {
    final explanationController = TextEditingController();
    final List<File> selectedServicePhotos = [];
    const maxServicePhotos = 5;
    String selectedStatus = 'IN_PROGRESS';

    Get.dialog(
      AlertDialog(
        title: const Text('Add Job Explanation'),
        content: StatefulBuilder(
          builder: (context, setState) {
            Future<void> pickFromCamera() async {
              final picked = await MediaPickerHelper.pickImageFromCamera();
              if (picked != null) {
                setState(() {
                  if (selectedServicePhotos.length >= maxServicePhotos) {
                    Get.snackbar('Limit', 'Maksimal $maxServicePhotos foto');
                    return;
                  }
                  selectedServicePhotos.add(picked);
                });
              }
            }

            Future<void> pickFromGallery() async {
              final picked =
                  await MediaPickerHelper.pickMultiImageFromGallery();
              if (picked.isNotEmpty) {
                setState(() {
                  final available =
                      maxServicePhotos - selectedServicePhotos.length;
                  if (available <= 0) {
                    Get.snackbar('Limit', 'Maksimal $maxServicePhotos foto');
                    return;
                  }
                  if (picked.length > available) {
                    Get.snackbar('Limit',
                        'Maksimal $maxServicePhotos foto (sisanya diabaikan)');
                  }
                  selectedServicePhotos.addAll(picked.take(available));
                });
              }
            }

            void addVideo(File video) {
              if (selectedServicePhotos.length >= maxServicePhotos) {
                Get.snackbar('Limit', 'Maksimal $maxServicePhotos file');
                return;
              }
              setState(() => selectedServicePhotos.add(video));
            }

            Future<void> pickVideoFromCamera() async {
              final picked = await MediaPickerHelper.pickVideoFromCamera();
              if (picked != null) addVideo(picked);
            }

            Future<void> pickVideoFromGallery() async {
              final picked = await MediaPickerHelper.pickVideoFromGallery();
              if (picked != null) addVideo(picked);
            }

            void showVideoOptions() {
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
                          pickVideoFromCamera();
                        },
                      ),
                      ListTile(
                        leading: const Icon(Icons.video_library),
                        title: const Text('Pilih Video Galeri'),
                        onTap: () {
                          Get.back();
                          pickVideoFromGallery();
                        },
                      ),
                    ],
                  ),
                ),
              );
            }

            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: explanationController,
                    decoration: const InputDecoration(
                      labelText: 'Explanation',
                      border: OutlineInputBorder(),
                    ),
                    maxLines: 4,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: selectedStatus,
                    decoration: const InputDecoration(
                      labelText: 'Status Pekerjaan',
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
                    ],
                    onChanged: (value) {
                      setState(() => selectedStatus = value ?? 'IN_PROGRESS');
                    },
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
                          onPressed: pickFromCamera,
                          icon: const Icon(Icons.photo_camera),
                          label: const Text('Camera'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: pickFromGallery,
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
                      onPressed: showVideoOptions,
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
            );
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (selectedServicePhotos.isEmpty) {
                Get.snackbar('Error', 'Bukti foto/video service wajib diupload');
                return;
              }
              Get.back();
              controller.addJobExplanation(
                explanation: explanationController.text,
                status: selectedStatus,
                servicePhotoPaths:
                    selectedServicePhotos.map((item) => item.path).toList(),
              );
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }

  Future<void> _showAddLaborDialog(
      BuildContext context, WoMtcDetailController controller) async {
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

    final selectedPics = <String>{};
    final manualInputController = TextEditingController();
    final searchController = TextEditingController();
    final menController = TextEditingController();
    final hoursController = TextEditingController();

    Get.dialog(
      StatefulBuilder(
        builder: (context, setState) {
          final keyword = searchController.text.trim().toLowerCase();
          final filtered = keyword.isEmpty
              ? picOptions
              : picOptions
                  .where((name) => name.toLowerCase().contains(keyword))
                  .toList();

          return AlertDialog(
            title: const Text('Add Labor'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (picOptions.isNotEmpty)
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        controller: searchController,
                        decoration: InputDecoration(
                          labelText: 'Cari PIC',
                          suffixText: '${selectedPics.length}/10',
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                      const SizedBox(height: 8),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 260),
                        child: ListView.builder(
                          shrinkWrap: true,
                          itemCount: filtered.length,
                          itemBuilder: (context, index) {
                            final name = filtered[index];
                            final checked = selectedPics.contains(name);
                            return CheckboxListTile(
                              dense: true,
                              value: checked,
                              title: Text(name),
                              controlAffinity: ListTileControlAffinity.leading,
                              onChanged: (value) {
                                setState(() {
                                  if (value == true) {
                                    if (selectedPics.length >= 10) {
                                      Get.snackbar(
                                        'Limit',
                                        'Maksimal 10 PIC',
                                        snackPosition: SnackPosition.BOTTOM,
                                      );
                                      return;
                                    }
                                    selectedPics.add(name);
                                  } else {
                                    selectedPics.remove(name);
                                  }
                                });
                              },
                            );
                          },
                        ),
                      ),
                    ],
                  )
                else
                  TextField(
                    controller: manualInputController,
                    decoration: const InputDecoration(
                      labelText: 'PIC (pisahkan dengan koma, max 10)',
                    ),
                  ),
                TextField(
                  controller: menController,
                  decoration: const InputDecoration(labelText: 'Men'),
                  keyboardType: TextInputType.number,
                ),
                TextField(
                  controller: hoursController,
                  decoration: const InputDecoration(labelText: 'Hours'),
                  keyboardType: TextInputType.number,
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
                  final trades = <String>[];
                  if (picOptions.isNotEmpty) {
                    trades.addAll(selectedPics);
                  } else {
                    trades.addAll(manualInputController.text
                        .split(',')
                        .map((value) => value.trim())
                        .where((value) => value.isNotEmpty));
                  }
                  final unique = trades.toSet().toList();
                  if (unique.isEmpty) {
                    Get.snackbar('Error', 'PIC harus dipilih');
                    return;
                  }
                  if (unique.length > 10) {
                    Get.snackbar('Error', 'Maksimal 10 PIC');
                    return;
                  }

                  Get.back();
                  controller.addLabor(
                    trades: unique,
                    men: int.tryParse(menController.text) ?? 0,
                    hours: double.tryParse(hoursController.text) ?? 0,
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

  void _showAddMaterialDialog(
      BuildContext context, WoMtcDetailController controller) {
    WoMaterialDialog.show(
      title: 'Add Material',
      onSearchMaterial: controller.searchMaterialSuggestions,
      onGetMaterialUom: controller.getMaterialUom,
    ).then((result) {
      if (result == null) {
        return;
      }
      controller.addMaterial(
        material: result.material,
        qty: result.qty,
        unit: result.unit,
        pr: result.pr,
      );
    });
  }

  void _showRequestMaterialDialog(
      BuildContext context, WoMtcDetailController controller) {
    WoMaterialDialog.show(
      title: 'Request Material',
      onSearchMaterial: controller.searchMaterialSuggestions,
      onGetMaterialUom: controller.getMaterialUom,
    ).then((result) {
      if (result == null) {
        return;
      }

      final requestQty = result.qty;
      if (requestQty <= 0) {
        Get.snackbar('Error', 'Qty request harus lebih dari 0');
        return;
      }

      controller.requestMaterial([
        MaterialRequestItem(
          level: '0',
          part: result.material,
          materialRequest: requestQty,
          uom: result.unit,
        )
      ]);
    });
  }

  void _confirmRemoveLabor(WoMtcDetailController controller, labor) {
    Get.dialog(
      AlertDialog(
        title: const Text('Remove Labor'),
        content: const Text('Are you sure you want to remove this labor?'),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.removeLabor(labor);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
  }

  void _confirmRemoveMaterial(WoMtcDetailController controller, material) {
    Get.dialog(
      AlertDialog(
        title: const Text('Remove Material'),
        content: const Text('Are you sure you want to remove this material?'),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.removeMaterial(material);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
  }

  void _showApproveDialog(
      BuildContext context, WoMtcDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Approve Work Order'),
        content: TextField(
          controller: commentController,
          decoration: const InputDecoration(
            labelText: 'Comment',
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
            child: const Text('Approve'),
          ),
        ],
      ),
    );
  }

  void _showCompleteDialog(
      BuildContext context, WoMtcDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Complete Work Order'),
        content: TextField(
          controller: commentController,
          decoration: const InputDecoration(
            labelText: 'Comment',
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
              controller.completeWo(commentController.text);
            },
            child: const Text('Complete'),
          ),
        ],
      ),
    );
  }

  void _showCloseDialog(
      BuildContext context, WoMtcDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Close Work Order'),
        content: TextField(
          controller: commentController,
          decoration: const InputDecoration(
            labelText: 'Comment',
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
              controller.closeWo(commentController.text);
            },
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showVoidDialog(BuildContext context, WoMtcDetailController controller) {
    final reasonController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Void Work Order'),
        content: TextField(
          controller: reasonController,
          decoration: const InputDecoration(
            labelText: 'Reason *',
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
              controller.voidWo(reasonController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Void'),
          ),
        ],
      ),
    );
  }

  void _showMediaUploadOptions(
      BuildContext context, WoMtcDetailController controller) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.camera_alt),
            title: const Text('Take Photo'),
            onTap: () async {
              Get.back();
              final file = await MediaPickerHelper.pickImageFromCamera();
              if (file != null) {
                controller.uploadAttachment(file.path);
              }
            },
          ),
          ListTile(
            leading: const Icon(Icons.photo_library),
            title: const Text('Choose Photo'),
            onTap: () async {
              Get.back();
              final file = await MediaPickerHelper.pickImageFromGallery();
              if (file != null) {
                controller.uploadAttachment(file.path);
              }
            },
          ),
          ListTile(
            leading: const Icon(Icons.videocam),
            title: const Text('Record Video'),
            onTap: () async {
              Get.back();
              final file = await MediaPickerHelper.pickVideoFromCamera();
              if (file != null) {
                controller.uploadAttachment(file.path);
              } else {
                Get.snackbar('Error', 'Video too large. Max 50MB');
              }
            },
          ),
          ListTile(
            leading: const Icon(Icons.video_library),
            title: const Text('Choose Video'),
            onTap: () async {
              Get.back();
              final file = await MediaPickerHelper.pickVideoFromGallery();
              if (file != null) {
                controller.uploadAttachment(file.path);
              } else {
                Get.snackbar('Error', 'Video too large. Max 50MB');
              }
            },
          ),
        ],
      ),
    );
  }
}
