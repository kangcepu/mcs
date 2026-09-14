import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import 'package:get/get.dart';

import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/utils/company_label_helper.dart';
import '../../../data/models/approval_center_model.dart';
import '../controllers/approval_controller.dart';

class ApprovalPage extends StatelessWidget {
  const ApprovalPage({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ApprovalController());

    return Scaffold(
      backgroundColor: const Color(0xFFF4F7FB),
      appBar: AppBar(
        title: const Text('Approval'),
      ),
      body: RefreshIndicator(
        onRefresh: controller.refreshAll,
        child: Obx(() {
          if (controller.isLoading.value &&
              controller.summary.value.total == 0 &&
              controller.woApprovals.isEmpty &&
              controller.woClosings.isEmpty &&
              controller.mutations.isEmpty &&
              controller.materials.isEmpty) {
            return const Center(
              child: SpinKitFadingCircle(
                color: Color(0xFF2563EB),
                size: 42,
              ),
            );
          }

          return ListView(
            physics: const AlwaysScrollableScrollPhysics(
              parent: BouncingScrollPhysics(),
            ),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              _CategoryStrip(controller: controller),
              const SizedBox(height: 14),
              _SectionCard(
                sectionKey: 'wo_approvals',
                title: 'Menunggu Approve',
                subtitle: 'WO yang perlu approval kepala divisi.',
                count: controller.countOf('wo_approvals'),
                accentColor: const Color(0xFF2563EB),
                items: controller.itemsOf('wo_approvals'),
                emptyText: 'Belum ada WO yang menunggu approve.',
                processing: controller.isProcessing.value,
                onAction: controller.handleAction,
                onOpenDetail: controller.openRelatedDetail,
                isLoading: controller.isSectionLoading('wo_approvals'),
                isLoaded: controller.isSectionLoaded('wo_approvals'),
                onExpand: controller.ensureSectionLoaded,
              ),
              const SizedBox(height: 12),
              _SectionCard(
                sectionKey: 'wo_closings',
                title: 'Menunggu Closed',
                subtitle: 'WO selesai executor dan siap ditutup.',
                count: controller.countOf('wo_closings'),
                accentColor: const Color(0xFF059669),
                items: controller.itemsOf('wo_closings'),
                emptyText: 'Belum ada WO yang menunggu closed.',
                processing: controller.isProcessing.value,
                onAction: controller.handleAction,
                onOpenDetail: controller.openRelatedDetail,
                isLoading: controller.isSectionLoading('wo_closings'),
                isLoaded: controller.isSectionLoaded('wo_closings'),
                onExpand: controller.ensureSectionLoaded,
              ),
              const SizedBox(height: 12),
              _SectionCard(
                sectionKey: 'materials',
                title: 'Menunggu Part',
                subtitle: 'WO yang tertahan karena kebutuhan part.',
                count: controller.countOf('materials'),
                accentColor: const Color(0xFFD97706),
                items: controller.itemsOf('materials'),
                emptyText: 'Belum ada WO yang menunggu part.',
                processing: controller.isProcessing.value,
                onAction: null,
                onOpenDetail: controller.openRelatedDetail,
                isLoading: controller.isSectionLoading('materials'),
                isLoaded: controller.isSectionLoaded('materials'),
                onExpand: controller.ensureSectionLoaded,
              ),
              const SizedBox(height: 12),
              _SectionCard(
                sectionKey: 'mutations',
                title: 'Mutasi Asset',
                subtitle: 'Permintaan mutasi yang perlu kamu approve.',
                count: controller.countOf('mutations'),
                accentColor: const Color(0xFF7C3AED),
                items: controller.itemsOf('mutations'),
                emptyText: 'Belum ada mutasi yang menunggu approve.',
                processing: controller.isProcessing.value,
                onAction: controller.handleAction,
                onOpenDetail: null,
                isLoading: controller.isSectionLoading('mutations'),
                isLoaded: controller.isSectionLoaded('mutations'),
                onExpand: controller.ensureSectionLoaded,
              ),
            ],
          );
        }),
      ),
    );
  }
}

