import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../controllers/wo_list_controller.dart';
import '../../../data/models/wo_model.dart';
import '../../../data/models/wo_constants.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/utils/company_label_helper.dart';
import '../../../core/widgets/empty_state_widget.dart';

class WoGaListPage extends StatelessWidget {
  const WoGaListPage({Key? key}) : super(key: key);

  String _resolvePageTitle() {
    final args = Get.arguments;
    if (args is Map && args['moduleTitle'] is String) {
      final dynamicTitle = (args['moduleTitle'] as String).trim();
      if (dynamicTitle.isNotEmpty) {
        return dynamicTitle;
      }
    }
    if (args is String && args.trim().isNotEmpty) {
      return args.trim();
    }
    return 'WO GA';
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(WoGaListController());
    final pageTitle = _resolvePageTitle();

    return Scaffold(
      appBar: AppBar(
        title: Text(pageTitle),
        actions: [
          Obx(() {
            if (controller.canCreateWo.value) {
              return IconButton(
                icon: const Icon(Icons.add_circle_outline),
                onPressed: controller.goToCreate,
                tooltip: 'Create WO',
              );
            }
            return const SizedBox();
          }),
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilterDialog(context, controller),
            tooltip: 'Filter',
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Obx(
            () => TabBar(
              controller: controller.tabController,
              isScrollable: false,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white60,
              indicatorColor: Colors.white,
              indicatorSize: TabBarIndicatorSize.tab,
              indicatorWeight: 3,
              tabs: [
                _buildCountTab(
                  'PREV',
                  controller.getTabCount('preventive'),
                ),
                _buildCountTab(
                  'COR',
                  controller.getTabCount('corrective'),
                ),
                _buildCountTab(
                  'PRO',
                  controller.getTabCount('project'),
                ),
              ],
            ),
          ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            _buildFilterChips(controller),
            _buildSearchBar(controller),
            Expanded(
              child: TabBarView(
                controller: controller.tabController,
                children: [
                  _buildWoList(controller, 0),
                  _buildWoList(controller, 1),
                  _buildWoList(controller, 2),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChips(WoGaListController controller) {
    return Obx(() {
      final hasActiveFilter = controller.selectedPriority.value != null ||
          controller.selectedStatus.value != null ||
          controller.showOldestUnfinishedOnly.value;

      if (!hasActiveFilter) return const SizedBox();

      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        color: AppColors.white,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              if (controller.selectedPriority.value != null)
                _buildActiveFilterChip(
                  controller.getPriorityLabel(
                      controller.selectedPriority.value!.code),
                  () => controller.filterByPriority(null),
                  controller.getPriorityColor(
                      controller.selectedPriority.value!.code),
                ),
              if (controller.selectedStatus.value != null)
                _buildActiveFilterChip(
                  controller
                      .getStatusLabel(controller.selectedStatus.value!.code),
                  () => controller.filterByStatus(null),
                  controller
                      .getStatusColor(controller.selectedStatus.value!.code),
                ),
            ],
          ),
        ),
      );
    });
  }

  Widget _buildActiveFilterChip(
      String label, VoidCallback onRemove, Color color) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      child: Chip(
        label: Text(label),
        deleteIcon: const Icon(Icons.close, size: 16),
        onDeleted: onRemove,
        backgroundColor: color.withOpacity(0.1),
        labelStyle: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
        deleteIconColor: color,
      ),
    );
  }

  Widget _buildSearchBar(WoGaListController controller) {
    return Container(
      padding: const EdgeInsets.all(16),
      color: AppColors.white,
      child: SizedBox(
        height: 56,
        child: Row(
          children: [
            Expanded(
              flex: 5,
              child: TextField(
                controller: controller.searchController,
                decoration: InputDecoration(
                  hintText: 'Search WO Number, Job Title, Asset...',
                  prefixIcon: Icon(Icons.search, color: AppColors.grey),
                  suffixIcon: Obx(() {
                    if (controller.searchQuery.value.isEmpty) {
                      return const SizedBox();
                    }
                    return IconButton(
                      icon: Icon(Icons.clear, color: AppColors.grey),
                      onPressed: () {
                        controller.searchController.clear();
                        controller.search('');
                      },
                    );
                  }),
                  filled: true,
                  fillColor: AppColors.greyLight,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(vertical: 16),
                ),
                onChanged: controller.search,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: Obx(
                () => Material(
                  color: controller.showOldestUnfinishedOnly.value
                      ? AppColors.primary.withOpacity(0.12)
                      : AppColors.greyLight,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: controller.toggleOldestUnfinishedFilter,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.hourglass_bottom_rounded,
                            color: controller.showOldestUnfinishedOnly.value
                                ? AppColors.primary
                                : AppColors.grey,
                            size: 18,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            controller.oldestUnfinishedDateLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 10,
                              height: 1.2,
                              color: controller.hasOldestUnfinishedWo
                                  ? AppColors.textSecondary
                                  : AppColors.grey,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWoList(WoGaListController controller, int tabIndex) {
    return Obx(() {
      if (controller.isLoading.value && controller.filteredWoList.isEmpty) {
        return Center(
          child: SpinKitFadingCircle(
            color: AppColors.primary,
            size: 50,
          ),
        );
      }

      if (controller.filteredWoList.isEmpty) {
        String message = 'No Work Orders found';
        if (controller.searchQuery.value.isNotEmpty) {
          message = 'No results for "${controller.searchQuery.value}"';
        } else {
          message = 'No ${_getTabLabel(tabIndex)} Work Orders';
        }

        return EmptyStateWidget(
          icon: Icons.inbox_outlined,
          title: 'No Data',
          message: message,
          onRetry: controller.refresh,
          retryButtonText: 'Refresh',
        );
      }

      return RefreshIndicator(
        onRefresh: controller.refresh,
        child: NotificationListener<ScrollNotification>(
          onNotification: (notification) {
            if (notification.metrics.pixels >=
                notification.metrics.maxScrollExtent - 220) {
              controller.loadMore();
            }
            return false;
          },
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: controller.filteredWoList.length +
                (controller.hasMore.value || controller.isLoadingMore.value
                    ? 1
                    : 0),
            itemBuilder: (context, index) {
              if (index == controller.filteredWoList.length) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Center(
                    child: controller.isLoadingMore.value
                        ? SpinKitThreeBounce(
                            color: AppColors.primary,
                            size: 24,
                          )
                        : const SizedBox.shrink(),
                  ),
                );
              }

              final wo = controller.filteredWoList[index];
              return _buildWoCard(wo, controller);
            },
          ),
        ),
      );
    });
  }

  Widget _buildWoCard(WorkOrder wo, WoGaListController controller) {
    final headerTitle = [
      shortCompanyLabel(wo.company),
      (wo.assetName ?? '').trim(),
      wo.jobTitle.trim(),
    ].where((item) => item.isNotEmpty && item != '-').join(' | ');
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      elevation: 2,
      child: InkWell(
        onTap: () => controller.goToDetail(wo),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          headerTitle.isNotEmpty ? headerTitle : wo.jobTitle,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          wo.woNumber,
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color:
                          controller.getStatusColor(wo.status).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: controller
                            .getStatusColor(wo.status)
                            .withOpacity(0.3),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          controller.getStatusIcon(wo.status),
                          size: 12,
                          color: controller.getStatusColor(wo.status),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          controller.getStatusLabel(wo.status),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: controller.getStatusColor(wo.status),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.calendar_today, size: 14, color: AppColors.grey),
                  const SizedBox(width: 6),
                  Text(
                    formatDisplayDate(wo.date),
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getTypeColor(wo.typeWo).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: _getTypeColor(wo.typeWo).withOpacity(0.3),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _getTypeIcon(wo.typeWo),
                          size: 12,
                          color: _getTypeColor(wo.typeWo),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _getShortTypeLabel(wo.typeWo),
                          style: TextStyle(
                            fontSize: 11,
                            color: _getTypeColor(wo.typeWo),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (wo.priority != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: controller
                            .getPriorityColor(wo.priority!)
                            .withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: controller
                              .getPriorityColor(wo.priority!)
                              .withOpacity(0.3),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.flag,
                            size: 12,
                            color: controller.getPriorityColor(wo.priority!),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            controller.getPriorityLabel(wo.priority!),
                            style: TextStyle(
                              fontSize: 11,
                              color: controller.getPriorityColor(wo.priority!),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const Spacer(),
                  if (wo.divisionName != null)
                    Text(
                      wo.divisionName!,
                      style: TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
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

  Color _getTypeColor(String type) {
    final woType = WoType.fromCode(type);
    if (woType == null) return Colors.grey;

    switch (woType) {
      case WoType.corrective:
        return Colors.orange;
      case WoType.preventive:
        return Colors.blue;
      case WoType.project:
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  Tab _buildCountTab(String label, int count) {
    return Tab(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '$count',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }


  String _getShortTypeLabel(String type) {
    switch (WoType.fromCode(type)) {
      case WoType.preventive:
        return 'PREV';
      case WoType.corrective:
        return 'COR';
      case WoType.project:
        return 'PRO';
      default:
        return type.toUpperCase();
    }
  }

  IconData _getTypeIcon(String type) {
    final woType = WoType.fromCode(type);
    if (woType == null) return Icons.work_outline;

    switch (woType) {
      case WoType.corrective:
        return Icons.build;
      case WoType.preventive:
        return Icons.schedule;
      case WoType.project:
        return Icons.construction;
      default:
        return Icons.work_outline;
    }
  }

  String _getTabLabel(int index) {
    switch (index) {
      case 0:
        return 'PREV';
      case 1:
        return 'Corrective';
      case 2:
        return 'Project';
      default:
        return 'Work Order';
    }
  }

  void _showFilterDialog(BuildContext context, WoGaListController controller) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.5,
          maxChildSize: 0.9,
          expand: false,
          builder: (context, scrollController) {
            return Container(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Filter Work Orders',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Get.back(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Expanded(
                    child: ListView(
                      controller: scrollController,
                      children: [
                        _buildFilterSection(
                          'Priority',
                          _buildPriorityFilter(controller),
                        ),
                        const SizedBox(height: 24),
                        _buildFilterSection(
                          'Status',
                          _buildStatusFilter(controller),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            controller.clearAllFilters();
                            Get.back();
                          },
                          child: const Text('Clear All'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => Get.back(),
                          child: const Text('Apply'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildFilterSection(String title, Widget content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        content,
      ],
    );
  }

  Widget _buildPriorityFilter(WoGaListController controller) {
    return Obx(() => Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _buildFilterChip(
              'All Priorities',
              null,
              controller.selectedPriority.value,
              (value) => controller.filterByPriority(value as WoPriority?),
              Colors.grey,
              Icons.flag_outlined,
            ),
            _buildFilterChip(
              'Normal',
              WoPriority.normal,
              controller.selectedPriority.value,
              (value) => controller.filterByPriority(value as WoPriority?),
              Colors.green,
              Icons.flag,
            ),
            _buildFilterChip(
              'Emergency',
              WoPriority.emergency,
              controller.selectedPriority.value,
              (value) => controller.filterByPriority(value as WoPriority?),
              Colors.red,
              Icons.flag,
            ),
          ],
        ));
  }

  Widget _buildStatusFilter(WoGaListController controller) {
    return Obx(() => Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _buildFilterChip(
              'All Status',
              null,
              controller.selectedStatus.value,
              (value) => controller.filterByStatus(value as WoStatus?),
              Colors.grey,
              Icons.circle_outlined,
            ),
            _buildFilterChip(
              'Pending',
              WoStatus.waitExecutorAdmin,
              controller.selectedStatus.value,
              (value) => controller.filterByStatus(value as WoStatus?),
              Colors.blue,
              Icons.pending_outlined,
            ),
            _buildFilterChip(
              'IN PROGRESS',
              WoStatus.inProgressExecutor,
              controller.selectedStatus.value,
              (value) => controller.filterByStatus(value as WoStatus?),
              Colors.orange,
              Icons.engineering_outlined,
            ),
            _buildFilterChip(
              'COMPLETE',
              WoStatus.complete,
              controller.selectedStatus.value,
              (value) => controller.filterByStatus(value as WoStatus?),
              Colors.green,
              Icons.check_circle_outline,
            ),
          ],
        ));
  }

  Widget _buildFilterChip<T>(
    String label,
    T? value,
    T? currentValue,
    Function(T?) onSelected,
    Color color,
    IconData icon,
  ) {
    final isSelected = currentValue == value;
    return FilterChip(
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: isSelected ? color : Colors.grey),
          const SizedBox(width: 4),
          Text(label),
        ],
      ),
      selected: isSelected,
      onSelected: (selected) => onSelected(selected ? value : null),
      backgroundColor: AppColors.greyLight,
      selectedColor: color.withOpacity(0.2),
      checkmarkColor: color,
      labelStyle: TextStyle(
        color: isSelected ? color : AppColors.textSecondary,
        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
        fontSize: 12,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    );
  }
}

