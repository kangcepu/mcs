import 'dart:async';
import 'dart:io';
import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';
import '../../../core/routes/app_routes.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/utils/company_label_helper.dart';
import '../../../core/utils/daily_control_image_editor_helper.dart';
import '../controllers/daily_control_controller.dart';

String _dailyControlMaintenanceKindLabel(String value) {
  switch (value.trim().toLowerCase()) {
    case 'corrective':
      return 'COR';
    case 'preventive':
      return 'PREV';
    case 'project':
      return 'PRO';
    default:
      return value.toUpperCase();
  }
}

String _dailyControlActionLabel(String value) {
  switch (value.trim().toLowerCase()) {
    case 'request part':
      return 'REQ PART';
    default:
      return value.toUpperCase();
  }
}

class DailyControlPage extends StatelessWidget {
  const DailyControlPage({super.key});
  @override
  Widget build(BuildContext context) {
    final DailyControlController controller = Get.put(DailyControlController());
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Daily Control'),
        backgroundColor: const Color(0xFF2a5298),
        foregroundColor: Colors.white,
        actions: [
          Obx(() {
            // Angka badge dipulihkan dari penyimpanan lokal, jadi tidak perlu
            // menunggu request daftar unread selesai.
            final unreadCount = controller.unreadActivityCount.value;
            return Row(
              children: [
                _buildAppBarAction(
                  icon: Transform.translate(
                    offset: const Offset(-4, 0),
                    child: SizedBox(
                      width: 40,
                      height: 40,
                      child: ClipRect(
                        child: OverflowBox(
                          maxWidth: 72,
                          maxHeight: 72,
                          child: Transform.scale(
                            scale: 2.2,
                            child: Image.asset(
                              'assets/chat.png',
                              width: 40,
                              height: 40,
                              fit: BoxFit.contain,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  badgeCount: unreadCount,
                  onTap: () async {
                    // Bila daftar sudah pernah dimuat, tampilkan data tersebut
                    // seketika lalu refresh di latar belakang.
                    final hasCachedUnread =
                        controller.unreadActivities.isNotEmpty;
                    unawaited(
                      controller.loadUnreadActivities(
                        showLoader: !hasCachedUnread,
                      ),
                    );
                    await _openUnreadActivitySheet(controller);
                  },
                ),
                const SizedBox(width: 8),
              ],
            );
          }),
        ],
      ),
      body: Obx(
        () {
          // Observe target notifikasi di dalam Obx agar tap notifikasi saat
          // halaman ini sudah terbuka juga langsung membuka chat terkait.
          final pendingActivityId = controller.pendingOpenActivityId.value;
          final pendingUnreadList = controller.pendingOpenUnreadList.value;
          if (pendingActivityId != null && pendingActivityId > 0) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _tryOpenFromNotification(controller);
            });
          }
          if (pendingUnreadList) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _openUnreadListFromNotification(controller);
            });
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildDateFilterCard(controller),
                const SizedBox(height: 16),
                if (controller.selectedDivisionFilter.value.isNotEmpty) ...[
                  _buildSubmissionSummaryCard(controller),
                  const SizedBox(height: 16),
                ],
                Row(
                  children: [
                    Text(
                      formatDisplayDateValue(controller.selectedDate.value),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1f2937),
                      ),
                    ),
                    Expanded(
                      child: Obx(() {
                        return Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            _buildMaintenanceTypeFilterChip(
                              label: 'PRO:${controller.projectDoneCount}',
                              selected: controller
                                  .isMaintenanceKindSelected('project'),
                              onTap: () => controller
                                  .toggleMaintenanceKindFilter('project'),
                            ),
                            const Text(
                              '|',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF9CA3AF),
                              ),
                            ),
                            _buildMaintenanceTypeFilterChip(
                              label: 'COR:${controller.correctiveDoneCount}',
                              selected: controller
                                  .isMaintenanceKindSelected('corrective'),
                              onTap: () => controller
                                  .toggleMaintenanceKindFilter('corrective'),
                            ),
                            const Text(
                              '|',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF9CA3AF),
                              ),
                            ),
                            _buildMaintenanceTypeFilterChip(
                              label:
                                  'PREV:${controller.preventiveDoneCount}/${controller.scheduledPreventiveTotal.value}',
                              selected: controller
                                  .isMaintenanceKindSelected('preventive'),
                              onTap: () => controller
                                  .toggleMaintenanceKindFilter('preventive'),
                            ),
                          ],
                        );
                      }),
                    ),
                    const SizedBox(width: 8),
                    Obx(() => Text(
                          '(${controller.totalDoneCount})',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF1d4ed8),
                          ),
                        )),
                  ],
                ),
                const SizedBox(height: 10),
                if (controller.isLoading.value)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(18),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else if (controller.filteredActivities.isEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      controller.activities.isEmpty
                          ? 'Belum ada update WO Corrective.'
                          : (controller.selectedDivisionFilter.value.isEmpty
                              ? 'Pilih filter divisi terlebih dahulu.'
                              : 'Tidak ada data sesuai filter.'),
                    ),
                  )
                else
                  ...controller.filteredActivities.map(_buildActivityCard),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildAppBarAction({
    required Widget icon,
    required int badgeCount,
    required Future<void> Function() onTap,
  }) {
    final badgeText = badgeCount > 99 ? '99+' : '$badgeCount';
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          padding: const EdgeInsets.all(2),
          constraints: const BoxConstraints(
            minWidth: 56,
            minHeight: 56,
          ),
          onPressed: () {
            onTap();
          },
          icon: icon,
        ),
        if (badgeCount > 0)
          Positioned(
            top: 2,
            right: 1,
            child: Container(
              constraints: const BoxConstraints(minWidth: 17),
              height: 17,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: const Color(0xFF2a5298), width: 1.2),
              ),
              child: Center(
                child: Text(
                  badgeText,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _openUnreadActivitySheet(
    DailyControlController controller,
  ) async {
    await showModalBottomSheet<void>(
      context: Get.context!,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) {
        return Container(
          height: MediaQuery.of(Get.context!).size.height,
          decoration: const BoxDecoration(
            color: Color(0xFFF8FAFC),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: SafeArea(
            top: true,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Chat Belum Dibaca',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF111827),
                          ),
                        ),
                      ),
                      Obx(() => Text(
                            '${controller.unreadActivities.length} item',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF6B7280),
                            ),
                          )),
                      const SizedBox(width: 8),
                      InkWell(
                        onTap: () => Get.back(),
                        borderRadius: BorderRadius.circular(999),
                        child: Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                              color: const Color(0xFFE5E7EB),
                            ),
                          ),
                          child: const Icon(
                            Icons.close,
                            size: 18,
                            color: Color(0xFF6B7280),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: Obx(() {
                      final items = controller.unreadActivities;
                      // Jangan menggantikan daftar yang sudah ada dengan
                      // spinner ketika API sedang melakukan refresh.
                      if (controller.isLoadingUnreadActivities.value &&
                          items.isEmpty) {
                        return const Center(child: CircularProgressIndicator());
                      }
                      if (items.isEmpty) {
                        return const Center(
                          child: Text(
                            'Semua chat Daily Control sudah dibaca.',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF6B7280),
                            ),
                          ),
                        );
                      }
                      return ListView.separated(
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, index) {
                          final item = items[index];
                          final title = item.title.isNotEmpty
                              ? item.title
                              : (item.assetName.isNotEmpty
                                  ? item.assetName
                                  : '-');
                          final subtitle = item.latestUnreadMessage.isNotEmpty
                              ? item.latestUnreadMessage
                              : item.notes;
                          return Material(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(14),
                              onTap: () async {
                                // Biarkan sheet daftar tetap terbuka di bawah
                                // dialog chat. Saat chat ditutup, pengguna
                                // langsung kembali ke daftar tanpa reload UI.
                                await _openUnreadActivityItem(controller, item);
                              },
                              onLongPress: () async {
                                await _openUnreadMessageDialog(
                                    controller, item);
                              },
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            item.displayName.isNotEmpty
                                                ? item.displayName
                                                : '-',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w700,
                                              color: Color(0xFF111827),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 8,
                                            vertical: 4,
                                          ),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFFEE2E2),
                                            borderRadius:
                                                BorderRadius.circular(999),
                                          ),
                                          child: Text(
                                            '${item.unreadCount} chat',
                                            style: const TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: Color(0xFFDC2626),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      subtitle.isNotEmpty ? subtitle : title,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xFF1F2937),
                                      ),
                                    ),
                                    if (title.isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w500,
                                          color: Color(0xFF6B7280),
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 8),
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: Text(
                                        '${formatDisplayDate(item.activityDate)} ${_dailyControlCompactTime(item.activityTime)}',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFF6B7280),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      );
                    }),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _openUnreadListFromNotification(DailyControlController controller) {
    if (!controller.pendingOpenUnreadList.value) {
      return;
    }
    controller.clearPendingOpenUnreadList();
    final hasCachedUnread = controller.unreadActivities.isNotEmpty;
    unawaited(
      controller.loadUnreadActivities(showLoader: !hasCachedUnread),
    );
    unawaited(_openUnreadActivitySheet(controller));
  }

  Future<void> _openUnreadActivityItem(
    DailyControlController controller,
    DailyControlUnreadActivity item,
  ) async {
    controller.clearPendingOpenActivity();
    final targetDate = DateTime.tryParse(item.activityDate);
    if (targetDate != null) {
      final selectedDate = controller.selectedDate.value;
      final isSameDate = selectedDate.year == targetDate.year &&
          selectedDate.month == targetDate.month &&
          selectedDate.day == targetDate.day;
      if (!isSameDate) {
        controller.selectedDate.value = targetDate;
      }
    }
    DailyControlActivity? activity = controller.findActivityById(item.id);
    activity ??= controller.activities.firstWhereOrNull(
      (entry) => entry.id == item.id,
    );
    activity ??= DailyControlActivity(
      id: item.id,
      idUser: 0,
      user: item.displayName,
      division: item.divisionName,
      divisionCode: '',
      date: item.activityDate,
      time: item.activityTime,
      title: item.title,
      notes: item.notes,
      assetCode: '',
      assetName: item.assetName,
      partMesin: '',
      woNumber: item.woNumber,
      maintenanceKind: '',
      maintenanceActionLabel: '',
      requestPartLabel: '',
      executorCodeRaw: '',
      mesoSubtype: '',
      sourceTable: '',
      mtcAreaKey: '',
      media: const [],
      commentCount: 0,
      unreadCount: item.unreadCount,
      tags: const [],
      followUps: const [],
      participantUserIds: const [],
      participantNames: const [],
      laborNames: const [],
      readerNames: const [],
      displayFullname: item.displayName,
    );
    await _openChatSheet(activity);
    controller.clearPendingOpenActivity();
    final targetDate2 = DateTime.tryParse(item.activityDate);
    if (targetDate2 != null) {
      final selectedDate = controller.selectedDate.value;
      final isSameDate = selectedDate.year == targetDate2.year &&
          selectedDate.month == targetDate2.month &&
          selectedDate.day == targetDate2.day;
      if (!isSameDate) {
        controller.selectedDate.value = targetDate2;
      }
    }
    // Yang berubah hanya status chat unread; tidak perlu memuat ulang seluruh
    // feed Daily Control saat kembali ke daftar.
    unawaited(controller.loadUnreadActivities(showLoader: false));
  }

  Future<void> _openUnreadMessageDialog(
    DailyControlController controller,
    DailyControlUnreadActivity item,
  ) async {
    await controller.markAsRead(item.id);
    await controller.loadUnreadActivities(showLoader: false);
    final replyController = TextEditingController();
    bool isSending = false;
    final messageText = item.latestUnreadMessage.isNotEmpty
        ? item.latestUnreadMessage
        : (item.notes.isNotEmpty ? item.notes : item.title);
    await Get.dialog<void>(
      Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: StatefulBuilder(
          builder: (context, setState) {
            Future<void> submitReply() async {
              final message = replyController.text.trim();
              if (message.isEmpty || isSending) {
                return;
              }
              setState(() {
                isSending = true;
              });
              try {
                final result = await controller.createComment(
                  dailyControlId: item.id,
                  message: message,
                );
                if (result == null) {
                  throw Exception('Gagal mengirim balasan');
                }
                if (context.mounted) {
                  Navigator.of(context).pop();
                }
                Get.snackbar(
                  'Daily Control',
                  'Balasan berhasil dikirim.',
                  snackPosition: SnackPosition.BOTTOM,
                  backgroundColor: const Color(0xFF16A34A),
                  colorText: Colors.white,
                );
              } catch (e) {
                Get.snackbar(
                  'Daily Control',
                  'Gagal kirim balasan: $e',
                  snackPosition: SnackPosition.BOTTOM,
                  backgroundColor: const Color(0xFFDC2626),
                  colorText: Colors.white,
                );
              } finally {
                if (context.mounted) {
                  setState(() {
                    isSending = false;
                  });
                }
              }
            }

            return Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.displayName.isNotEmpty ? item.displayName : '-',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF111827),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      InkWell(
                        onTap: () => Navigator.of(context).pop(),
                        borderRadius: BorderRadius.circular(999),
                        child: Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            color: const Color(0xFFF3F4F6),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Icon(
                            Icons.close,
                            size: 18,
                            color: Color(0xFF6B7280),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  if (item.title.isNotEmpty)
                    Text(
                      item.title,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF6B7280),
                      ),
                    ),
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(maxHeight: 320),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFE5E7EB)),
                    ),
                    child: FutureBuilder<List<DailyControlComment>>(
                      future: controller.getComments(item.id),
                      builder: (context, snapshot) {
                        if (snapshot.connectionState ==
                            ConnectionState.waiting) {
                          return const SizedBox(
                            height: 120,
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        final thread =
                            _flattenComments(snapshot.data ?? const []);
                        if (thread.isEmpty) {
                          return SingleChildScrollView(
                            child: Text(
                              messageText.isNotEmpty ? messageText : '-',
                              style: const TextStyle(
                                fontSize: 14,
                                height: 1.45,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF111827),
                              ),
                            ),
                          );
                        }
                        return ListView.separated(
                          shrinkWrap: true,
                          itemCount: thread.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final comment = thread[index];
                            return _buildUnreadThreadBubble(comment);
                          },
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      item.latestUnreadAt.isNotEmpty
                          ? item.latestUnreadAt
                          : '${formatDisplayDate(item.activityDate)} ${_dailyControlCompactTime(item.activityTime)}',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF6B7280),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: replyController,
                    minLines: 1,
                    maxLines: 4,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => submitReply(),
                    decoration: InputDecoration(
                      hintText: 'Tulis balasan...',
                      filled: true,
                      fillColor: const Color(0xFFF9FAFB),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: Color(0xFFE5E7EB),
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: Color(0xFFE5E7EB),
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: Color(0xFF2563EB),
                          width: 1.2,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: isSending
                              ? null
                              : () => Navigator.of(context).pop(),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(46),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: const Text('Tutup'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: isSending ? null : submitReply,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB),
                            foregroundColor: Colors.white,
                            minimumSize: const Size.fromHeight(46),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: isSending
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text('Balas'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
      barrierDismissible: true,
    );
  }

  List<DailyControlComment> _flattenComments(
      List<DailyControlComment> comments) {
    final flattened = <DailyControlComment>[];
    void appendComment(DailyControlComment comment) {
      flattened.add(comment);
      final replies = [...comment.replies];
      replies.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      for (final reply in replies) {
        appendComment(reply);
      }
    }

    final roots = [...comments];
    roots.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    for (final comment in roots) {
      appendComment(comment);
    }
    return flattened;
  }

  Widget _buildUnreadThreadBubble(DailyControlComment comment) {
    final sender =
        comment.fullname.trim().isNotEmpty ? comment.fullname.trim() : '-';
    final message =
        comment.message.trim().isNotEmpty ? comment.message.trim() : '-';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            sender,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF2563EB),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            message,
            style: const TextStyle(
              fontSize: 13,
              height: 1.4,
              fontWeight: FontWeight.w600,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              _formatCommentTime(comment.createdAt),
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: Color(0xFF6B7280),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatCommentTime(String raw) {
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) {
      return raw;
    }
    return '${formatDisplayDateValue(parsed)} ${parsed.hour.toString().padLeft(2, '0')}:${parsed.minute.toString().padLeft(2, '0')}';
  } // ignore: unused_element

  Future<void> _openComposerBottomSheet(
    BuildContext context,
    DailyControlController controller,
  ) async {
    controller.clearComposer();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.92,
          minChildSize: 0.55,
          maxChildSize: 0.96,
          builder: (context, scrollController) {
            return Container(
              decoration: const BoxDecoration(
                color: Color(0xFFF5F7FA),
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                    child: Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Tambah Update Kegiatan',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF111827),
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Get.back(),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      controller: scrollController,
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: _buildComposerCard(
                        controller,
                        closeAfterPost: true,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildDateFilterCard(DailyControlController controller) {
    return Obx(
      () => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFf3f4f6),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  const Icon(Icons.calendar_today_rounded, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      controller.selectedDateLabel,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  TextButton(
                    onPressed: controller.pickDate,
                    style: TextButton.styleFrom(
                      minimumSize: const Size(0, 32),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                    child: const Text(
                      'Pilih',
                      style:
                          TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(width: 4),
                  _buildDateNavButton(
                    onPressed: controller.previousDate,
                    icon: Icons.chevron_left,
                    label: 'Prev',
                  ),
                  const SizedBox(width: 4),
                  _buildDateNavButton(
                    onPressed: controller.isToday ? null : controller.nextDate,
                    icon: Icons.chevron_right,
                    label: 'Next',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: controller.availableDivisionFilters
                      .asMap()
                      .entries
                      .map((entry) {
                    final key = entry.value;
                    final index = entry.key;
                    final label = key == 'ITS' ? 'IS' : key;
                    return Padding(
                      padding: EdgeInsets.only(left: index == 0 ? 0 : 6),
                      child: _buildFilterChip(
                        label: label,
                        selected:
                            controller.selectedDivisionFilter.value == key,
                        onTap: () => controller.setDivisionFilter(key),
                        compact: true,
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            if (controller.selectedDivisionFilter.value == 'MESO' &&
                controller.availableDivisionFilters.contains('MESO')) ...[
              const SizedBox(height: 10),
              const Text(
                'Kategori MESO',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF4B5563),
                ),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _buildFilterChip(
                    label: 'Semua',
                    selected: controller.selectedMesoFilter.value == 'ALL',
                    onTap: () => controller.setMesoFilter('ALL'),
                    compact: true,
                  ),
                  _buildFilterChip(
                    label: 'MKL',
                    selected: controller.selectedMesoFilter.value == 'MKL',
                    onTap: () => controller.setMesoFilter('MKL'),
                    compact: true,
                  ),
                  _buildFilterChip(
                    label: 'ELC',
                    selected: controller.selectedMesoFilter.value == 'ELC',
                    onTap: () => controller.setMesoFilter('ELC'),
                    compact: true,
                  ),
                  _buildFilterChip(
                    label: 'SPL',
                    selected: controller.selectedMesoFilter.value == 'SPL',
                    onTap: () => controller.setMesoFilter('SPL'),
                    compact: true,
                  ),
                  _buildFilterChip(
                    label: 'OTO',
                    selected: controller.selectedMesoFilter.value == 'OTO',
                    onTap: () => controller.setMesoFilter('OTO'),
                    compact: true,
                  ),
                ],
              ),
            ],
            if (controller.showMtcAreaFilter) ...[
              const SizedBox(height: 10),
              const Text(
                'Lokasi MTC',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF4B5563),
                ),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: controller.availableMtcAreaFilters.map((key) {
                  final label =
                      key == 'ALL' ? 'Semua' : controller.mtcAreaLabel(key);
                  return _buildFilterChip(
                    label: label,
                    selected: controller.selectedMtcAreaFilter.value == key,
                    onTap: () => controller.setMtcAreaFilter(key),
                    compact: true,
                  );
                }).toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDateNavButton({
    required VoidCallback? onPressed,
    required IconData icon,
    required String label,
  }) {
    return SizedBox(
      height: 30,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(68, 30),
          padding: const EdgeInsets.symmetric(horizontal: 7),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          visualDensity: VisualDensity.compact,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15),
            const SizedBox(width: 2),
            Text(
              label,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
    bool compact = false,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 10 : 12,
          vertical: compact ? 6 : 8,
        ),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFDBEAFE) : const Color(0xFFF3F4F6),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? const Color(0xFF1D4ED8) : const Color(0xFFD1D5DB),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? const Color(0xFF1D4ED8) : const Color(0xFF374151),
            fontSize: compact ? 12 : 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _buildSubmissionSummaryCard(DailyControlController controller) {
    final userStatuses = controller.userUpdateStatuses;
    final totalUsers = userStatuses.length;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
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
                  'Status User ${controller.summaryDivisionLabel} : $totalUsers',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                    color: Color(0xFF1F2937),
                  ),
                ),
              ),
            ],
          ),
          if (userStatuses.isNotEmpty) ...[
            const SizedBox(height: 8),
            _buildUserStatusGrid(controller, userStatuses),
          ],
        ],
      ),
    );
  }

  Widget _buildMaintenanceTypeFilterChip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFDBEAFE) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: selected ? const Color(0xFF1D4ED8) : const Color(0xFF6B7280),
          ),
        ),
      ),
    );
  }

  Widget _buildUserStatusGrid(
    DailyControlController controller,
    List<DailyControlUserUpdateStatus> statuses,
  ) {
    final columns = <List<DailyControlUserUpdateStatus>>[];
    for (var index = 0; index < statuses.length; index += 4) {
      final end = (index + 4 < statuses.length) ? index + 4 : statuses.length;
      columns.add(statuses.sublist(index, end));
    }
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: columns.asMap().entries.map((entry) {
          final index = entry.key;
          final column = entry.value;
          return Padding(
            padding:
                EdgeInsets.only(right: index == columns.length - 1 ? 0 : 8),
            child: SizedBox(
              width: 112,
              child: Column(
                children: column.map((item) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: Obx(
                      () {
                        final isSelected =
                            controller.isFeedUserSelected(item.user);
                        return Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: () =>
                                controller.toggleFeedUserFilter(item.user),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? const Color(0xFFDBEAFE)
                                    : const Color(0xFFF8FAFC),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: isSelected
                                      ? const Color(0xFF1D4ED8)
                                      : const Color(0xFFE5E7EB),
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Flexible(
                                    child: Align(
                                      alignment: Alignment.centerLeft,
                                      child: Text(
                                        item.user.preferredDisplayName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w600,
                                          color: isSelected
                                              ? const Color(0xFF1D4ED8)
                                              : const Color(0xFF1F2937),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 2),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 5,
                                      vertical: 1,
                                    ),
                                    decoration: BoxDecoration(
                                      color: item.updateCount > 0
                                          ? const Color(0xFFD1FAE5)
                                          : const Color(0xFFFEE2E2),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Text(
                                      '${item.updateCount}',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w700,
                                        color: item.updateCount > 0
                                            ? const Color(0xFF065F46)
                                            : const Color(0xFF991B1B),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Future<void> _openUserListSheet({
    required String title,
    required List<DailyControlUser> users,
    List<DailyControlUserUpdateStatus> statuses = const [],
  }) async {
    if (users.isEmpty) {
      return;
    }
    final statusMap = <int, int>{};
    final statusNameMap = <String, int>{};
    for (final item in statuses) {
      statusMap[item.user.idUser] = item.updateCount;
      statusNameMap[item.user.name.trim().toUpperCase()] = item.updateCount;
    }
    await showModalBottomSheet<void>(
      context: Get.context!,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.72,
          minChildSize: 0.5,
          maxChildSize: 0.9,
          builder: (context, scrollController) {
            return Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
              ),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '$title (${users.length})',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () => Get.back(),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView.separated(
                      controller: scrollController,
                      itemCount: users.length,
                      separatorBuilder: (_, __) =>
                          const Divider(height: 1, color: Color(0xFFE5E7EB)),
                      itemBuilder: (_, index) {
                        final user = users[index];
                        final updateCount = statusMap[user.idUser] ??
                            statusNameMap[user.name.trim().toUpperCase()] ??
                            0;
                        return ListTile(
                          dense: true,
                          leading: CircleAvatar(
                            radius: 14,
                            backgroundColor: const Color(0xFFEEF2FF),
                            child: Text(
                              user.preferredDisplayName.isNotEmpty
                                  ? user.preferredDisplayName
                                      .substring(0, 1)
                                      .toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF3730A3),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          title: Text(
                            user.preferredDisplayName,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: Text(
                            user.role,
                            style: const TextStyle(fontSize: 12),
                          ),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: updateCount > 0
                                  ? const Color(0xFFD1FAE5)
                                  : const Color(0xFFFEE2E2),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '$updateCount',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: updateCount > 0
                                    ? const Color(0xFF065F46)
                                    : const Color(0xFF991B1B),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildComposerCard(
    DailyControlController controller, {
    bool closeAfterPost = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Update Kegiatan',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: Color(0xFF1f2937),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: controller.activityController,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Tulis kegiatan harian...',
              filled: true,
              fillColor: const Color(0xFFf8fafc),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: controller.titleController,
            decoration: InputDecoration(
              hintText: 'Judul (opsional)',
              filled: true,
              fillColor: const Color(0xFFf8fafc),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Obx(
            () => _buildLookupField(
              label: 'Asset Code',
              value: controller.selectedAsset.value?.label ?? '',
              hint: 'Opsional',
              onTap: controller.pickAsset,
              onClear: controller.selectedAsset.value != null
                  ? controller.clearAsset
                  : null,
              leadingIcon: Icons.precision_manufacturing_outlined,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Cari asset dari data onmcs.',
            style: TextStyle(fontSize: 12, color: Color(0xFF6b7280)),
          ),
          const SizedBox(height: 8),
          Obx(
            () => _buildLookupField(
              label: 'WO Number',
              value: controller.selectedWo.value?.label ?? '',
              hint: 'Opsional',
              onTap: controller.pickWo,
              onClear: controller.selectedWo.value != null
                  ? controller.clearWo
                  : null,
              leadingIcon: Icons.confirmation_number_outlined,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Cari WO, opsional.',
            style: TextStyle(fontSize: 12, color: Color(0xFF6b7280)),
          ),
          const SizedBox(height: 8),
          Obx(
            () => _buildLookupField(
              label: 'Part Mesin',
              value: controller.selectedPart.value?.label ?? '',
              hint: controller.selectedAsset.value == null
                  ? 'Opsional (pilih Asset Code dulu)'
                  : (controller.isPartLoading.value
                      ? 'Memuat part...'
                      : 'Opsional'),
              onTap: controller.pickPart,
              onClear: controller.selectedPart.value != null
                  ? controller.clearPart
                  : null,
              enabled: controller.selectedAsset.value != null,
              leadingIcon: Icons.settings_outlined,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Jika asset memiliki custom detail, part bisa dipilih.',
            style: TextStyle(fontSize: 12, color: Color(0xFF6b7280)),
          ),
          const SizedBox(height: 12),
          Obx(
            () => _buildLookupField(
              label: 'Tag User Follow-up',
              value: controller.selectedTagSummary,
              hint: 'Pilih user follow-up',
              onTap: controller.pickTagUsers,
              onClear: controller.selectedTags.isNotEmpty
                  ? controller.clearTagUsers
                  : null,
              leadingIcon: Icons.group_outlined,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Bisa pilih lebih dari satu user.',
            style: TextStyle(fontSize: 12, color: Color(0xFF6b7280)),
          ),
          Obx(() {
            final selectedUsers = controller.selectedTagUsers;
            if (selectedUsers.isEmpty) {
              return const SizedBox.shrink();
            }
            final previewUsers = selectedUsers.take(3).toList();
            final extraCount = selectedUsers.length - previewUsers.length;
            return Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  ...previewUsers.map((user) {
                    return Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDBEAFE),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        user.preferredDisplayName,
                        style: const TextStyle(
                          color: Color(0xFF1D4ED8),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    );
                  }),
                  if (extraCount > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE5E7EB),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        '+$extraCount user',
                        style: const TextStyle(
                          color: Color(0xFF374151),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
            );
          }),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: controller.isPickingMedia.value
                      ? null
                      : controller.capturePhotoFromCamera,
                  icon: controller.isPickingMedia.value
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.camera_alt_outlined),
                  label: const Text('Foto Kamera'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: controller.isPickingMedia.value
                      ? null
                      : controller.captureVideoFromCamera,
                  icon: const Icon(Icons.videocam_outlined),
                  label: const Text('Video Kamera'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: controller.isPickingMedia.value
                  ? null
                  : controller.pickPhotoFromGalleryForPost,
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Foto Galeri (Multi)'),
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Foto/video bisa dari kamera. Foto post juga bisa pilih dari galeri.',
            style: TextStyle(fontSize: 11, color: Color(0xFF6b7280)),
          ),
          Obx(() {
            final media = controller.draftMedia;
            if (media.isEmpty) {
              return const SizedBox.shrink();
            }
            return Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Column(
                children: media.asMap().entries.map((entry) {
                  final index = entry.key;
                  final item = entry.value;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFE5E7EB)),
                    ),
                    child: Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: item.isImage
                              ? Image.file(
                                  File(item.localPath),
                                  width: 52,
                                  height: 52,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 52,
                                    height: 52,
                                    color: const Color(0xFFE5E7EB),
                                    alignment: Alignment.center,
                                    child:
                                        const Icon(Icons.broken_image_outlined),
                                  ),
                                )
                              : Container(
                                  width: 52,
                                  height: 52,
                                  color: const Color(0xFFE2E8F0),
                                  alignment: Alignment.center,
                                  child: const Icon(
                                    Icons.videocam_rounded,
                                    color: Color(0xFF475569),
                                  ),
                                ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.isImage ? 'Foto' : 'Video',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  color: Color(0xFF111827),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                item.capturedAtLabel,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF6B7280),
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () => controller.removeDraftMediaAt(index),
                          icon: const Icon(
                            Icons.delete_outline_rounded,
                            color: Color(0xFFDC2626),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            );
          }),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: controller.clearComposer,
                  child: const Text('Reset'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: controller.isSaving.value
                      ? null
                      : () async {
                          final success = await controller.submitPost();
                          if (success &&
                              closeAfterPost &&
                              Get.isBottomSheetOpen == true) {
                            Get.back();
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2a5298),
                    foregroundColor: Colors.white,
                  ),
                  icon: controller.isSaving.value
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send_rounded),
                  label: Text(controller.isSaving.value ? 'Saving...' : 'Post'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLookupField({
    required String label,
    required String value,
    required String hint,
    required VoidCallback onTap,
    VoidCallback? onClear,
    bool enabled = true,
    IconData? leadingIcon,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Color(0xFF374151),
          ),
        ),
        const SizedBox(height: 4),
        InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(12),
          child: InputDecorator(
            decoration: InputDecoration(
              filled: true,
              fillColor:
                  enabled ? const Color(0xFFf8fafc) : const Color(0xFFf1f5f9),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              prefixIcon:
                  leadingIcon != null ? Icon(leadingIcon, size: 20) : null,
              suffixIcon: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (onClear != null)
                    IconButton(
                      onPressed: onClear,
                      icon: const Icon(Icons.close, size: 18),
                    ),
                  const Padding(
                    padding: EdgeInsets.only(right: 12),
                    child: Icon(Icons.search),
                  ),
                ],
              ),
            ),
            child: Text(
              value.isNotEmpty ? value : hint,
              style: TextStyle(
                color: value.isNotEmpty
                    ? const Color(0xFF111827)
                    : const Color(0xFF6b7280),
                fontWeight:
                    value.isNotEmpty ? FontWeight.w500 : FontWeight.w400,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActivityCard(DailyControlActivity activity) {
    final controller = Get.find<DailyControlController>();
    final images = activity.media;
    final primaryTitle = _dailyControlPrimaryDetailText(activity);
    final titleSource = activity.title.trim().isNotEmpty
        ? activity.title.trim()
        : activity.notes.trim();
    final secondaryNotes = activity.notes.trim();
    final showSecondaryNotes =
        secondaryNotes.isNotEmpty && secondaryNotes != titleSource;
    final maintenanceKindLabel = _dailyControlMaintenanceKindLabel(
      activity.maintenanceKind,
    );
    final actionLabel = _dailyControlActionLabel(
      activity.maintenanceActionLabel,
    );
    final headerUserName = controller.resolveActivityDisplayName(activity);
    return InkWell(
      onTap: () => _openDetailSheet(activity),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF1D4ED8).withValues(alpha: 0.08),
              blurRadius: 18,
              offset: const Offset(0, 6),
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
                  child: _buildChatFeedSummary(
                    unreadCount: activity.unreadCount,
                    userName: headerUserName,
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (maintenanceKindLabel.isNotEmpty ||
                        actionLabel.isNotEmpty)
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        alignment: WrapAlignment.end,
                        children: [
                          if (actionLabel.isNotEmpty)
                            _buildMetaActionChip(actionLabel),
                          if (maintenanceKindLabel.isNotEmpty)
                            _buildMetaKindChip(maintenanceKindLabel),
                        ],
                      ),
                    if (maintenanceKindLabel.isNotEmpty ||
                        actionLabel.isNotEmpty)
                      const SizedBox(height: 4),
                    Text(
                      activity.time.isNotEmpty
                          ? activity.time.substring(
                              0,
                              activity.time.length >= 5
                                  ? 5
                                  : activity.time.length,
                            )
                          : '-',
                      style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            if (images.isNotEmpty) ...[
              const SizedBox(height: 10),
              _ActivityImagePreview(
                images: images,
                onImageTap: (_) => _openDetailSheet(activity),
              ),
            ],
            if (activity.assetLabel.isNotEmpty ||
                activity.title.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                activity.assetLabel.isNotEmpty
                    ? activity.assetLabel
                    : activity.title,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  color: Color(0xFF111827),
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            if (activity.title.isNotEmpty &&
                activity.assetLabel.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                activity.requestPartLabel.isNotEmpty
                    ? '${activity.title} | ${activity.requestPartLabel}'
                    : activity.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Color(0xFF4B5563),
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ],
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  if (activity.videoCount > 0)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: _buildMetaText(
                          icon: Icons.videocam_outlined,
                          label: '${activity.videoCount} video',
                        ),
                      ),
                    ),
                  const Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.open_in_new_rounded,
                            size: 15,
                            color: Color(0xFF2563EB),
                          ),
                          SizedBox(width: 4),
                          Text(
                            'Tap Untuk Detail & Chat',
                            style: TextStyle(
                              fontSize: 12,
                              color: Color(0xFF2563EB),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openDetailSheet(
    DailyControlActivity activity, {
    int initialImageIndex = 0,
  }) async {
    final controller = Get.find<DailyControlController>();
    final initialActivity = controller.activities.firstWhere(
      (item) => item.id == activity.id,
      orElse: () => activity,
    );
    unawaited(controller.markAsRead(activity.id));
    await showDialog<void>(
      context: Get.context!,
      barrierColor: Colors.black.withValues(alpha: 0.92),
      builder: (_) => _DailyControlPreviewSheet(
        controller: controller,
        activity: initialActivity,
        initialImageIndex: initialImageIndex,
      ),
    );
  }

  Future<void> _openChatSheet(
    DailyControlActivity activity, {
    int initialImageIndex = 0,
    String initialPreviewMessage = '',
  }) async {
    final controller = Get.find<DailyControlController>();
    final initialActivity = controller.activities.firstWhere(
      (item) => item.id == activity.id,
      orElse: () => activity,
    );
    unawaited(controller.markAsRead(activity.id));
    await showDialog<void>(
      context: Get.context!,
      barrierDismissible: false,
      barrierColor: Colors.white,
      builder: (_) => _DailyControlDetailSheet(
        controller: controller,
        activity: initialActivity,
        initialImageIndex: initialImageIndex,
        initialPreviewMessage: initialPreviewMessage,
      ),
    );
  }

  Future<void> _openMediaViewer(
    BuildContext context,
    List<DailyControlMedia> images, {
    int initialIndex = 0,
  }) async {
    if (images.isEmpty) {
      return;
    }
    final pageController = PageController(initialPage: initialIndex);
    final currentIndex = ValueNotifier<int>(initialIndex);
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.88),
      builder: (_) {
        final dragOffset = ValueNotifier<double>(0);
        return ValueListenableBuilder<double>(
          valueListenable: dragOffset,
          builder: (_, offsetY, __) {
            final opacity = (1 - (offsetY / 260)).clamp(0.55, 1.0);
            return GestureDetector(
              onVerticalDragUpdate: (details) {
                final delta = details.primaryDelta ?? 0;
                if (delta > 0) {
                  dragOffset.value = (dragOffset.value + delta).clamp(0, 260);
                }
              },
              onVerticalDragEnd: (_) {
                if (dragOffset.value > 120) {
                  Get.back();
                  return;
                }
                dragOffset.value = 0;
              },
              onVerticalDragCancel: () => dragOffset.value = 0,
              child: Transform.translate(
                offset: Offset(0, offsetY),
                child: Opacity(
                  opacity: opacity,
                  child: Dialog(
                    insetPadding: const EdgeInsets.all(12),
                    backgroundColor: Colors.black,
                    child: Stack(
                      children: [
                        PhotoViewGallery.builder(
                          pageController: pageController,
                          itemCount: images.length,
                          scrollPhysics: const BouncingScrollPhysics(),
                          backgroundDecoration: const BoxDecoration(
                            color: Colors.black,
                          ),
                          onPageChanged: (value) => currentIndex.value = value,
                          builder: (_, index) {
                            final media = images[index];
                            if (media.isVideo) {
                              return PhotoViewGalleryPageOptions.customChild(
                                child: _InlineVideoPlayer(url: media.mediaUrl),
                                minScale: PhotoViewComputedScale.contained,
                                maxScale: PhotoViewComputedScale.contained,
                              );
                            }
                            return PhotoViewGalleryPageOptions(
                              imageProvider: NetworkImage(media.mediaUrl),
                              minScale: PhotoViewComputedScale.contained,
                              maxScale: PhotoViewComputedScale.covered * 4,
                            );
                          },
                          loadingBuilder: (_, __) => const Center(
                            child: CircularProgressIndicator(
                              color: Colors.white,
                            ),
                          ),
                        ),
                        Positioned(
                          left: 108,
                          bottom: 68,
                          child: ValueListenableBuilder<int>(
                            valueListenable: currentIndex,
                            builder: (_, index, __) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.55),
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Text(
                                '${index + 1}/${images.length}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          right: 108,
                          bottom: 66,
                          child: Material(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: const CircleBorder(),
                            child: InkWell(
                              onTap: () => Get.back(),
                              customBorder: const CircleBorder(),
                              child: const Padding(
                                padding: EdgeInsets.all(10),
                                child: Icon(
                                  Icons.close,
                                  color: Colors.white,
                                  size: 28,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
    pageController.dispose();
    currentIndex.dispose();
  }

  Widget _buildInfoChip(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _buildMetaKindChip(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFE0F2FE),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: Color(0xFF0369A1),
          fontSize: 13,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildMetaActionChip(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFECFCCB),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: Color(0xFF3F6212),
          fontSize: 13,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildMetaText({
    required IconData icon,
    required String label,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 15,
          color: const Color(0xFF6B7280),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: Color(0xFF6B7280),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildCommentIconWithBadge({
    required int unreadCount,
  }) {
    final chatCount = unreadCount < 0 ? 0 : unreadCount;
    final hasUnread = chatCount > 0;
    final badgeText = chatCount > 99 ? '99+' : '$chatCount';
    return SizedBox(
      width: 34,
      height: 34,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color:
                  hasUnread ? const Color(0xFFFEE2E2) : const Color(0xFFDBEAFE),
              shape: BoxShape.circle,
            ),
            child: Icon(
              hasUnread
                  ? Icons.notifications_active_rounded
                  : Icons.notifications_none_rounded,
              size: 18,
              color:
                  hasUnread ? const Color(0xFFDC2626) : const Color(0xFF1D4ED8),
            ),
          ),
          if (chatCount > 0)
            Positioned(
              right: -2,
              top: -2,
              child: Container(
                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0xFFDC2626),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white, width: 1.2),
                ),
                child: Text(
                  badgeText,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    height: 1,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildChatFeedSummary({
    required int unreadCount,
    required String userName,
  }) {
    final normalizedUserName = userName.trim();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCommentIconWithBadge(
          unreadCount: unreadCount,
        ),
        if (normalizedUserName.isNotEmpty) ...[
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              normalizedUserName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Color(0xFF111827),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildReaderInfo(List<String> readerNames) {
    if (readerNames.isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Text(
        'Dibaca oleh: ${readerNames.join(', ')}',
        style: const TextStyle(
          fontSize: 12,
          color: Color(0xFF6B7280),
          height: 1.4,
        ),
      ),
    );
  }

  void _tryOpenFromNotification(DailyControlController controller) {
    final pendingId = controller.pendingOpenActivityId.value;
    if (pendingId == null || pendingId <= 0) return;
    if (controller.hasRetriedPendingNotificationOpen.value) return;
    controller.hasRetriedPendingNotificationOpen.value = true;
    final payload = controller.pendingNotificationPayload ?? {};
    final dcId = int.tryParse('${payload['daily_control_id'] ?? pendingId}') ??
        pendingId;
    final now = DateTime.now();
    final date = payload['activity_date']?.toString() ??
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final previewMessage = (payload['latest_unread_message'] ??
            payload['message'] ??
            payload['body'] ??
            '')
        .toString()
        .trim();
    // Buka chat sheet langsung tanpa menunggu load data.
    _openChatSheet(
        DailyControlActivity(
          id: dcId,
          idUser: 0,
          user:
              (payload['sender_name'] ?? payload['latest_unread_sender'] ?? '')
                  .toString(),
          division: '',
          divisionCode: '',
          date: date,
          time: payload['activity_time']?.toString() ?? '',
          title:
              (payload['activity_title'] ?? payload['title'] ?? '').toString(),
          notes: previewMessage,
          assetCode: '',
          assetName: payload['asset_name']?.toString() ?? '',
          partMesin: '',
          woNumber: payload['wo_number']?.toString() ?? '',
          maintenanceKind: '',
          maintenanceActionLabel: '',
          requestPartLabel: '',
          executorCodeRaw: '',
          mesoSubtype: '',
          sourceTable: '',
          mtcAreaKey: '',
          media: const [],
          commentCount: 0,
          unreadCount: 0,
          tags: const [],
          followUps: const [],
          participantUserIds: const [],
          participantNames: const [],
          laborNames: const [],
          readerNames: const [],
          displayFullname:
              (payload['sender_name'] ?? payload['latest_unread_sender'] ?? '')
                  .toString(),
        ),
        initialPreviewMessage: previewMessage);
    controller.clearPendingOpenActivity();
  }
}

class _InlineVideoPlayer extends StatefulWidget {
  const _InlineVideoPlayer({required this.url});
  final String url;

  @override
  State<_InlineVideoPlayer> createState() => _InlineVideoPlayerState();
}

class _InlineVideoPlayerState extends State<_InlineVideoPlayer> {
  late final VideoPlayerController _videoController;
  ChewieController? _chewieController;
  String? _error;

  @override
  void initState() {
    super.initState();
    _videoController = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await _videoController.initialize();
      if (!mounted) return;
      setState(() {
        _chewieController = ChewieController(
          videoPlayerController: _videoController,
          autoPlay: false,
          looping: false,
        );
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'Gagal memutar video: $e');
    }
  }

  @override
  void dispose() {
    _chewieController?.dispose();
    _videoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Center(
        child: Text(_error!, style: const TextStyle(color: Colors.white)),
      );
    }
    if (_chewieController == null) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }
    return Chewie(controller: _chewieController!);
  }
}

class _ActivityImagePreview extends StatefulWidget {
  const _ActivityImagePreview({
    required this.images,
    required this.onImageTap,
  });
  final List<DailyControlMedia> images;
  final ValueChanged<int> onImageTap;
  @override
  State<_ActivityImagePreview> createState() => _ActivityImagePreviewState();
}

class _ActivityImagePreviewState extends State<_ActivityImagePreview> {
  int _currentIndex = 0;
  late List<DailyControlMedia> _visibleImages;
  @override
  void initState() {
    super.initState();
    _visibleImages = List<DailyControlMedia>.from(widget.images);
  }

  @override
  void didUpdateWidget(covariant _ActivityImagePreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.images != widget.images) {
      _visibleImages = List<DailyControlMedia>.from(widget.images);
      if (_currentIndex >= _visibleImages.length) {
        _currentIndex = _visibleImages.isEmpty ? 0 : _visibleImages.length - 1;
      }
    }
  }

  void _handleImageError(DailyControlMedia media) {
    final index = _visibleImages.indexWhere((item) => item.id == media.id);
    if (index < 0) {
      return;
    }
    setState(() {
      _visibleImages.removeAt(index);
      if (_visibleImages.isEmpty) {
        _currentIndex = 0;
      } else if (_currentIndex >= _visibleImages.length) {
        _currentIndex = _visibleImages.length - 1;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final images = _visibleImages;
    if (images.isEmpty) {
      return const SizedBox.shrink();
    }
    return SizedBox(
      height: 165,
      child: Stack(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(
              width: double.infinity,
              height: 165,
              color: const Color(0xFFF3F4F6),
              child: PageView.builder(
                itemCount: images.length,
                onPageChanged: (value) {
                  if (_currentIndex != value) {
                    setState(() => _currentIndex = value);
                  }
                },
                itemBuilder: (context, index) {
                  final media = images[index];
                  return InkWell(
                    onTap: () => widget.onImageTap(index),
                    child: media.isVideo
                        ? Container(
                            width: double.infinity,
                            height: 165,
                            color: Colors.black87,
                            child: const Center(
                              child: Icon(
                                Icons.play_circle_fill,
                                color: Colors.white,
                                size: 48,
                              ),
                            ),
                          )
                        : Image.network(
                            media.mediaUrl,
                            width: double.infinity,
                            height: 165,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) {
                              WidgetsBinding.instance.addPostFrameCallback((_) {
                                if (mounted) {
                                  _handleImageError(media);
                                }
                              });
                              return const SizedBox.shrink();
                            },
                          ),
                  );
                },
              ),
            ),
          ),
          Positioned(
            right: 8,
            bottom: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 8,
                vertical: 5,
              ),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                images.length > 1
                    ? '${_currentIndex + 1}/${images.length}'
                    : '1 foto',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DailyControlDetailSheet extends StatefulWidget {
  final DailyControlController controller;
  final DailyControlActivity activity;
  final int initialImageIndex;
  final String initialPreviewMessage;
  const _DailyControlDetailSheet({
    required this.controller,
    required this.activity,
    this.initialImageIndex = 0,
    this.initialPreviewMessage = '',
  });
  @override
  State<_DailyControlDetailSheet> createState() =>
      _DailyControlDetailSheetState();
}

class _DailyControlPreviewSheet extends StatefulWidget {
  final DailyControlController controller;
  final DailyControlActivity activity;
  final int initialImageIndex;
  const _DailyControlPreviewSheet({
    required this.controller,
    required this.activity,
    this.initialImageIndex = 0,
  });
  @override
  State<_DailyControlPreviewSheet> createState() =>
      _DailyControlPreviewSheetState();
}

class _DailyControlPreviewSheetState extends State<_DailyControlPreviewSheet> {
  late final PageController _mediaController;
  int _mediaIndex = 0;
  double _dragOffsetY = 0;
  @override
  void initState() {
    super.initState();
    _mediaIndex = widget.initialImageIndex;
    _mediaController = PageController(initialPage: widget.initialImageIndex);
  }

  @override
  void dispose() {
    _mediaController.dispose();
    super.dispose();
  }

  String? _resolveWoDetailRoute() {
    final sourceTable = widget.activity.sourceTable.trim().toLowerCase();
    switch (sourceTable) {
      case 'tb_wo_it':
        return AppRoutes.woDetail;
      case 'tb_wo_mtc':
        return AppRoutes.woMtcDetail;
      case 'tb_wo_mtc_operational':
        return AppRoutes.woOperationalDetail;
      case 'tb_wo_preventive':
        return AppRoutes.woProductionDetail;
      case 'tb_wo_ga':
        return AppRoutes.woGaDetail;
    }
    final woNumber = widget.activity.woNumber.trim().toUpperCase();
    if (woNumber.contains('/MTC/')) {
      return AppRoutes.woMtcDetail;
    }
    if (woNumber.contains('/ITS/')) {
      return AppRoutes.woDetail;
    }
    if (woNumber.contains('/GA/')) {
      return AppRoutes.woGaDetail;
    }
    if (woNumber.contains('/PRO/')) {
      return AppRoutes.woProductionDetail;
    }
    return AppRoutes.woOperationalDetail;
  }

  Future<void> _openWoDetail() async {
    final woNumber = widget.activity.woNumber.trim();
    if (woNumber.isEmpty) {
      return;
    }
    final route = _resolveWoDetailRoute();
    if (route == null || route.isEmpty) {
      Get.snackbar(
        'Daily Control',
        'Detail WO untuk item ini belum tersedia.',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFf59e0b),
        colorText: Colors.white,
      );
      return;
    }
    Navigator.of(context).pop();
    await Get.toNamed(
      route,
      arguments: {
        'wo_number': woNumber,
        'open_summary': true,
        'source': 'daily_control',
      },
    );
  }

  Future<void> _openChat() async {
    final activity = widget.activity;
    final controller = widget.controller;
    Navigator.of(context).pop();
    await Future<void>.delayed(const Duration(milliseconds: 120));
    await showDialog<void>(
      context: Get.context!,
      barrierDismissible: false,
      barrierColor: Colors.white,
      builder: (_) => _DailyControlDetailSheet(
        controller: controller,
        activity: activity,
        initialImageIndex: _mediaIndex,
      ),
    );
  }

  Widget _buildInfoChip(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        text,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _buildReaderInfo(List<String> readerNames) {
    if (readerNames.isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Text(
        'Dibaca oleh: ${readerNames.join(', ')}',
        style: const TextStyle(
          fontSize: 12,
          color: Color(0xFF6B7280),
          height: 1.4,
        ),
      ),
    );
  }

  Future<void> _openMediaViewer(
    BuildContext context,
    List<DailyControlMedia> images, {
    int initialIndex = 0,
  }) async {
    if (images.isEmpty) {
      return;
    }
    final pageController = PageController(initialPage: initialIndex);
    final currentIndex = ValueNotifier<int>(initialIndex);
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.88),
      builder: (_) {
        final dragOffset = ValueNotifier<double>(0);
        return ValueListenableBuilder<double>(
          valueListenable: dragOffset,
          builder: (_, offsetY, __) {
            final opacity = (1 - (offsetY / 260)).clamp(0.55, 1.0);
            return GestureDetector(
              onVerticalDragUpdate: (details) {
                final delta = details.primaryDelta ?? 0;
                if (delta > 0) {
                  dragOffset.value = (dragOffset.value + delta).clamp(0, 260);
                }
              },
              onVerticalDragEnd: (_) {
                if (dragOffset.value > 120) {
                  Get.back();
                  return;
                }
                dragOffset.value = 0;
              },
              onVerticalDragCancel: () => dragOffset.value = 0,
              child: Transform.translate(
                offset: Offset(0, offsetY),
                child: Opacity(
                  opacity: opacity,
                  child: Dialog(
                    insetPadding: const EdgeInsets.all(12),
                    backgroundColor: Colors.black,
                    child: Stack(
                      children: [
                        PhotoViewGallery.builder(
                          pageController: pageController,
                          itemCount: images.length,
                          scrollPhysics: const BouncingScrollPhysics(),
                          backgroundDecoration: const BoxDecoration(
                            color: Colors.black,
                          ),
                          onPageChanged: (value) => currentIndex.value = value,
                          builder: (_, index) {
                            final media = images[index];
                            if (media.isVideo) {
                              return PhotoViewGalleryPageOptions.customChild(
                                child: _InlineVideoPlayer(url: media.mediaUrl),
                                minScale: PhotoViewComputedScale.contained,
                                maxScale: PhotoViewComputedScale.contained,
                              );
                            }
                            return PhotoViewGalleryPageOptions(
                              imageProvider: NetworkImage(media.mediaUrl),
                              minScale: PhotoViewComputedScale.contained,
                              maxScale: PhotoViewComputedScale.covered * 4,
                            );
                          },
                          loadingBuilder: (_, __) => const Center(
                            child: CircularProgressIndicator(
                              color: Colors.white,
                            ),
                          ),
                        ),
                        Positioned(
                          left: 124,
                          bottom: 68,
                          child: ValueListenableBuilder<int>(
                            valueListenable: currentIndex,
                            builder: (_, index, __) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.55),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Text(
                                '${index + 1}/${images.length}',
                                style: const TextStyle(color: Colors.white),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          right: 124,
                          bottom: 66,
                          child: Material(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: const CircleBorder(),
                            child: InkWell(
                              onTap: () => Get.back(),
                              customBorder: const CircleBorder(),
                              child: const Padding(
                                padding: EdgeInsets.all(8),
                                child: Icon(
                                  Icons.close,
                                  color: Colors.white,
                                  size: 28,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
    pageController.dispose();
    currentIndex.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activity = widget.activity;
    final images = activity.media;
    final primaryTitle = _dailyControlPrimaryDetailText(activity);
    final titleSource = activity.title.trim().isNotEmpty
        ? activity.title.trim()
        : activity.notes.trim();
    final secondaryNotes = activity.notes.trim();
    final showSecondaryNotes =
        secondaryNotes.isNotEmpty && secondaryNotes != titleSource;
    return GestureDetector(
      onVerticalDragUpdate: (details) {
        final delta = details.primaryDelta ?? 0;
        if (delta > 0) {
          setState(() {
            _dragOffsetY = (_dragOffsetY + delta).clamp(0, 260);
          });
        }
      },
      onVerticalDragEnd: (_) {
        if (_dragOffsetY > 120) {
          Get.back();
          return;
        }
        setState(() {
          _dragOffsetY = 0;
        });
      },
      onVerticalDragCancel: () {
        setState(() {
          _dragOffsetY = 0;
        });
      },
      child: Transform.translate(
        offset: Offset(0, _dragOffsetY),
        child: Opacity(
          opacity: (1 - (_dragOffsetY / 260)).clamp(0.55, 1.0),
          child: Material(
            color: Colors.transparent,
            child: SafeArea(
              child: Container(
                color: Colors.black,
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: images.isEmpty
                          ? const Center(
                              child: Icon(
                                Icons.broken_image_outlined,
                                color: Colors.white54,
                                size: 44,
                              ),
                            )
                          : PhotoViewGallery.builder(
                              pageController: _mediaController,
                              itemCount: images.length,
                              scrollPhysics: const BouncingScrollPhysics(),
                              backgroundDecoration: const BoxDecoration(
                                color: Colors.black,
                              ),
                              onPageChanged: (value) {
                                setState(() => _mediaIndex = value);
                              },
                              builder: (_, index) {
                                final media = images[index];
                                final heroTag =
                                    'daily_control_preview_${widget.activity.id}_$index';
                                if (media.isVideo) {
                                  return PhotoViewGalleryPageOptions.customChild(
                                    child: _InlineVideoPlayer(
                                      url: media.mediaUrl,
                                    ),
                                    minScale: PhotoViewComputedScale.contained,
                                    maxScale: PhotoViewComputedScale.contained,
                                    heroAttributes:
                                        PhotoViewHeroAttributes(tag: heroTag),
                                  );
                                }
                                return PhotoViewGalleryPageOptions(
                                  imageProvider: NetworkImage(media.mediaUrl),
                                  minScale: PhotoViewComputedScale.contained,
                                  maxScale: PhotoViewComputedScale.covered * 4,
                                  basePosition: Alignment.topCenter,
                                  tightMode: true,
                                  heroAttributes:
                                      PhotoViewHeroAttributes(tag: heroTag),
                                );
                              },
                              loadingBuilder: (_, __) => const Center(
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                ),
                              ),
                            ),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.black.withValues(alpha: 0.0),
                              Colors.black.withValues(alpha: 0.78),
                            ],
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    widget.controller
                                        .resolveActivityDisplayName(activity),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                Text(
                                  activity.time.isNotEmpty
                                      ? _dailyControlCompactTime(activity.time)
                                      : '-',
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              activity.division,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                              ),
                            ),
                            if (primaryTitle.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Text(
                                primaryTitle,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  height: 1.3,
                                ),
                              ),
                            ],
                            if (showSecondaryNotes) ...[
                              const SizedBox(height: 6),
                              Text(
                                secondaryNotes,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 12,
                                  height: 1.35,
                                ),
                              ),
                            ],
                            if (activity.partMesin.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              _buildInfoChip(
                                activity.partMesin,
                                Colors.white.withValues(alpha: 0.14),
                                Colors.white,
                              ),
                            ],
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                Container(
                                  constraints:
                                      const BoxConstraints(minWidth: 48),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 10,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.22),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color:
                                          Colors.white.withValues(alpha: 0.18),
                                    ),
                                  ),
                                  child: Text(
                                    '${_mediaIndex + 1}/${images.isEmpty ? 1 : images.length}',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: _openChat,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF2563EB),
                                      foregroundColor: Colors.white,
                                      minimumSize: const Size.fromHeight(42),
                                      padding: EdgeInsets.zero,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                    ),
                                    child: const Icon(
                                      Icons.chat_bubble_outline_rounded,
                                      size: 20,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () => Get.back(),
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: Colors.white,
                                      side: BorderSide(
                                        color: Colors.white
                                            .withValues(alpha: 0.55),
                                      ),
                                      minimumSize: const Size.fromHeight(42),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                    ),
                                    child: const Text(
                                      'Close',
                                      style: TextStyle(
                                          fontWeight: FontWeight.w700),
                                    ),
                                  ),
                                ),
                                if (activity.woNumber.isNotEmpty) ...[
                                  const SizedBox(width: 8),
                                  SizedBox(
                                    width: 44,
                                    height: 42,
                                    child: OutlinedButton(
                                      onPressed: _openWoDetail,
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: Colors.white,
                                        side: BorderSide(
                                          color: Colors.white
                                              .withValues(alpha: 0.55),
                                        ),
                                        padding: EdgeInsets.zero,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12),
                                        ),
                                      ),
                                      child: const Icon(
                                        Icons.open_in_new_rounded,
                                        size: 18,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 8),
                            _buildReaderInfo(activity.readerNames),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DailyControlDetailSheetState extends State<_DailyControlDetailSheet> {
  final TextEditingController _inputController = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  late final PageController _mediaController;
  final List<File> _commentMediaFiles = [];
  List<DailyControlComment> _comments = [];
  bool _isLoading = true;
  bool _isSaving = false;
  int _mediaIndex = 0;
  int? _replyParentId;
  String _replyParentName = '';
  int _currentUserId = 0;
  int _localCommentSeed = -1;
  List<DailyControlPartMention> _partMentions = [];
  List<DailyControlPartMention> _visiblePartMentions = [];
  List<DailyControlUser> _visibleUserMentions = [];
  bool _isMentionLoading = false;
  bool _showMentionSuggestions = false;
  int? _mentionStartIndex;
  String? _mentionTrigger;
  double _dragOffsetY = 0;
  late DailyControlActivity _activity;
  @override
  void initState() {
    super.initState();
    _activity = widget.activity;
    _mediaIndex = widget.initialImageIndex;
    _mediaController = PageController(initialPage: widget.initialImageIndex);
    final previewMessage = widget.initialPreviewMessage.trim();
    if (previewMessage.isNotEmpty) {
      _comments = [
        DailyControlComment(
          id: -1,
          parentId: 0,
          dailyControlId: _activity.id,
          idUser: _activity.idUser,
          fullname: _activity.user.trim().isEmpty ? 'Pengirim' : _activity.user,
          divisionName: _activity.division,
          message: previewMessage,
          createdAt: '${_activity.date} ${_activity.time}'.trim(),
          media: const [],
          replies: const [],
        ),
      ];
      _isLoading = false;
    }
    _inputController.addListener(_handleComposerChanged);
    _focusNode.addListener(_handleComposerChanged);
    _loadCurrentUserId();
    _loadComments();
    _loadPartMentions();
    _listenForActivityUpdate();
  }

  void _listenForActivityUpdate() {
    // Update activity saat data lengkap selesai dimuat.
    ever(widget.controller.activities, (_) {
      final updated = widget.controller.findActivityById(_activity.id);
      if (updated != null && mounted) {
        setState(() {
          _activity = updated;
        });
      }
    });
  }

  Future<void> _loadCurrentUserId() async {
    final prefs = await SharedPreferences.getInstance();
    final savedIntId = prefs.getInt('id_user');
    final savedStringId = prefs.getString('user_id');
    final resolvedUserId =
        savedIntId ?? int.tryParse((savedStringId ?? '').trim()) ?? 0;
    if (mounted) {
      setState(() {
        _currentUserId = resolvedUserId;
      });
    }
  }

  Widget _buildReaderInfo(List<String> readerNames) {
    if (readerNames.isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Text(
        'Dibaca oleh: ${readerNames.join(', ')}',
        style: const TextStyle(
          fontSize: 12,
          color: Color(0xFF6B7280),
          height: 1.4,
        ),
      ),
    );
  }

  @override
  void dispose() {
    _focusNode.removeListener(_handleComposerChanged);
    _inputController.removeListener(_handleComposerChanged);
    _inputController.dispose();
    _focusNode.dispose();
    _mediaController.dispose();
    super.dispose();
  }

  Future<void> _loadComments() async {
    // Ambil hanya dari memori terlebih dahulu. getComments(useCache: true)
    // tetap melakukan request bila cache belum ada, sehingga sebelumnya chat
    // dapat menunggu dua request API berturut-turut.
    final cached = widget.controller.getCachedComments(_activity.id);
    if (cached != null) {
      setState(() {
        _comments = cached;
        _isLoading = false;
      });
      unawaited(_refreshCommentsFromServer());
      return;
    }

    final hasPreview = _comments.isNotEmpty;
    if (!hasPreview) {
      setState(() => _isLoading = true);
    }
    try {
      final fresh = await widget.controller.getComments(
        _activity.id,
        useCache: false,
      );
      if (!mounted) return;
      setState(() {
        _comments = fresh;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _refreshCommentsFromServer() async {
    try {
      final fresh = await widget.controller.getComments(
        _activity.id,
        useCache: false,
      );
      if (!mounted) return;
      if (fresh.isNotEmpty) {
        setState(() {
          _comments = fresh;
        });
      }
    } catch (_) {}
  }

  Future<void> _loadPartMentions() async {
    if (_activity.id <= 0 || _activity.woNumber.trim().isEmpty) {
      return;
    } // Pakai cache dulu
    final cached = await widget.controller.getPartMentions(
      _activity.id,
      useCache: true,
    );
    if (!mounted) return;
    if (cached.isNotEmpty) {
      setState(() {
        _partMentions = cached;
        _isMentionLoading = false;
      });
      _refreshMentionSuggestions();
    } // Refresh dari server di background
    try {
      final fresh = await widget.controller.getPartMentions(
        _activity.id,
        useCache: false,
      );
      if (!mounted) return;
      setState(() {
        _partMentions = fresh;
        _isMentionLoading = false;
      });
      _refreshMentionSuggestions();
    } catch (_) {
      if (!mounted) return;
      setState(() => _isMentionLoading = false);
    }
  }

  String? _resolveWoDetailRoute() {
    final sourceTable = _activity.sourceTable.trim().toLowerCase();
    switch (sourceTable) {
      case 'tb_wo_it':
        return AppRoutes.woDetail;
      case 'tb_wo_mtc':
        return AppRoutes.woMtcDetail;
      case 'tb_wo_mtc_operational':
        return AppRoutes.woOperationalDetail;
      case 'tb_wo_preventive':
        return AppRoutes.woProductionDetail;
      case 'tb_wo_ga':
        return AppRoutes.woGaDetail;
    }
    final woNumber = _activity.woNumber.trim().toUpperCase();
    if (woNumber.contains('/MTC/')) {
      return AppRoutes.woMtcDetail;
    }
    if (woNumber.contains('/ITS/')) {
      return AppRoutes.woDetail;
    }
    if (woNumber.contains('/GA/')) {
      return AppRoutes.woGaDetail;
    }
    if (woNumber.contains('/PRO/')) {
      return AppRoutes.woProductionDetail;
    }
    return AppRoutes.woOperationalDetail;
  }

  Future<void> _openWoDetail() async {
    final woNumber = _activity.woNumber.trim();
    if (woNumber.isEmpty) {
      return;
    }
    final route = _resolveWoDetailRoute();
    if (route == null || route.isEmpty) {
      Get.snackbar(
        'Daily Control',
        'Detail WO untuk item ini belum tersedia.',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFf59e0b),
        colorText: Colors.white,
      );
      return;
    }
    Navigator.of(context).pop();
    await Get.toNamed(
      route,
      arguments: {
        'wo_number': woNumber,
        'open_summary': true,
        'source': 'daily_control',
      },
    );
  }

  void _handleComposerChanged() {
    _refreshMentionSuggestions();
  }

  void _refreshMentionSuggestions() {
    final query = _resolveMentionQuery();
    if (query == null || !_focusNode.hasFocus) {
      if (_showMentionSuggestions ||
          _mentionStartIndex != null ||
          _mentionTrigger != null) {
        setState(() {
          _showMentionSuggestions = false;
          _visiblePartMentions = [];
          _visibleUserMentions = [];
          _mentionStartIndex = null;
          _mentionTrigger = null;
        });
      }
      return;
    }
    final keyword = query.$3.trim().toLowerCase();
    if (query.$2 == '@') {
      final users = widget.controller.teamUsers
          .where((user) {
            final haystack = [
              user.alias,
              user.name,
              user.fullname,
              user.role,
            ].join(' ').toLowerCase();
            return keyword.isEmpty || haystack.contains(keyword);
          })
          .take(8)
          .toList();
      setState(() {
        _mentionStartIndex = query.$1;
        _mentionTrigger = '@';
        _visibleUserMentions = users;
        _visiblePartMentions = [];
        _showMentionSuggestions = users.isNotEmpty;
      });
      return;
    }
    final matches = _partMentions
        .where((item) {
          final haystack = [
            item.partName,
            item.sectionName,
            item.scheduleType,
            item.maintenanceStatus,
            item.notes,
          ].join(' ').toLowerCase();
          return keyword.isEmpty || haystack.contains(keyword);
        })
        .take(8)
        .toList();
    setState(() {
      _mentionStartIndex = query.$1;
      _mentionTrigger = '#';
      _visiblePartMentions = matches;
      _visibleUserMentions = [];
      _showMentionSuggestions = _isMentionLoading || matches.isNotEmpty;
    });
  }

  (int, String, String)? _resolveMentionQuery() {
    final text = _inputController.text;
    final selection = _inputController.selection;
    final cursor = selection.isValid
        ? selection.baseOffset.clamp(0, text.length).toInt()
        : text.length;
    if (cursor < 0 || cursor > text.length) {
      return null;
    }
    final typed = text.substring(0, cursor);
    final atIndex = typed.lastIndexOf('@');
    final hashIndex = typed.lastIndexOf('#');
    final startIndex = atIndex > hashIndex ? atIndex : hashIndex;
    if (startIndex < 0) {
      return null;
    }
    final trigger = typed[startIndex];
    if (startIndex > 0) {
      final beforeTrigger = typed[startIndex - 1];
      if (!RegExp(r'[\s(\[]').hasMatch(beforeTrigger)) {
        return null;
      }
    }
    final query = typed.substring(startIndex + 1);
    if (query.contains(RegExp(r'\s'))) {
      return null;
    }
    return (startIndex, trigger, query);
  }

  void _insertPartMention(DailyControlPartMention item) {
    final text = _inputController.text;
    final selection = _inputController.selection;
    final cursor = selection.isValid
        ? selection.baseOffset.clamp(0, text.length).toInt()
        : text.length;
    final mentionStart = _mentionStartIndex;
    if (mentionStart == null || mentionStart < 0 || mentionStart > cursor) {
      return;
    }
    final before = text.substring(0, mentionStart);
    final after = text.substring(cursor);
    final mentionText = item.mentionText.trim().isNotEmpty
        ? item.mentionText.trim()
        : item.partName.trim();
    final normalizedMention =
        mentionText.startsWith('#') ? mentionText : '#$mentionText';
    final insertText = '$normalizedMention ';
    final nextText = '$before$insertText$after';
    final nextCursor = (before + insertText).length;
    _inputController.value = TextEditingValue(
      text: nextText,
      selection: TextSelection.collapsed(offset: nextCursor),
    );
    setState(() {
      _showMentionSuggestions = false;
      _visiblePartMentions = [];
      _visibleUserMentions = [];
      _mentionStartIndex = null;
      _mentionTrigger = null;
    });
    _focusNode.requestFocus();
  }

  void _insertUserMention(DailyControlUser user) {
    final text = _inputController.text;
    final selection = _inputController.selection;
    final cursor = selection.isValid
        ? selection.baseOffset.clamp(0, text.length).toInt()
        : text.length;
    final mentionStart = _mentionStartIndex;
    if (mentionStart == null || mentionStart < 0 || mentionStart > cursor) {
      return;
    }
    final before = text.substring(0, mentionStart);
    final after = text.substring(cursor);
    final alias = user.alias.trim().isNotEmpty ? user.alias.trim() : user.name;
    final insertText = '@$alias ';
    final nextText = '$before$insertText$after';
    final nextCursor = (before + insertText).length;
    _inputController.value = TextEditingValue(
      text: nextText,
      selection: TextSelection.collapsed(offset: nextCursor),
    );
    setState(() {
      _showMentionSuggestions = false;
      _visiblePartMentions = [];
      _visibleUserMentions = [];
      _mentionStartIndex = null;
      _mentionTrigger = null;
    });
    _focusNode.requestFocus();
  }

  Future<void> _pickCommentImage({required bool fromCamera}) async {
    if (_isSaving) {
      return;
    }
    if (_commentMediaFiles.length >= 6) {
      Get.snackbar(
        'Daily Control',
        'Maksimal 6 foto per komentar.',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFf59e0b),
        colorText: Colors.white,
      );
      return;
    }
    final picked = fromCamera
        ? await DailyControlImageEditorHelper.pickEditedImageFromCamera()
        : await DailyControlImageEditorHelper.pickEditedImageFromGallery();
    if (picked == null) {
      return;
    }
    if (!mounted) {
      return;
    }
    setState(() {
      _commentMediaFiles.add(picked);
    });
  }

  Future<void> _submitComment() async {
    final message = _inputController.text.trim();
    if ((message.isEmpty && _commentMediaFiles.isEmpty) || _isSaving) {
      return;
    }
    final parentId = _replyParentId;
    final mediaFiles = List<File>.from(_commentMediaFiles);
    final tempComment = DailyControlComment(
      id: _localCommentSeed--,
      parentId: parentId ?? 0,
      dailyControlId: _activity.id,
      idUser: _currentUserId,
      fullname: 'Anda',
      divisionName: '',
      message: message,
      createdAt: DateTime.now().toIso8601String(),
      media: mediaFiles
          .map(
            (file) => DailyControlMedia(
              id: 0,
              mediaType: 'image',
              mediaName: file.path.split(RegExp(r'[\\/]')).last,
              mediaPath: file.path,
              mediaUrl: file.path,
            ),
          )
          .toList(),
      replies: const [],
      localStatus: 'pending',
    );
    setState(() {
      _insertCommentIntoTree(tempComment);
      _inputController.clear();
      _replyParentId = null;
      _replyParentName = '';
      _commentMediaFiles.clear();
    });
    setState(() => _isSaving = true);
    try {
      final result = await widget.controller.createComment(
        dailyControlId: _activity.id,
        message: message,
        parentId: parentId,
        mediaFilePaths: mediaFiles.map((e) => e.path).toList(),
      );
      if (result == null) {
        throw Exception('Gagal menyimpan komentar');
      }
      if (!mounted) return;
      setState(() {
        _comments = _replaceCommentById(_comments, tempComment.id, result);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _comments = _updateCommentStatus(_comments, tempComment.id, 'failed');
      });
      Get.snackbar(
        'Daily Control',
        'Gagal kirim komentar: $e',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: const Color(0xFFdc2626),
        colorText: Colors.white,
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  void _insertCommentIntoTree(DailyControlComment comment) {
    if (comment.parentId <= 0) {
      _comments = [..._comments, comment];
      return;
    }
    _comments = _appendReply(_comments, comment);
  }

  List<DailyControlComment> _replaceCommentById(
    List<DailyControlComment> items,
    int targetId,
    DailyControlComment replacement,
  ) {
    return items.map((item) {
      if (item.id == targetId) {
        return replacement;
      }
      if (item.replies.isEmpty) {
        return item;
      }
      return item.copyWith(
        replies: _replaceCommentById(item.replies, targetId, replacement),
      );
    }).toList();
  }

  List<DailyControlComment> _updateCommentStatus(
    List<DailyControlComment> items,
    int targetId,
    String status,
  ) {
    return items.map((item) {
      if (item.id == targetId) {
        return item.copyWith(localStatus: status);
      }
      if (item.replies.isEmpty) {
        return item;
      }
      return item.copyWith(
        replies: _updateCommentStatus(item.replies, targetId, status),
      );
    }).toList();
  }

  List<DailyControlComment> _appendReply(
    List<DailyControlComment> items,
    DailyControlComment reply,
  ) {
    return items.map((item) {
      if (item.id == reply.parentId) {
        return DailyControlComment(
          id: item.id,
          parentId: item.parentId,
          dailyControlId: item.dailyControlId,
          idUser: item.idUser,
          fullname: item.fullname,
          divisionName: item.divisionName,
          message: item.message,
          createdAt: item.createdAt,
          media: item.media,
          replies: [...item.replies, reply],
        );
      }
      if (item.replies.isEmpty) {
        return item;
      }
      return DailyControlComment(
        id: item.id,
        parentId: item.parentId,
        dailyControlId: item.dailyControlId,
        idUser: item.idUser,
        fullname: item.fullname,
        divisionName: item.divisionName,
        message: item.message,
        createdAt: item.createdAt,
        media: item.media,
        replies: _appendReply(item.replies, reply),
      );
    }).toList();
  }

  Widget _buildCommentNode(DailyControlComment comment, {int depth = 0}) {
    final isMe = comment.idUser == _currentUserId;
    final timeLabel = comment.createdAt.length >= 16
        ? comment.createdAt.substring(11, 16)
        : comment.createdAt;
    final maxBubbleWidth = MediaQuery.of(context).size.width * 0.72;
    final hasOtherReader = _activity.readerNames.any(
      (item) =>
          item.trim().isNotEmpty && item.trim() != comment.fullname.trim(),
    );
    final bubbleColor = isMe ? const Color(0xFFDCF8C6) : Colors.white;
    final bubbleRadius = isMe
        ? const BorderRadius.only(
            topLeft: Radius.circular(12),
            topRight: Radius.circular(12),
            bottomLeft: Radius.circular(12),
            bottomRight: Radius.circular(4),
          )
        : const BorderRadius.only(
            topLeft: Radius.circular(12),
            topRight: Radius.circular(12),
            bottomLeft: Radius.circular(4),
            bottomRight: Radius.circular(12),
          );
    Widget bubble = Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxBubbleWidth),
        child: IntrinsicWidth(
          child: Container(
            margin: EdgeInsets.only(
              left: isMe ? 44 : depth * 10.0,
              right: isMe ? depth * 10.0 : 44,
              bottom: 8,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: bubbleRadius,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 4,
                  offset: const Offset(0, 1),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!isMe) ...[
                  Text(
                    comment.fullname,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: Color(0xFF1F2937),
                    ),
                  ),
                  const SizedBox(height: 6),
                ],
                Text(
                  comment.message,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF111827),
                    height: 1.4,
                  ),
                ),
                if (comment.imageMedia.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: comment.imageMedia.asMap().entries.map((entry) {
                      final mediaIndex = entry.key;
                      final media = entry.value;
                      return InkWell(
                        onTap: () => _openMediaViewer(
                          context,
                          comment.imageMedia,
                          initialIndex: mediaIndex,
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: media.mediaUrl.startsWith('http')
                              ? Image.network(
                                  media.mediaUrl,
                                  width: 120,
                                  height: 120,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 120,
                                    height: 120,
                                    color: const Color(0xFFE5E7EB),
                                    alignment: Alignment.center,
                                    child: const Icon(
                                      Icons.broken_image_outlined,
                                      size: 24,
                                      color: Color(0xFF6B7280),
                                    ),
                                  ),
                                )
                              : Image.file(
                                  File(media.mediaUrl),
                                  width: 120,
                                  height: 120,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 120,
                                    height: 120,
                                    color: const Color(0xFFE5E7EB),
                                    alignment: Alignment.center,
                                    child: const Icon(
                                      Icons.broken_image_outlined,
                                      size: 24,
                                      color: Color(0xFF6B7280),
                                    ),
                                  ),
                                ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
                const SizedBox(height: 4),
                Align(
                  alignment:
                      isMe ? Alignment.centerRight : Alignment.centerLeft,
                  child: Row(
                    mainAxisAlignment:
                        isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (comment.isPending)
                        const Padding(
                          padding: EdgeInsets.only(right: 4),
                          child: SizedBox(
                            width: 10,
                            height: 10,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.5,
                              color: Color(0xFF9CA3AF),
                            ),
                          ),
                        )
                      else if (comment.isFailed)
                        const Padding(
                          padding: EdgeInsets.only(right: 4),
                          child: Icon(
                            Icons.error_outline,
                            size: 14,
                            color: Color(0xFFDC2626),
                          ),
                        ),
                      Text(
                        timeLabel,
                        style: TextStyle(
                          fontSize: 11,
                          color: comment.isFailed
                              ? const Color(0xFFDC2626)
                              : const Color(0xFF9CA3AF),
                        ),
                      ),
                      if (isMe && !comment.isPending && !comment.isFailed) ...[
                        const SizedBox(width: 4),
                        Icon(
                          hasOtherReader ? Icons.done_all : Icons.done,
                          size: 15,
                          color: hasOtherReader
                              ? const Color(0xFF2563EB)
                              : const Color(0xFF9CA3AF),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return Dismissible(
      key: Key('comment_${comment.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        color: const Color(0xFF2563EB),
        child: const Icon(
          Icons.reply,
          color: Colors.white,
          size: 28,
        ),
      ),
      confirmDismiss: (direction) async {
        setState(() {
          _replyParentId = comment.id;
          _replyParentName = comment.fullname;
        });
        _focusNode.requestFocus();
        return false;
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          bubble,
          if (comment.replies.isNotEmpty) ...[
            Padding(
              padding: EdgeInsets.only(
                left: isMe ? 0 : 16,
                right: isMe ? 16 : 0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: comment.replies.map((item) {
                  return _buildCommentNode(item, depth: depth + 1);
                }).toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDetailHeader() {
    final activity = widget.activity;
    final images = activity.media;
    final primaryTitle = _dailyControlPrimaryDetailText(activity);
    final displayName = widget.controller.resolveActivityDisplayName(activity);
    final compactSubtitle =
        displayName.isNotEmpty ? displayName : activity.division.trim();
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (images.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child:
                  images[_mediaIndex.clamp(0, images.length - 1)].isVideo
                      ? Container(
                          width: 44,
                          height: 44,
                          color: Colors.black87,
                          alignment: Alignment.center,
                          child: const Icon(
                            Icons.play_circle_fill,
                            size: 20,
                            color: Colors.white,
                          ),
                        )
                      : Image.network(
                          images[_mediaIndex.clamp(0, images.length - 1)]
                              .mediaUrl,
                          width: 44,
                          height: 44,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            width: 44,
                            height: 44,
                            color: const Color(0xFFE5E7EB),
                            alignment: Alignment.center,
                            child: const Icon(
                              Icons.image_not_supported_outlined,
                              size: 18,
                              color: Color(0xFF6B7280),
                            ),
                          ),
                        ),
            )
          else
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: const Color(0xFFE5E7EB),
                borderRadius: BorderRadius.circular(10),
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.image_outlined,
                size: 18,
                color: Color(0xFF6B7280),
              ),
            ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  primaryTitle.isNotEmpty ? primaryTitle : '-',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: Color(0xFF111827),
                    height: 1.25,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  compactSubtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF6B7280),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (activity.time.isNotEmpty)
                Text(
                  _dailyControlCompactTime(activity.time),
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF6B7280),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              if (activity.woNumber.isNotEmpty) ...[
                const SizedBox(height: 6),
                InkWell(
                  onTap: _openWoDetail,
                  borderRadius: BorderRadius.circular(999),
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Icon(
                      Icons.open_in_new_rounded,
                      size: 16,
                      color: Color(0xFF2563EB),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildInfoChip(
    String text,
    Color bg,
    Color fg,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        text,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }

  Future<void> _openMediaViewer(
    BuildContext context,
    List<DailyControlMedia> images, {
    int initialIndex = 0,
  }) async {
    if (images.isEmpty) {
      return;
    }
    final pageController = PageController(initialPage: initialIndex);
    final currentIndex = ValueNotifier<int>(initialIndex);
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.88),
      builder: (_) {
        final dragOffset = ValueNotifier<double>(0);
        return ValueListenableBuilder<double>(
          valueListenable: dragOffset,
          builder: (_, offsetY, __) {
            final opacity = (1 - (offsetY / 260)).clamp(0.55, 1.0);
            return GestureDetector(
              onVerticalDragUpdate: (details) {
                final delta = details.primaryDelta ?? 0;
                if (delta > 0) {
                  dragOffset.value = (dragOffset.value + delta).clamp(0, 260);
                }
              },
              onVerticalDragEnd: (_) {
                if (dragOffset.value > 120) {
                  Get.back();
                  return;
                }
                dragOffset.value = 0;
              },
              onVerticalDragCancel: () => dragOffset.value = 0,
              child: Transform.translate(
                offset: Offset(0, offsetY),
                child: Opacity(
                  opacity: opacity,
                  child: Dialog(
                    insetPadding: const EdgeInsets.all(12),
                    backgroundColor: Colors.black,
                    child: Stack(
                      children: [
                        PhotoViewGallery.builder(
                          pageController: pageController,
                          itemCount: images.length,
                          scrollPhysics: const BouncingScrollPhysics(),
                          backgroundDecoration: const BoxDecoration(
                            color: Colors.black,
                          ),
                          onPageChanged: (value) => currentIndex.value = value,
                          builder: (_, index) {
                            final media = images[index];
                            if (media.isVideo) {
                              return PhotoViewGalleryPageOptions.customChild(
                                child: _InlineVideoPlayer(url: media.mediaUrl),
                                minScale: PhotoViewComputedScale.contained,
                                maxScale: PhotoViewComputedScale.contained,
                              );
                            }
                            return PhotoViewGalleryPageOptions(
                              imageProvider: NetworkImage(media.mediaUrl),
                              minScale: PhotoViewComputedScale.contained,
                              maxScale: PhotoViewComputedScale.covered * 4,
                            );
                          },
                          loadingBuilder: (_, __) => const Center(
                            child: CircularProgressIndicator(
                              color: Colors.white,
                            ),
                          ),
                        ),
                        Positioned(
                          left: 108,
                          bottom: 68,
                          child: ValueListenableBuilder<int>(
                            valueListenable: currentIndex,
                            builder: (_, index, __) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.55),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Text(
                                '${index + 1}/${images.length}',
                                style: const TextStyle(color: Colors.white),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          right: 108,
                          bottom: 66,
                          child: Material(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: const CircleBorder(),
                            child: InkWell(
                              onTap: () => Get.back(),
                              customBorder: const CircleBorder(),
                              child: const Padding(
                                padding: EdgeInsets.all(8),
                                child: Icon(
                                  Icons.close,
                                  color: Colors.white,
                                  size: 28,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
    pageController.dispose();
    currentIndex.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: true,
      initialChildSize: 1.0,
      minChildSize: 1.0,
      maxChildSize: 1.0,
      builder: (context, scrollController) {
        final safeBottom = MediaQuery.of(context).padding.bottom;
        final keyboardInset = MediaQuery.of(context).viewInsets.bottom;
        return GestureDetector(
          onVerticalDragUpdate: (details) {
            final delta = details.primaryDelta ?? 0;
            if (delta > 0) {
              setState(() {
                _dragOffsetY = (_dragOffsetY + delta).clamp(0, 260);
              });
            }
          },
          onVerticalDragEnd: (_) {
            if (_dragOffsetY > 120) {
              Get.back();
              return;
            }
            setState(() {
              _dragOffsetY = 0;
            });
          },
          onVerticalDragCancel: () {
            setState(() {
              _dragOffsetY = 0;
            });
          },
          child: Transform.translate(
            offset: Offset(0, _dragOffsetY),
            child: Opacity(
              opacity: (1 - (_dragOffsetY / 260)).clamp(0.55, 1.0),
              child: SafeArea(
                top: true,
                left: false,
                right: false,
                bottom: true,
                minimum: EdgeInsets.only(bottom: safeBottom > 0 ? 0 : 8),
                child: Material(
                  color: const Color(0xFFF4F7FB),
                  child: Container(
                    width: double.infinity,
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(8, 10, 8, 4),
                          child: Row(
                            children: [
                              IconButton(
                                onPressed: () => Get.back(),
                                icon: const Icon(Icons.arrow_back),
                                tooltip: 'Kembali ke Chat Belum Dibaca',
                              ),
                              const SizedBox(width: 4),
                              const Expanded(
                                child: Text(
                                  'Chat Daily Control',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              IconButton(
                                onPressed: () => Get.back(),
                                icon: const Icon(Icons.close),
                                tooltip: 'Kembali ke Chat Belum Dibaca',
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: ListView(
                            controller: scrollController,
                            padding: const EdgeInsets.only(bottom: 8),
                            children: [
                              _buildDetailHeader(),
                              _buildReaderInfo(_activity.readerNames),
                              Container(
                                margin: const EdgeInsets.fromLTRB(8, 0, 8, 0),
                                padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
                                child: _isLoading
                                    ? const Padding(
                                        padding: EdgeInsets.only(
                                            top: 24, bottom: 24),
                                        child: Center(
                                          child: CircularProgressIndicator(),
                                        ),
                                      )
                                    : _comments.isEmpty
                                        ? const Padding(
                                            padding: EdgeInsets.symmetric(
                                              horizontal: 16,
                                              vertical: 36,
                                            ),
                                            child: Center(
                                              child: Text(
                                                'Belum ada chat.',
                                                style: TextStyle(
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w600,
                                                  color: Color(0xFF6B7280),
                                                ),
                                              ),
                                            ),
                                          )
                                        : Padding(
                                            padding: const EdgeInsets.fromLTRB(
                                              4,
                                              0,
                                              4,
                                              0,
                                            ),
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.stretch,
                                              children: _comments
                                                  .map((item) =>
                                                      _buildCommentNode(item))
                                                  .toList(),
                                            ),
                                          ),
                              ),
                            ],
                          ),
                        ),
                        AnimatedPadding(
                          duration: const Duration(milliseconds: 200),
                          padding: EdgeInsets.only(bottom: keyboardInset),
                          child: SafeArea(
                            top: false,
                            left: false,
                            right: false,
                            bottom: true,
                            minimum: EdgeInsets.only(
                              bottom: safeBottom > 0 ? 8 : 12,
                            ),
                            child: Container(
                              decoration: BoxDecoration(
                                color: Colors.white,
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.05),
                                    blurRadius: 8,
                                    offset: const Offset(0, -2),
                                  ),
                                ],
                              ),
                              padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (_replyParentId != null)
                                    Container(
                                      width: double.infinity,
                                      margin: const EdgeInsets.only(bottom: 8),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 8,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFEFF6FF),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: const Color(0xFFBFDBFE),
                                        ),
                                      ),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 3,
                                            height: 20,
                                            decoration: BoxDecoration(
                                              color: const Color(0xFF2563EB),
                                              borderRadius:
                                                  BorderRadius.circular(2),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  'Membalas $_replyParentName',
                                                  style: const TextStyle(
                                                    color: Color(0xFF1E40AF),
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w600,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          InkWell(
                                            onTap: () {
                                              setState(() {
                                                _replyParentId = null;
                                                _replyParentName = '';
                                              });
                                            },
                                            child: const Icon(
                                              Icons.close,
                                              size: 18,
                                              color: Color(0xFF1E40AF),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  if (_commentMediaFiles.isNotEmpty) ...[
                                    SizedBox(
                                      height: 80,
                                      child: ListView.separated(
                                        scrollDirection: Axis.horizontal,
                                        itemCount: _commentMediaFiles.length,
                                        separatorBuilder: (_, __) =>
                                            const SizedBox(width: 8),
                                        itemBuilder: (_, index) {
                                          final file =
                                              _commentMediaFiles[index];
                                          return Stack(
                                            children: [
                                              ClipRRect(
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                                child: Image.file(
                                                  file,
                                                  width: 80,
                                                  height: 80,
                                                  fit: BoxFit.cover,
                                                  errorBuilder: (_, __, ___) =>
                                                      Container(
                                                    width: 80,
                                                    height: 80,
                                                    color:
                                                        const Color(0xFFE5E7EB),
                                                    alignment: Alignment.center,
                                                    child: const Icon(
                                                      Icons
                                                          .broken_image_outlined,
                                                      size: 20,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                              Positioned(
                                                top: 4,
                                                right: 4,
                                                child: InkWell(
                                                  onTap: _isSaving
                                                      ? null
                                                      : () {
                                                          setState(() {
                                                            _commentMediaFiles
                                                                .removeAt(
                                                              index,
                                                            );
                                                          });
                                                        },
                                                  child: Container(
                                                    decoration: BoxDecoration(
                                                      color: Colors.black
                                                          .withValues(
                                                        alpha: 0.65,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              12),
                                                    ),
                                                    padding:
                                                        const EdgeInsets.all(4),
                                                    child: const Icon(
                                                      Icons.close,
                                                      color: Colors.white,
                                                      size: 14,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            ],
                                          );
                                        },
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                  ],
                                  if (_showMentionSuggestions)
                                    Container(
                                      width: double.infinity,
                                      constraints:
                                          const BoxConstraints(maxHeight: 220),
                                      margin: const EdgeInsets.only(bottom: 8),
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(
                                          color: const Color(0xFFE5E7EB),
                                        ),
                                        boxShadow: [
                                          BoxShadow(
                                            color: Colors.black
                                                .withValues(alpha: 0.05),
                                            blurRadius: 10,
                                            offset: const Offset(0, 2),
                                          ),
                                        ],
                                      ),
                                      child: _isMentionLoading
                                          ? const Padding(
                                              padding: EdgeInsets.symmetric(
                                                  vertical: 18),
                                              child: Center(
                                                child: SizedBox(
                                                  width: 20,
                                                  height: 20,
                                                  child:
                                                      CircularProgressIndicator(
                                                    strokeWidth: 2,
                                                  ),
                                                ),
                                              ),
                                            )
                                          : ListView.separated(
                                              shrinkWrap: true,
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                vertical: 6,
                                              ),
                                              itemCount: _mentionTrigger == '@'
                                                  ? _visibleUserMentions.length
                                                  : _visiblePartMentions.length,
                                              separatorBuilder: (_, __) =>
                                                  const Divider(
                                                height: 1,
                                                color: Color(0xFFF1F5F9),
                                              ),
                                              itemBuilder: (context, index) {
                                                if (_mentionTrigger == '@') {
                                                  final user =
                                                      _visibleUserMentions[
                                                          index];
                                                  final alias = user.alias
                                                          .trim()
                                                          .isNotEmpty
                                                      ? user.alias.trim()
                                                      : user
                                                          .preferredDisplayName;
                                                  return InkWell(
                                                    onTap: () =>
                                                        _insertUserMention(
                                                            user),
                                                    child: Padding(
                                                      padding: const EdgeInsets
                                                          .symmetric(
                                                        horizontal: 12,
                                                        vertical: 10,
                                                      ),
                                                      child: Column(
                                                        crossAxisAlignment:
                                                            CrossAxisAlignment
                                                                .start,
                                                        children: [
                                                          Text(
                                                            '@$alias',
                                                            style:
                                                                const TextStyle(
                                                              fontSize: 13,
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w700,
                                                              color: Color(
                                                                  0xFF111827),
                                                            ),
                                                          ),
                                                          if (user.name
                                                              .isNotEmpty) ...[
                                                            const SizedBox(
                                                                height: 2),
                                                            Text(
                                                              user.name,
                                                              style:
                                                                  const TextStyle(
                                                                fontSize: 11,
                                                                color: Color(
                                                                    0xFF6B7280),
                                                              ),
                                                            ),
                                                          ],
                                                        ],
                                                      ),
                                                    ),
                                                  );
                                                }
                                                final item =
                                                    _visiblePartMentions[index];
                                                return InkWell(
                                                  onTap: () =>
                                                      _insertPartMention(item),
                                                  child: Padding(
                                                    padding: const EdgeInsets
                                                        .symmetric(
                                                      horizontal: 12,
                                                      vertical: 10,
                                                    ),
                                                    child: Column(
                                                      crossAxisAlignment:
                                                          CrossAxisAlignment
                                                              .start,
                                                      children: [
                                                        Text(
                                                          '#${item.partName}',
                                                          style:
                                                              const TextStyle(
                                                            fontSize: 13,
                                                            fontWeight:
                                                                FontWeight.w700,
                                                            color: Color(
                                                                0xFF111827),
                                                          ),
                                                        ),
                                                        if (item.subtitle
                                                            .isNotEmpty) ...[
                                                          const SizedBox(
                                                              height: 2),
                                                          Text(
                                                            item.subtitle,
                                                            style:
                                                                const TextStyle(
                                                              fontSize: 11,
                                                              color: Color(
                                                                  0xFF6B7280),
                                                            ),
                                                          ),
                                                        ],
                                                        if (item.notes
                                                            .isNotEmpty) ...[
                                                          const SizedBox(
                                                              height: 2),
                                                          Text(
                                                            item.notes,
                                                            maxLines: 1,
                                                            overflow:
                                                                TextOverflow
                                                                    .ellipsis,
                                                            style:
                                                                const TextStyle(
                                                              fontSize: 11,
                                                              color: Color(
                                                                  0xFF94A3B8),
                                                            ),
                                                          ),
                                                        ],
                                                      ],
                                                    ),
                                                  ),
                                                );
                                              },
                                            ),
                                    ),
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      PopupMenuButton<String>(
                                        icon: const Icon(
                                          Icons.attach_file,
                                          color: Color(0xFF6B7280),
                                        ),
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12),
                                        ),
                                        onSelected: (value) {
                                          if (value == 'camera') {
                                            _pickCommentImage(fromCamera: true);
                                          } else if (value == 'gallery') {
                                            _pickCommentImage(
                                                fromCamera: false);
                                          }
                                        },
                                        itemBuilder: (context) => [
                                          PopupMenuItem(
                                            value: 'camera',
                                            child: Row(
                                              children: const [
                                                Icon(
                                                  Icons.camera_alt_outlined,
                                                  size: 20,
                                                ),
                                                SizedBox(width: 12),
                                                Text('Kamera'),
                                              ],
                                            ),
                                          ),
                                          PopupMenuItem(
                                            value: 'gallery',
                                            child: Row(
                                              children: const [
                                                Icon(
                                                  Icons.photo_library_outlined,
                                                  size: 20,
                                                ),
                                                SizedBox(width: 12),
                                                Text('Galeri'),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                      Expanded(
                                        child: Container(
                                          constraints: const BoxConstraints(
                                            maxHeight: 120,
                                          ),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFF3F4F6),
                                            borderRadius:
                                                BorderRadius.circular(24),
                                          ),
                                          child: TextField(
                                            controller: _inputController,
                                            focusNode: _focusNode,
                                            minLines: 1,
                                            maxLines: 4,
                                            textInputAction:
                                                TextInputAction.send,
                                            onSubmitted: (_) =>
                                                _submitComment(),
                                            style: const TextStyle(
                                              fontSize: 14,
                                              color: Color(0xFF111827),
                                            ),
                                            decoration: const InputDecoration(
                                              hintText: 'Tulis pesan...',
                                              hintStyle: TextStyle(
                                                color: Color(0xFF9CA3AF),
                                              ),
                                              border: InputBorder.none,
                                              contentPadding:
                                                  EdgeInsets.symmetric(
                                                horizontal: 16,
                                                vertical: 10,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Container(
                                        width: 44,
                                        height: 44,
                                        decoration: const BoxDecoration(
                                          color: Color(0xFF2a5298),
                                          shape: BoxShape.circle,
                                        ),
                                        child: IconButton(
                                          onPressed:
                                              _isSaving ? null : _submitComment,
                                          icon: _isSaving
                                              ? const SizedBox(
                                                  width: 20,
                                                  height: 20,
                                                  child:
                                                      CircularProgressIndicator(
                                                    strokeWidth: 2,
                                                    color: Colors.white,
                                                  ),
                                                )
                                              : const Icon(
                                                  Icons.send_rounded,
                                                  color: Colors.white,
                                                  size: 20,
                                                ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

String _dailyControlCompanyFromActivity(DailyControlActivity activity) {
  final assetCode = activity.assetCode.trim();
  if (assetCode.isNotEmpty && assetCode.contains('/')) {
    return shortCompanyLabel(assetCode.split('/').first);
  }
  final woNumber = activity.woNumber.trim();
  if (woNumber.isNotEmpty && woNumber.contains('/')) {
    final parts = woNumber.split('/');
    if (parts.length >= 3) {
      return shortCompanyLabel(parts[2]);
    }
  }
  return '';
}

String _dailyControlPrimaryDetailText(DailyControlActivity activity) {
  final segments = <String>[];
  final company = _dailyControlCompanyFromActivity(activity).trim();
  final asset = activity.assetLabel.trim();
  final detail = activity.title.trim().isNotEmpty
      ? activity.title.trim()
      : activity.notes.trim();
  if (company.isNotEmpty) {
    segments.add(company);
  }
  if (asset.isNotEmpty) {
    segments.add(asset);
  }
  if (detail.isNotEmpty) {
    segments.add(detail);
  }
  return segments.join(' | ');
}

String _dailyControlCompactTime(String raw) {
  final value = raw.trim();
  if (value.isEmpty) {
    return '-';
  }
  if (value.length >= 5) {
    return value.substring(0, 5);
  }
  return value;
}