class _CategoryStrip extends StatelessWidget {
  final ApprovalController controller;

  const _CategoryStrip({required this.controller});

  @override
  Widget build(BuildContext context) {
    final summary = controller.summary.value;
    final categories = controller.woCategorySummaries;

    return GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
          childAspectRatio: 2.75,
        ),
        itemCount: categories.length + 1,
        itemBuilder: (context, index) {
          if (index == 0) {
            final active = controller.selectedCategory.value.isEmpty;
            return _FilterChip(
              label: 'Semua',
              count: summary.total,
              color: const Color(0xFF475569),
              active: active,
              onTap: () => controller.toggleCategory(''),
            );
          }

          final item = categories[index - 1];
          return _FilterChip(
            label: item.label,
            count: item.count,
            color: item.color,
            active: controller.selectedCategory.value == item.key,
            onTap: () => controller.toggleCategory(item.key),
          );
        },
      );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  final bool active;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.count,
    required this.color,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: active ? color : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? color : const Color(0xFFE2E8F0),
            ),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: color.withValues(alpha: 0.18),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '$count',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: active ? Colors.white : color,
                ),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: active ? Colors.white : const Color(0xFF334155),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionCard extends StatefulWidget {
  final String sectionKey;
  final String title;
  final String subtitle;
  final int count;
  final Color accentColor;
  final List<ApprovalItem> items;
  final String emptyText;
  final bool processing;
  final Future<void> Function(ApprovalItem item)? onAction;
  final Future<void> Function(ApprovalItem item)? onOpenDetail;
  final bool isLoading;
  final bool isLoaded;
  final Future<void> Function(String section) onExpand;

  const _SectionCard({
    required this.sectionKey,
    required this.title,
    required this.subtitle,
    required this.count,
    required this.accentColor,
    required this.items,
    required this.emptyText,
    required this.processing,
    required this.onAction,
    required this.onOpenDetail,
    required this.isLoading,
    required this.isLoaded,
    required this.onExpand,
  });

  @override
  State<_SectionCard> createState() => _SectionCardState();
}

