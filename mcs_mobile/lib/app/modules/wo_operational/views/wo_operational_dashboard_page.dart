import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/wo_operational_dashboard_controller.dart';

class WoOperationalDashboardPage extends GetView<WoOperationalDashboardController> {
  const WoOperationalDashboardPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text(
          'WO Operational Dashboard',
          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
        ),
        backgroundColor: const Color(0xFF00b894),
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Get.back(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list, color: Colors.white),
            onPressed: () => _showFilterDialog(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildDateRangeCard(),
              const SizedBox(height: 16),
              _buildStatsCards(),
              const SizedBox(height: 16),
              _buildChartCard(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDateRangeCard() {
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
          const Text(
            'Periode',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF636e72)),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: controller.setToday,
                  icon: const Icon(Icons.today, size: 16),
                  label: const Text('Today'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF00b894),
                    side: const BorderSide(color: Color(0xFF00b894)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: controller.setThisWeek,
                  icon: const Icon(Icons.date_range, size: 16),
                  label: const Text('This Week'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF00b894),
                    side: const BorderSide(color: Color(0xFF00b894)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: controller.setThisMonth,
                  icon: const Icon(Icons.calendar_month, size: 16),
                  label: const Text('This Month'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF00b894),
                    side: const BorderSide(color: Color(0xFF00b894)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Obx(() => Text(
                '${controller.startDate.value} - ${controller.endDate.value}',
                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
              )),
        ],
      ),
    );
  }

  Widget _buildStatsCards() {
    return Obx(() {
      if (controller.isLoading.value) {
        return const Center(child: CircularProgressIndicator());
      }

      if (controller.stats.value == null) {
        return const Center(child: Text('No data'));
      }

      final stats = controller.stats.value!;

      return Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _buildStatCard(
                  'Open',
                  stats.open.toString(),
                  '${stats.openPercentage.toStringAsFixed(1)}%',
                  controller.getOpenColor(),
                  Icons.pending_actions,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatCard(
                  'IN PROGRESS',
                  stats.inProgress.toString(),
                  '${stats.progressPercentage.toStringAsFixed(1)}%',
                  controller.getProgressColor(),
                  Icons.autorenew,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildStatCard(
                  'Closed',
                  stats.closed.toString(),
                  '${stats.closedPercentage.toStringAsFixed(1)}%',
                  controller.getClosedColor(),
                  Icons.check_circle,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatCard(
                  'Total',
                  stats.total.toString(),
                  '100%',
                  const Color(0xFF636e72),
                  Icons.assessment,
                ),
              ),
            ],
          ),
        ],
      );
    });
  }

  Widget _buildStatCard(String title, String value, String percentage, Color color, IconData icon) {
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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              Text(
                percentage,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey[600],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChartCard() {
    return Obx(() {
      if (controller.stats.value == null) {
        return const SizedBox();
      }

      final stats = controller.stats.value!;

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
              'Status Distribution',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF2d3436)),
            ),
            const SizedBox(height: 24),
            _buildProgressBar(
              'Open',
              stats.open,
              stats.total,
              controller.getOpenColor(),
            ),
            const SizedBox(height: 16),
            _buildProgressBar(
              'IN PROGRESS',
              stats.inProgress,
              stats.total,
              controller.getProgressColor(),
            ),
            const SizedBox(height: 16),
            _buildProgressBar(
              'Closed',
              stats.closed,
              stats.total,
              controller.getClosedColor(),
            ),
          ],
        ),
      );
    });
  }

  Widget _buildProgressBar(String label, int value, int total, Color color) {
    final percentage = total > 0 ? (value / total) * 100 : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
            Text(
              '$value (${percentage.toStringAsFixed(1)}%)',
              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: percentage / 100,
            backgroundColor: Colors.grey[200],
            valueColor: AlwaysStoppedAnimation<Color>(color),
            minHeight: 12,
          ),
        ),
      ],
    );
  }

  void _showFilterDialog(BuildContext context) {
    Get.dialog(
      AlertDialog(
        title: const Text('Filter Dashboard'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Obx(() => DropdownButtonFormField<String>(
                  value: controller.selectedCompany.value,
                  decoration: const InputDecoration(
                    labelText: 'Company',
                    border: OutlineInputBorder(),
                  ),
                  items: controller.companyOptions.map((company) {
                    return DropdownMenuItem(
                      value: company,
                      child: Text(controller.getCompanyLabel(company)),
                    );
                  }).toList(),
                  onChanged: (value) => controller.onCompanyChanged(value ?? 'ALL'),
                )),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}
