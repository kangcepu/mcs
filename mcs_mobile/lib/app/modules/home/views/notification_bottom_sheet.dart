import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../controllers/notification_controller.dart';
import '../../../core/utils/company_label_helper.dart';
import '../../../data/models/notification_model.dart';

class NotificationBottomSheet extends GetView<NotificationController> {
  const NotificationBottomSheet({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.75,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Notifikasi',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                Obx(
                  () => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF2196F3),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${controller.totalNotifications.value}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: Obx(() {
              if (controller.isLoading.value) {
                return const Center(child: CircularProgressIndicator());
              }

              if (controller.totalNotifications.value == 0) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.notifications_none,
                        size: 64,
                        color: Colors.grey[400],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Tidak ada notifikasi',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    ],
                  ),
                );
              }

              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (controller.preventiveWoList.isNotEmpty) ...[
                    _buildSectionHeader(
                      'WO Preventive',
                      controller.totalPreventiveCount,
                    ),
                    if (controller.totalPreventiveCount >
                        controller.preventiveWoList.length) ...[
                      const SizedBox(height: 4),
                      _buildLatestInfoText(
                        shown: controller.preventiveWoList.length,
                        total: controller.totalPreventiveCount,
                      ),
                    ],
                    const SizedBox(height: 8),
                    ...controller.preventiveWoList.map(
                      (wo) => _buildWoCard(wo),
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (controller.inProgressWoList.isNotEmpty) ...[
                    _buildSectionHeader(
                      'WO In Progress',
                      controller.totalInProgressCount,
                    ),
                    if (controller.totalInProgressCount >
                        controller.inProgressWoList.length) ...[
                      const SizedBox(height: 4),
                      _buildLatestInfoText(
                        shown: controller.inProgressWoList.length,
                        total: controller.totalInProgressCount,
                      ),
                    ],
                    const SizedBox(height: 8),
                    ...controller.inProgressWoList.map(
                      (wo) => _buildWoCard(wo),
                    ),
                  ],
                ],
              );
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, int count) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: const Color(0xFFE3F2FD),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            '$count',
            style: const TextStyle(
              fontSize: 12,
              color: Color(0xFF2196F3),
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLatestInfoText({required int shown, required int total}) {
    return Text(
      'Menampilkan $shown data terbaru dari total $total',
      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
    );
  }

  Widget _buildWoCard(PreventiveWo wo) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () {
          Get.back();
          controller.navigateToWoDetail(wo);
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      wo.woNumber,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  _buildStatusBadge(wo.status),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                wo.jobTitle,
                style: const TextStyle(fontSize: 13),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.business, size: 14, color: Colors.grey[600]),
                  const SizedBox(width: 4),
                  Text(
                    shortCompanyLabel(wo.company),
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                  const SizedBox(width: 12),
                  Icon(Icons.calendar_today, size: 14, color: Colors.grey[600]),
                  const SizedBox(width: 4),
                  Text(
                    formatDisplayDate(wo.date),
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                ],
              ),
              if (wo.assetName != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.precision_manufacturing,
                      size: 14,
                      color: Colors.grey[600],
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        wo.assetName!,
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color bgColor;
    Color textColor;
    String statusText;

    switch (status) {
      case 'WAIT_EXECUTOR_ADMIN':
        bgColor = const Color(0xFFFFF3E0);
        textColor = const Color(0xFFFF6F00);
        statusText = 'Wait Executor Admin';
        break;
      case 'WAIT_KA_DIV':
        bgColor = const Color(0xFFFFF3E0);
        textColor = const Color(0xFFFF6F00);
        statusText = 'Wait Ka Div';
        break;
      case 'WAIT_KA_DEPT_MESO':
        bgColor = const Color(0xFFFFF3E0);
        textColor = const Color(0xFFFF6F00);
        statusText = 'Wait Ka Dept MESO';
        break;
      case 'IN_PROGRESS_EXECUTOR':
        bgColor = const Color(0xFFE3F2FD);
        textColor = const Color(0xFF1976D2);
        statusText = 'In Progress';
        break;
      case 'COMPLETE_EXECUTOR':
        bgColor = const Color(0xFFE8F5E9);
        textColor = const Color(0xFF2E7D32);
        statusText = 'Complete Executor';
        break;
      case 'NEED_CLOSED':
        bgColor = const Color(0xFFFCE4EC);
        textColor = const Color(0xFFC2185B);
        statusText = 'Need Closed';
        break;
      case 'PARTS_RECEIVED':
        bgColor = const Color(0xFFE8F5E9);
        textColor = const Color(0xFF2E7D32);
        statusText = 'Parts Received';
        break;
      case 'WAITING_PARTS':
        bgColor = const Color(0xFFFFF3E0);
        textColor = const Color(0xFFFF6F00);
        statusText = 'Waiting Parts';
        break;
      default:
        bgColor = const Color(0xFFF5F5F5);
        textColor = const Color(0xFF616161);
        statusText = status.replaceAll('_', ' ');
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        statusText,
        style: TextStyle(
          fontSize: 10,
          color: textColor,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