class _SectionCardState extends State<_SectionCard>
    with SingleTickerProviderStateMixin {
  bool _isExpanded = false;

  Future<void> _toggleSection() async {
    final next = !_isExpanded;
    setState(() {
      _isExpanded = next;
    });

    if (next && !widget.isLoaded) {
      await widget.onExpand(widget.sectionKey);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: _toggleSection,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(20),
                bottom: Radius.circular(20),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: widget.accentColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        _sectionIcon(widget.sectionKey),
                        color: widget.accentColor,
                        size: 21,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.title,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            widget.subtitle,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 11,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: widget.accentColor.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${widget.count}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: widget.accentColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    AnimatedRotation(
                      duration: const Duration(milliseconds: 180),
                      turns: _isExpanded ? 0.5 : 0,
                      child: const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: Color(0xFF64748B),
                        size: 24,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          ClipRect(
            child: AnimatedSize(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              child: !_isExpanded
                  ? const SizedBox.shrink()
                  : Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: widget.isLoading
                          ? Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 22),
                              child: Column(
                                children: [
                                  SizedBox(
                                    width: 26,
                                    height: 26,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.4,
                                      color: widget.accentColor,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  const Text(
                                    'Memuat data...',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Color(0xFF64748B),
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : widget.items.isEmpty
                          ? Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF8FAFC),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: const Color(0xFFE2E8F0),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.inbox_outlined,
                                    color: widget.accentColor,
                                    size: 18,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      widget.emptyText,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: Color(0xFF64748B),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : ListView.separated(
                              itemCount: widget.items.length,
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 10),
                              itemBuilder: (context, index) {
                                return _ApprovalItemCard(
                                  item: widget.items[index],
                                  processing: widget.processing,
                                  onAction: widget.onAction,
                                  onOpenDetail: widget.onOpenDetail,
                                  accentColor: widget.accentColor,
                                );
                              },
                            ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  IconData _sectionIcon(String sectionKey) {
    switch (sectionKey) {
      case 'wo_approvals':
        return Icons.verified_outlined;
      case 'wo_closings':
        return Icons.task_alt_outlined;
      case 'materials':
        return Icons.inventory_2_outlined;
      case 'mutations':
        return Icons.swap_horiz_rounded;
      default:
        return Icons.folder_open_outlined;
    }
  }
}

class _ApprovalItemCard extends StatelessWidget {
  final ApprovalItem item;
  final bool processing;
  final Future<void> Function(ApprovalItem item)? onAction;
  final Future<void> Function(ApprovalItem item)? onOpenDetail;
  final Color accentColor;

  const _ApprovalItemCard({
    required this.item,
    required this.processing,
    required this.onAction,
    required this.onOpenDetail,
    required this.accentColor,
  });

  @override
  Widget build(BuildContext context) {
    final canOpenDetail = onOpenDetail != null &&
        item.woNumber.isNotEmpty &&
        item.moduleKey.isNotEmpty;
    final canAction = onAction != null && item.actionType.isNotEmpty;

    return Material(
      color: const Color(0xFFF8FAFC),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: canOpenDetail ? () => onOpenDetail!(item) : null,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFE2E8F0)),
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
                          item.primaryCode,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        if (item.jobTitle.isNotEmpty) ...[
                          const SizedBox(height: 5),
                          Text(
                            item.jobTitle,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              height: 1.3,
                              color: Color(0xFF334155),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (canAction) ...[
                    const SizedBox(width: 10),
                    _ActionButton(
                      label: item.actionLabel.isNotEmpty
                          ? item.actionLabel
                          : 'Proses',
                      processing: processing,
                      color: accentColor,
                      onPressed: () => onAction!(item),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _InfoPill(
                    icon: Icons.business_outlined,
                    text: shortCompanyLabel(item.companyLabel),
                  ),
                  if (item.status.isNotEmpty)
                    _InfoPill(
                      icon: Icons.flag_outlined,
                      text: _compactStatus(item.status),
                    ),
                  if (item.date.isNotEmpty)
                    _InfoPill(
                      icon: Icons.calendar_today_outlined,
                      text: formatDisplayDate(item.date),
                    ),
                ],
              ),
              if (item.assetName.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  item.assetName,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1E293B),
                  ),
                ),
              ],
              if (item.jobExecutor.isNotEmpty || item.creator.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  item.jobExecutor.isNotEmpty
                      ? 'Executor: ${item.jobExecutor}'
                      : 'Creator: ${item.creator}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF64748B),
                  ),
                ),
              ],
              if (canOpenDetail) ...[
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      'Buka detail',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: accentColor,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.arrow_forward_rounded,
                      size: 16,
                      color: accentColor,
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

  String _compactStatus(String status) {
    final normalized = status.trim().toUpperCase();
    switch (normalized) {
      case 'WAIT_KA_DIV':
      case 'WAIT_KA_DIV_ITIS':
      case 'WAIT_KA_DIV_MTC':
      case 'WAIT_KA_DIV_HRGA':
        return 'Wait Kadiv';
      case 'WAITING_PARTS':
        return 'Wait Part';
      case 'NEED_CLOSED':
        return 'Need Closed';
      default:
        return status;
    }
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final bool processing;
  final Color color;
  final VoidCallback onPressed;

  const _ActionButton({
    required this.label,
    required this.processing,
    required this.color,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: processing ? null : onPressed,
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: color,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 36),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _InfoPill extends StatelessWidget {
  final IconData icon;
  final String text;

  const _InfoPill({
    required this.icon,
    required this.text,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: const Color(0xFF64748B)),
          const SizedBox(width: 5),
          Text(
            text,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Color(0xFF334155),
            ),
          ),
        ],
      ),
    );
  }
}
