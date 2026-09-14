import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// Status Badge Widget
/// Reusable untuk semua status (WO, Asset, dll)
class StatusBadge extends StatelessWidget {
  final String status;
  final String? label;
  
  const StatusBadge({
    Key? key,
    required this.status,
    this.label,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final config = _getStatusConfig(status);
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: config['color'].withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: config['color'],
          width: 1,
        ),
      ),
      child: Text(
        label ?? _formatStatus(status),
        style: TextStyle(
          color: config['color'],
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Map<String, dynamic> _getStatusConfig(String status) {
    switch (status.toUpperCase()) {
      case 'WAIT_KA_DIV':
      case 'WAIT_KA_DIV_ITIS':
      case 'WAITING_PARTS':
        return {'color': AppColors.primary};
      
      case 'WAIT_EXECUTOR_ADMIN':
      case 'PARTS_RECEIVED':
        return {'color': AppColors.success};
      
      case 'IN_PROGRESS_EXECUTOR':
        return {'color': Colors.orange};
      
      case 'NEED_CLOSED':
        return {'color': AppColors.warning};
      
      case 'COMPLETE_EXECUTOR':
      case 'COMPLETE':
        return {'color': AppColors.info};
      
      case 'CLOSED':
        return {'color': AppColors.greyDark};
      
      case 'VOID':
      case 'DECLINE':
        return {'color': AppColors.error};
      
      default:
        return {'color': AppColors.grey};
    }
  }

  String _formatStatus(String status) {
    return status
        .replaceAll('_', ' ')
        .split(' ')
        .map((word) => word[0].toUpperCase() + word.substring(1).toLowerCase())
        .join(' ');
  }
}