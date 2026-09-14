import 'package:flutter/material.dart';
import '../../../data/models/wo_mtc_model.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/utils/company_label_helper.dart';
import '../../../core/widgets/status_badge.dart';

class WoMtcCardWidget extends StatelessWidget {
  final WorkOrderMtc wo;
  final VoidCallback onTap;

  const WoMtcCardWidget({
    Key? key,
    required this.wo,
    required this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      wo.woNumber,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                  StatusBadge(status: wo.status),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                wo.jobTitle,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              _buildInfoRow(Icons.business, shortCompanyLabel(wo.company)),
              const SizedBox(height: 6),
              _buildInfoRow(Icons.calendar_today, _formatDate(wo.date)),
              if (wo.assetName != null) ...[
                const SizedBox(height: 6),
                _buildInfoRow(Icons.inventory_2, wo.assetName!),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 14, color: AppColors.textSecondary),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  String _formatDate(String date) {
    return formatDisplayDate(date);
  }
}
